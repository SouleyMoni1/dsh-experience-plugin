/**
 * cli-mimic —— host 半区。
 *
 * 在 DSH 中把模型请求伪装成多种 CLI 请求的全局代理插件。配置保存在
 * `cli-mimic` settings 命名空间，浏览器侧统一配置卡片会读取它。
 */
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type ToolRegistry from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace, type SettingsProvider } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import {
  createCustomProfile,
  normalizeStoredProfiles,
  presetById,
  PROFILE_FIELDS,
  type MimicProfile,
  type StoredProfile,
} from './profiles.js'

type AppContext = Context & {
  tools?: ToolRegistry
  settings: SettingsProvider
  credentials?: { resolve(ref: ReturnType<typeof credentialRef>): Promise<{ value: string } | undefined> }
  llm?: {
    listProviders(): Array<{ id: string }>
    listModels(provider: string): Promise<Array<{ id: string }>>
    stream(options: unknown): AsyncIterable<any>
  }
}

const ProfileConfig = z.object({
  id: z.string().default(''),
  name: z.string().default('自定义配置'),
  kind: z.string().default('custom'),
  createdAt: z.number().default(0),
  targetPath: z.string().default('/codex/responses'),
  port: z.number().default(4123),
  host: z.string().default('127.0.0.1'),
  upstreamBaseUrl: z.string().default(''),
  apiKeyEnv: z.string().default(''),
  authorizationPrefix: z.string().default('Bearer'),
  userAgent: z.string().default(''),
  originator: z.string().default(''),
  installationId: z.string().default(''),
  addClientMetadata: z.boolean().default(true),
  extraHeadersJson: z.string().default('{}'),
  extraBodyJson: z.string().default('{}'),
})

export interface Config {
  enabled: boolean
  activeProfileId: string
  profiles: Record<string, StoredProfile>
  port: number
  host: string
  upstreamBaseUrl: string
  apiKeyEnv: string
  authorizationPrefix: string
  userAgent: string
  originator: string
  installationId: string
  addClientMetadata: boolean
  extraHeadersJson: string
  extraBodyJson: string
}

export const Config = z.object({
  enabled: z.boolean().default(false),
  activeProfileId: z.string().default('codex'),
  profiles: z.dict(ProfileConfig).default({}),
  port: z.number().default(4123),
  host: z.string().default('127.0.0.1'),
  upstreamBaseUrl: z.string().default(''),
  apiKeyEnv: z.string().default(''),
  authorizationPrefix: z.string().default('Bearer'),
  userAgent: z.string().default('codex_cli_rs/0.148.0 (Windows 10.0; x86_64) WindowsTerminal'),
  originator: z.string().default('codex_cli_rs'),
  installationId: z.string().default(''),
  addClientMetadata: z.boolean().default(true),
  extraHeadersJson: z.string().default('{}'),
  extraBodyJson: z.string().default('{}'),
}) as unknown as z<Config>

const DEFAULT_USER_AGENT = 'codex_cli_rs/0.148.0 (Windows 10.0; x86_64) WindowsTerminal'
const DEFAULT_ORIGINATOR = 'codex_cli_rs'
export const CLI_MIMIC_NS = settingsNamespace('cli-mimic')

interface RuntimeConfig {
  enabled: boolean
  activeProfileId: string
  targetPath: string
  port: number
  host: string
  upstreamBaseUrl: string
  apiKeyEnv: string
  authorizationPrefix: string
  userAgent: string
  originator: string
  installationId: string
  addClientMetadata: boolean
  extraHeaders: Record<string, string>
  extraBody: Record<string, unknown>
}

interface ProxyState {
  config: RuntimeConfig
  actualPort: number
  forwarded: number
  intercepted: number
  lastError: string
  startedAt: number
}

let originalFetchRef: typeof fetch | undefined

const LEGACY_RUNTIME_KEYS = ['port', 'host', 'upstreamBaseUrl', 'apiKeyEnv', 'authorizationPrefix', 'installationId'] as const

function parseJsonObject(text: string, fallback: Record<string, unknown>): Record<string, unknown> {
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
  } catch {
    return fallback
  }
}

function normalizeConfig(input: Partial<Config>): RuntimeConfig {
  const profiles = normalizeStoredProfiles(input.profiles)
  const activeProfileId = input.activeProfileId && (profiles[input.activeProfileId] || presetById(input.activeProfileId))
    ? input.activeProfileId
    : 'codex'
  const preset = presetById(activeProfileId) ?? presetById('codex')!
  const stored = profiles[activeProfileId]
  const source: MimicProfile = stored
    ? { ...preset, ...stored }
    : { ...preset }

  // Old single-config namespaces keep their global runtime fields, while the
  // request fingerprint itself still comes from the latest code-owned preset.
  if (!stored) {
    for (const key of LEGACY_RUNTIME_KEYS) {
      const legacy = (input as Record<string, unknown>)[key]
      if (legacy !== undefined && legacy !== null) {
        ;(source as unknown as Record<string, unknown>)[key] = legacy
      }
    }
  }

  const extraHeaders = parseJsonObject(source.extraHeadersJson ?? input.extraHeadersJson ?? '{}', {})
  const extraBody = parseJsonObject(source.extraBodyJson ?? input.extraBodyJson ?? '{}', {})
  return {
    enabled: input.enabled ?? false,
    activeProfileId,
    targetPath: source.targetPath || preset.targetPath,
    port: source.port || 4123,
    host: source.host || '127.0.0.1',
    upstreamBaseUrl: source.upstreamBaseUrl ?? '',
    apiKeyEnv: source.apiKeyEnv ?? '',
    authorizationPrefix: source.authorizationPrefix || 'Bearer',
    userAgent: source.userAgent || DEFAULT_USER_AGENT,
    originator: source.originator ?? '',
    installationId: source.installationId || randomUUID(),
    addClientMetadata: source.addClientMetadata ?? true,
    extraHeaders: Object.fromEntries(Object.entries(extraHeaders).map(([key, value]) => [key, String(value)])),
    extraBody,
  }
}

function statusOf(state: ProxyState): Record<string, unknown> {
  const { config, actualPort, forwarded, intercepted, lastError, startedAt } = state
  return {
    enabled: config.enabled,
    activeProfileId: config.activeProfileId,
    targetPath: config.targetPath,
    ready: actualPort > 0,
    proxyUrl: actualPort > 0 ? `http://${config.host}:${actualPort}` : '',
    upstreamBaseUrl: config.upstreamBaseUrl,
    apiKeyEnv: config.apiKeyEnv,
    userAgent: config.userAgent,
    originator: config.originator,
    installationId: config.installationId,
    addClientMetadata: config.addClientMetadata,
    forwarded,
    intercepted,
    lastError,
    startedAt,
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function headerRecord(headers: IncomingMessage['headers']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    out[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return out
}

function targetUrl(upstreamBaseUrl: string, requestUrl: string, cfg: RuntimeConfig): string {
  const base = upstreamBaseUrl.trim().replace(/\/+$/, '')
  const queryIndex = requestUrl.indexOf('?')
  const query = queryIndex >= 0 ? requestUrl.slice(queryIndex) : ''
  const endpoint = (cfg.targetPath || '/codex/responses').toLowerCase()
  if (endpoint === '/messages') {
    if (/\/v\d+(?:\.\d+)?$/i.test(base)) return `${base}/messages${query}`
    return `${base}/v1/messages${query}`
  }
  if (endpoint === '/responses') {
    if (/\/responses$/i.test(base)) return `${base}${query}`
    if (/\/codex$/i.test(base)) return `${base}/responses${query}`
    if (/\/v\d+(?:\.\d+)?$/i.test(base)) return `${base}/responses${query}`
    return `${base}/v1/responses${query}`
  }
  if (/\/responses$/i.test(base)) return `${base}${query}`
  if (/\/codex$/i.test(base)) return `${base}/responses${query}`
  if (/\/v\d+(?:\.\d+)?$/i.test(base)) return `${base}/codex/responses${query}`
  return `${base}/codex/responses${query}`
}

function clientMetadata(cfg: RuntimeConfig, payload: Record<string, unknown>): Record<string, unknown> {
  const sessionId = typeof payload.prompt_cache_key === 'string' && payload.prompt_cache_key
    ? payload.prompt_cache_key
    : randomUUID()
  const turnId = randomUUID()
  const installationId = cfg.installationId || randomUUID()
  return {
    installation_id: installationId,
    session_id: sessionId,
    thread_id: sessionId,
    agent_name: 'dsh',
    turn_id: turnId,
    window_id: `${sessionId}:0`,
    request_kind: 'turn',
    root_turn_id: turnId,
    sandbox: '',
    sandbox_mode: 'read-only',
    auto_review_enabled: 'false',
    node_repl_auto_review_required: 'false',
    node_repl_disabled: 'false',
    turn_started_at_unix_ms: String(Date.now()),
  }
}

function rewriteBody(headers: Record<string, string>, body: Buffer, cfg: RuntimeConfig): Buffer {
  const wasZstd = headers['content-encoding']?.toLowerCase() === 'zstd'
  const raw = wasZstd ? zstdDecompressSync(body) : body
  const text = raw.toString('utf8')
  let nextText = text
  try {
    const payload = JSON.parse(text) as Record<string, unknown>
    if (payload && typeof payload === 'object') {
      if (cfg.addClientMetadata) {
        const metadata = clientMetadata(cfg, payload)
        payload.client_metadata = metadata
        headers['x-codex-turn-metadata'] = JSON.stringify(metadata)
        if (typeof metadata.window_id === 'string') headers['x-codex-window-id'] = metadata.window_id
      }
      Object.assign(payload, cfg.extraBody)
      nextText = JSON.stringify(payload)
    }
  } catch {
    // Non-JSON bodies pass through untouched.
  }
  const next = Buffer.from(nextText, 'utf8')
  if (wasZstd || headers['content-encoding']?.toLowerCase() === 'zstd') {
    headers['content-encoding'] = 'zstd'
    return zstdCompressSync(next)
  }
  delete headers['content-encoding']
  return next
}

function rewriteHeaders(headers: Record<string, string>, cfg: RuntimeConfig, target: string): Record<string, string> {
  const out: Record<string, string> = { ...headers }
  delete out['content-length']
  delete out['connection']
  delete out['transfer-encoding']
  delete out['proxy-connection']
  delete out['upgrade']
  delete out['accept-encoding']
  delete out['x-mimic-target']
  delete out['x-mimic-original-method']
  for (const key of Object.keys(out)) {
    if (key.toLowerCase().startsWith('x-stainless-')) delete out[key]
  }
  out['host'] = new URL(target).host
  out['accept-encoding'] = 'identity'
  out['accept'] = 'text/event-stream'
  out['user-agent'] = cfg.userAgent
  if (cfg.originator) out['originator'] = cfg.originator
  else delete out['originator']
  if (cfg.installationId) out['x-codex-installation-id'] = cfg.installationId
  for (const [key, value] of Object.entries(cfg.extraHeaders)) {
    if (value === null || value === '') delete out[key]
    else out[key] = value
  }
  return out
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(text)) })
  res.end(text)
}

async function handleProxyRequest(req: IncomingMessage, res: ServerResponse, state: ProxyState, ctx: AppContext): Promise<void> {
  if (req.method !== 'POST' || !req.url?.includes('/mimic')) {
    sendJson(res, 404, { error: 'expected POST /mimic' })
    return
  }
  const cfg = state.config
  const originalTarget = req.headers['x-mimic-target']
  const target = cfg.upstreamBaseUrl
    ? targetUrl(cfg.upstreamBaseUrl, req.url ?? '/responses', cfg)
    : typeof originalTarget === 'string' && originalTarget
      ? originalTarget
      : ''

  if (!target) {
    sendJson(res, 503, { error: 'no upstream target; set upstreamBaseUrl in the plugin settings page' })
    return
  }

  const headers = rewriteHeaders(headerRecord(req.headers), cfg, target)
  const body = await readBody(req)
  const forwardedBody = rewriteBody(headers, body, cfg)
  headers['content-length'] = String(forwardedBody.length)

  if (cfg.apiKeyEnv) {
    if (!ctx.credentials) {
      sendJson(res, 502, { error: 'credentials service unavailable' })
      return
    }
    try {
      const resolved = await ctx.credentials.resolve(credentialRef(cfg.apiKeyEnv))
      if (!resolved) {
        sendJson(res, 502, { error: `credential ${cfg.apiKeyEnv} is not set` })
        return
      }
      headers['authorization'] = `${cfg.authorizationPrefix} ${resolved.value}`
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error)
      sendJson(res, 502, { error: state.lastError })
      return
    }
  }

  try {
    const upstream = await (originalFetchRef ?? fetch)(target, {
      method: 'POST',
      headers,
      body: forwardedBody.buffer.slice(forwardedBody.byteOffset, forwardedBody.byteOffset + forwardedBody.byteLength) as ArrayBuffer,
    })
    state.forwarded += 1
    const responseHeaders: Record<string, string | string[]> = {}
    upstream.headers.forEach((value, key) => {
      const existing = responseHeaders[key]
      if (existing === undefined) responseHeaders[key] = value
      else if (Array.isArray(existing)) existing.push(value)
      else responseHeaders[key] = [existing, value]
    })
    res.writeHead(upstream.status, responseHeaders)
    if (upstream.body) {
      Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream).pipe(res)
    } else {
      res.end()
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error)
    sendJson(res, 502, { error: state.lastError })
  }
}

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

function isModelRequest(url: string, init: FetchInit | undefined, state: ProxyState): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1') return false
    if (parsed.port === String(state.config.port)) return false
  } catch {
    return false
  }
  const method = (init?.method ?? 'GET').toUpperCase()
  if (method !== 'POST') return false
  const body = typeof init?.body === 'string' ? init.body : ''
  if (!body) return false
  if (!body.includes('"model"')) return false
  return /"messages"|"input"|"prompt"|"contents"|"system"|"tools"|"instructions"/.test(body)
}

function installFetchPatch(state: ProxyState, originalFetch: typeof fetch): void {
  const patched = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (isModelRequest(url, init, state)) {
      state.intercepted += 1
      const headers = new Headers(init?.headers)
      headers.set('x-mimic-target', url)
      headers.set('x-mimic-original-method', init?.method ?? 'POST')
      const proxyUrl = `http://${state.config.host}:${state.config.port}/mimic`
      return originalFetch(proxyUrl, {
        ...(init ?? {}),
        method: 'POST',
        headers,
        body: init?.body,
      })
    }
    return originalFetch(input, init)
  }
  globalThis.fetch = patched as typeof fetch
}

async function probeProvider(ctx: AppContext, provider: string, model: string, prompt: string): Promise<string> {
  const llm = ctx.llm
  if (!llm?.stream) return 'llm service unavailable'
  const message = createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })
  let text = ''
  let error = ''
  try {
    for await (const chunk of llm.stream({
      provider,
      model,
      messages: [message],
    })) {
      if (chunk.type === 'text-delta') text += chunk.text
      if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
        error = chunk.reason.failure?.message ?? String(chunk.reason)
      }
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
  }
  if (text) return `reply: ${text.slice(0, 4000)}`
  return `probe failed: ${error || 'empty reply'}`
}

export function applyCliMimic(ctx: AppContext): void {
  const state: ProxyState = {
    config: normalizeConfig({}),
    actualPort: 0,
    forwarded: 0,
    intercepted: 0,
    lastError: '',
    startedAt: 0,
  }
  const servers = new Set<Server>()
  const logger = ctx.logger('cli-mimic')
  let originalFetch: typeof fetch | undefined
  let fetchPatched = false

  function startServer(): void {
    const cfg = state.config
    const server = createServer((req, res) => {
      void handleProxyRequest(req, res, state, ctx).catch((error) => {
        state.lastError = error instanceof Error ? error.message : String(error)
        if (!res.headersSent) sendJson(res, 500, { error: state.lastError })
        else res.destroy()
      })
    })
    servers.add(server)
    server.on('error', (error: NodeJS.ErrnoException) => {
      state.lastError = error.message
      if (error.code === 'EADDRINUSE' && cfg.port !== 0) {
        logger.warn(`port ${cfg.port} in use, falling back to an OS-assigned port`)
        server.close()
        servers.delete(server)
        state.config = { ...state.config, port: 0 }
        startServer()
        return
      }
      logger.error(`proxy listen failed: ${error.message}`)
    })
    server.listen(cfg.port, cfg.host, () => {
      const address = server.address() as AddressInfo
      state.actualPort = address.port
      state.startedAt = Date.now()
      state.lastError = ''
      logger.info(`CLI mimic proxy on http://${cfg.host}:${address.port}`)
    })
  }

  function restartServer(): void {
    for (const server of [...servers]) {
      server.close()
      servers.delete(server)
    }
    state.actualPort = 0
    startServer()
  }

  function applyFetchPatch(): void {
    if (fetchPatched || !state.config.enabled) return
    originalFetch = globalThis.fetch.bind(globalThis)
    originalFetchRef = originalFetch
    installFetchPatch(state, originalFetch)
    fetchPatched = true
  }

  function removeFetchPatch(): void {
    if (!fetchPatched) return
    if (originalFetch) globalThis.fetch = originalFetch
    fetchPatched = false
    originalFetch = undefined
    originalFetchRef = undefined
  }

  function syncFetchPatch(): void {
    if (state.config.enabled) applyFetchPatch()
    else removeFetchPatch()
  }

  let scope: ReturnType<SettingsProvider['register']> | undefined
  try {
    scope = ctx.settings.register(CLI_MIMIC_NS, Config, { applies: 'live' })
  } catch (error) {
    logger.debug('cli-mimic namespace already registered: %s', (error as Error).message)
  }
  if (scope !== undefined) {
    state.config = normalizeConfig(scope.get() as Partial<Config>)
    const watchDispose = scope.watch((next, prev) => {
      const oldPort = (prev as Partial<Config> | undefined)?.port ?? state.config.port
      state.config = normalizeConfig(next as Partial<Config>)
      if (state.config.port !== oldPort) restartServer()
      syncFetchPatch()
    })
    ctx.effect(() => () => watchDispose(), 'cli-mimic: settings watch')
  }

  startServer()
  syncFetchPatch()

  ctx.effect(() => () => {
    removeFetchPatch()
    for (const server of [...servers]) {
      server.close()
      server.closeAllConnections?.()
    }
    servers.clear()
  }, 'cli-mimic: cleanup')

  if (ctx.tools) {
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'cli_mimic_status',
      description: '查看 CLI 请求模拟代理状态',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
      },
      async execute() {
        return JSON.stringify(statusOf(state), null, 2)
      },
    })), 'cli-mimic: status tool')

    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'cli_mimic_configure',
      description: '更新 CLI 请求模拟插件设置（设置页同源）',
      parameters: {
        enabled: { type: 'boolean', description: '是否全局开启模拟' },
        activeProfileId: { type: 'string', description: '当前生效配置 ID（预设或自定义）' },
        profileId: { type: 'string', description: '要修改的自定义配置 ID；缺省修改当前配置' },
        profileName: { type: 'string', description: '自定义配置名称' },
        profilesJson: { type: 'string', description: '自定义配置字典 JSON，键为配置 ID' },
        targetPath: { type: 'string', description: '请求路径形态：/codex/responses、/responses、/messages' },
        port: { type: 'integer', description: '本地代理端口' },
        host: { type: 'string', description: '本地代理监听地址' },
        upstreamBaseUrl: { type: 'string', description: '目标上游 base URL，留空则保留原请求地址' },
        apiKeyEnv: { type: 'string', description: '凭证环境变量名' },
        authorizationPrefix: { type: 'string', description: 'Authorization 前缀，默认 Bearer' },
        userAgent: { type: 'string', description: '伪造的 User-Agent' },
        originator: { type: 'string', description: '伪造的 originator，留空则不发送' },
        installationId: { type: 'string', description: '伪造的安装 id' },
        addClientMetadata: { type: 'boolean', description: '是否注入 client_metadata' },
        extraHeadersJson: { type: 'string', description: '额外请求头 JSON' },
        extraBodyJson: { type: 'string', description: '额外请求体 JSON' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
      },
      async execute(args: Record<string, unknown>) {
        const current = ctx.settings.get(CLI_MIMIC_NS) as Partial<Config>
        const profiles = normalizeStoredProfiles(current.profiles)
        const nextProfiles = { ...profiles }
        let active = typeof args.activeProfileId === 'string' && args.activeProfileId
          && (nextProfiles[args.activeProfileId] || presetById(args.activeProfileId))
          ? args.activeProfileId
          : current.activeProfileId || 'codex'

        if (typeof args.profilesJson === 'string' && args.profilesJson.trim()) {
          try {
            const parsed = JSON.parse(args.profilesJson) as unknown
            Object.assign(nextProfiles, normalizeStoredProfiles(parsed))
          } catch {
            return `failed: profilesJson is not valid JSON`
          }
        }

        const profilePatch: Partial<MimicProfile> = {}
        for (const key of PROFILE_FIELDS) {
          if (key === 'name' && args.profileName !== undefined) profilePatch.name = String(args.profileName)
          else if (args[key] !== undefined) (profilePatch as Record<string, unknown>)[key] = args[key]
        }
        if (args.port !== undefined && typeof args.port === 'number') profilePatch.port = args.port

        if (Object.keys(profilePatch).length > 0) {
          const target = typeof args.profileId === 'string' && args.profileId
            ? args.profileId
            : active
          const existing = nextProfiles[target]
          if (existing) {
            nextProfiles[target] = { ...existing, ...profilePatch }
          } else {
            const preset = presetById(target) ?? presetById('codex')!
            const legacyBase: Partial<MimicProfile> = {}
            for (const key of LEGACY_RUNTIME_KEYS) {
              const value = (current as Record<string, unknown>)[key]
              if (value !== undefined && value !== null) (legacyBase as Record<string, unknown>)[key] = value
            }
            const custom = createCustomProfile(profilePatch.name || `${preset.name} 自定义`, {
              ...preset,
              ...legacyBase,
              ...profilePatch,
            })
            nextProfiles[custom.id] = custom
            active = custom.id
          }
        }

        const patch: Record<string, unknown> = {
          profiles: nextProfiles,
          activeProfileId: active,
        }
        if (args.enabled !== undefined) patch.enabled = args.enabled
        await ctx.settings.update(CLI_MIMIC_NS, patch)
        return JSON.stringify(statusOf(state), null, 2)
      },
    })), 'cli-mimic: configure tool')

    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'cli_mimic_probe',
      description: '用 DSH 现有 provider 发一次探针请求验证全局模拟',
      parameters: {
        provider: { type: 'string', description: 'provider id' },
        model: { type: 'string', description: '模型 id' },
        prompt: { type: 'string', description: '探针 prompt' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
      },
      async execute(args: { provider?: string; model?: string; prompt?: string }) {
        if (!ctx.llm) return 'probe failed: llm service unavailable'
        const providers = ctx.llm.listProviders()
        const provider = args.provider || providers[0]?.id
        if (!provider) return 'probe failed: no provider available'
        let model = args.model
        if (!model) {
          try {
            const models = await ctx.llm.listModels(provider)
            model = models[0]?.id
          } catch {
            model = undefined
          }
        }
        if (!model) return `probe failed: no model available for ${provider}`
        return probeProvider(ctx, provider, model, args.prompt || 'Reply with the single word ok.')
      },
    })), 'cli-mimic: probe tool')
  }
}
