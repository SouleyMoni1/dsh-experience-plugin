/**
 * mcp-manager —— host 半区：托管 MCP 服务器注册表并动态装配。
 *
 * dsh 原生加载 MCP 的方式是 @deepseek-ai/dsh-mcp-client 插件实例（cordis.yml
 * 里每个服务器一个实例）。本模块不碰 cordis.yml，而是维护自己的注册表
 * （settings 命名空间 dsh-experience-mcp-manager），host 侧把 enabled 的服务器
 * 用 ctx.plugin({ inject, apply: applyMcpClient }, config) 动态装配成 mcp-client
 * 子插件：
 *   - 新增 / 导入 / 开关都写注册表 → settings 变更 → watch 触发对账（reconcile）；
 *   - 对账只对「已启用」的服务器启动子插件 fiber，关闭/删除则 dispose 掉；
 *   - mcp-client 自身支持 HMR 热替换，配置变化会断开重连，工具名 mcp__<name>__<tool>
 *     稳定复现。
 *
 * RPC 通道 /dsh-mcp-manager（connection.rpc，loopback）：
 *   mcp/manager/list · mcp/manager/add · mcp/manager/import · mcp/manager/toggle
 */
import type { Context, Fiber } from '@deepseek-ai/cordis'
import { apply as applyMcpClient, type Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { ConnectionRpcResult as RpcResult } from '@deepseek-ai/dsh-client-connection'
import { provideRpcChannel } from '../rpc-channel.js'
import { applyPatchRemoval, applyPatchToggle, patchFileDefinesEntry, patchIdOf, readPatchText, resolveProfilePatchFile, writePatchText } from './patch-file.js'
import { MCP_MANAGER_NS, McpManagerSettingsSchema, type ManagedMcpServer, type McpManagerSettings } from './settings.js'

/** 本模块 RPC 通道（绝对路径前缀，独立于其他模块）。 */
export const MCP_MANAGER_RPC_CHANNEL = '/dsh-mcp-manager'
/** 列出注册表 + 当前已装载的服务器。 */
export const MCP_MANAGER_LIST = 'mcp/manager/list'
/** 新增一个 MCP 服务器（enabled=true）。 */
export const MCP_MANAGER_ADD = 'mcp/manager/add'
/** 从 JSON（.mcp.json 服务器表 / 单个服务器配置 / 配置数组）导入服务器。 */
export const MCP_MANAGER_IMPORT = 'mcp/manager/import'
/** 开启/关闭一个已注册的 MCP 服务器。 */
export const MCP_MANAGER_TOGGLE = 'mcp/manager/toggle'
/** 改 / 删 profile patch 层里的 loader 条目（「已安装」区的关与卸载）。 */
export const MCP_MANAGER_PATCH = 'mcp/manager/patch'

/**
 * dsh 原生 MCP 服务器的模块名 —— loader 条目按此识别。
 * cordis.patch.yml 里每个服务器都是一条 `name: '@deepseek-ai/dsh-mcp-client'` 的条目，
 * 其 `options.config.serverName` 才是模型侧命名空间。
 */
const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'

/** serverName 约束（对齐 @deepseek-ai/dsh-mcp-client：`[A-Za-z0-9_-]{1,32}`）。 */
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/

/** 校验 serverName 是否合法。 */
export function isValidServerName(name: string): boolean {
  return SERVER_NAME_RE.test(name)
}

/** 把注册表条目转换成 mcp-client 的 Config。 */
export function entryToMcpClientConfig(server: ManagedMcpServer): McpClientConfig {
  if (server.transport === 'streamable-http') {
    return {
      transport: 'streamable-http',
      serverName: server.name,
      url: server.url,
      headers: server.headers ?? {},
      toolCallTimeoutMs: 60000,
      failOnStartupError: false,
    }
  }
  return {
    transport: 'stdio',
    serverName: server.name,
    command: server.command,
    args: server.args ?? [],
    env: server.env ?? {},
    cwd: server.cwd || '',
    toolCallTimeoutMs: 60000,
    failOnStartupError: false,
  }
}

/**
 * 一条由 DSH loader 装配的 MCP 服务器（cordis.patch.yml / 其他 bundle 的 mcp-client 条目）。
 * 这不是本插件的托管注册表——卡片对它只读展示，不提供开关（改动要写 loader 组合）。
 */
export interface InstalledMcpServer {
  /** serverName：模型侧命名空间 mcp__<name>__<tool>。 */
  name: string
  /** loader 条目 id（cordis.patch.yml 里写的 id）。 */
  entryId: string
  /** 传输方式（配置里读到的原样字符串，未识别时为 'stdio'）。 */
  transport: string
  /** 可读摘要：stdio 的 command，或 http 的 url。 */
  summary: string
  /** loader 条目是否启用（已含祖先 group 的禁用）。 */
  enabled: boolean
  /** 该服务器当前真正注册进工具面的工具名（mcp__<name>__<tool>）。 */
  tools: string[]
  /** 该条目是否由用户 patch 文件定义（可关、可卸载）；false 表示来自 bundle 层。 */
  editable: boolean
}

/** list 返回值。 */
export interface McpManagerView {
  /** 注册表全部条目（含 enabled 标记）。 */
  servers: ManagedMcpServer[]
  /** 当前已动态装配（enabled 且启动成功）的服务器名。 */
  live: string[]
  /** loader 装配的外部 MCP 服务器——「已安装」的真相。 */
  installed: InstalledMcpServer[]
}

/** loader 条目在读取侧的最小结构化面（不引入 cordis-plugin-loader 的类型依赖）。 */
interface LoaderEntryLike {
  readonly id: string
  readonly disabled: boolean
  readonly options: { readonly name?: string; readonly config?: unknown }
}

/** loader 服务在读取侧的最小结构化面。 */
interface LoaderLike {
  entries(): Iterable<LoaderEntryLike>
}

/** 工具注册表在读取侧的最小结构化面。 */
interface ToolRegistryLike {
  schemas(): { name: string }[]
}

/** 新增条目所需的输入（enabled 固定为 true）。 */
export type McpServerInput = Omit<ManagedMcpServer, 'enabled'>

/** 校验一个服务器条目（新增用）：返回错误信息或 null。 */
export function validateServerInput(input: McpServerInput): string | null {
  if (!isValidServerName(input.name)) return 'server name must match [A-Za-z0-9_-]{1,32}'
  if (input.transport === 'stdio' && input.command.trim() === '') return 'stdio server requires a command'
  if (input.transport === 'streamable-http' && !/^https?:\/\/.+/.test(input.url)) return 'streamable-http server requires an http(s) url'
  return null
}

/** 把任意来源的服务器配置对象规范化为注册表条目。 */
export function normalizeServerEntry(key: string, raw: Record<string, unknown>): ManagedMcpServer {
  const transport = raw.transport === 'streamable-http' || (typeof raw.url === 'string' && raw.url !== '' && raw.command === undefined)
    ? 'streamable-http'
    : 'stdio'
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const strArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  const strDict = (v: unknown): Record<string, string> => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v)) if (typeof val === 'string') out[k] = String(val)
    return out
  }
  return {
    name: key,
    transport,
    enabled: true,
    command: str(raw.command),
    args: strArr(raw.args),
    env: strDict(raw.env),
    cwd: str(raw.cwd),
    url: str(raw.url),
    headers: strDict(raw.headers),
  }
}

/** 构造 RPC 错误。 */
function rpcError(message: string): RpcResult<never> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/**
 * 从已注册的工具名里解析出 MCP 服务器命名空间。
 *
 * mcp-client 的公开名是 `mcp__<serverName>__<rawName>`，但 serverName 本身
 * 允许 `_`（`[A-Za-z0-9_-]{1,32}`），所以「取第一个 `__`」会切错
 * （serverName `a__b` 会被读成 `a`）。因此优先用已知服务器名做**最长前缀**匹配，
 * 只有查不到已知名单时才退回首次切分。
 * @param toolName - 工具注册名。
 * @param known - 已知的 serverName 集合（loader 条目里读到的）。
 * @returns serverName；不是 MCP 工具时为 undefined。
 */
export function mcpServerOfToolName(toolName: string, known?: ReadonlySet<string>): string | undefined {
  if (!toolName.startsWith('mcp__')) return undefined
  const rest = toolName.slice(5)
  let best: string | undefined
  for (const name of known ?? []) {
    if (!rest.startsWith(name + '__')) continue
    if (best === undefined || name.length > best.length) best = name
  }
  if (best !== undefined) return best
  const separator = rest.indexOf('__')
  if (separator <= 0) return undefined
  return rest.slice(0, separator)
}

/**
 * 汇总「已安装」的外部 MCP 服务器：loader 条目（真相）+ 真实工具面（是否连上）。
 *
 * 两个来源缺一不可：loader 条目说明「配置里装了什么」，工具面说明
 * 「现在真的活着什么」——mcp-client 启动失败时条目仍在，但没有任何工具注册。
 *
 * `managed` 是本插件自己托管的服务器名：它们的工具同样以 `mcp__` 出现在工具面，
 * 但会在「插件托管」区单独列出，必须在这里排除，否则同一个服务器被报两次。
 * @param ctx - host 插件上下文（读取 loader 与 tools 服务）。
 * @param managed - 本插件托管注册表里的服务器名（不计入「已安装」）。
 * @param editable - patch 文件里定义的条目 id 集合（决定能否关 / 卸载）。
 * @returns 外部 MCP 服务器列表（按 serverName 排序）。
 */
export function collectInstalledMcpServers(
  ctx: Context,
  managed: ReadonlySet<string> = new Set(),
  editable: ReadonlySet<string> = new Set(),
): InstalledMcpServer[] {
  const loader = ctx.get('loader') as LoaderLike | undefined
  const registry = ctx.get('tools') as ToolRegistryLike | undefined

  // 第一遍：loader 条目 → serverName 名单 + 配置摘要（已安装的真相）。
  const out: InstalledMcpServer[] = []
  const seen = new Set<string>()
  for (const entry of loader?.entries() ?? []) {
    if (entry.options.name !== MCP_CLIENT_MODULE) continue
    const config = entry.options.config as Record<string, unknown> | undefined
    const name = typeof config?.serverName === 'string' ? config.serverName : ''
    if (name === '' || seen.has(name) || managed.has(name)) continue
    seen.add(name)
    const transport = typeof config?.transport === 'string' ? config.transport : 'stdio'
    const summary = transport === 'streamable-http'
      ? (typeof config?.url === 'string' ? config.url : '')
      : (typeof config?.command === 'string' ? config.command : '')
    out.push({
      name,
      entryId: entry.id,
      transport,
      summary,
      enabled: !entry.disabled,
      tools: [],
      editable: editable.has(patchIdOf(entry.id)),
    })
  }

  // 第二遍：真实工具面 → 按最长前缀归属到服务器（含 loader 里没有的动态装配者）。
  const byName = new Map(out.map((server) => [server.name, server]))
  const known = new Set(byName.keys())
  for (const schema of registry?.schemas() ?? []) {
    const name = mcpServerOfToolName(schema.name, known)
    if (name === undefined || managed.has(name)) continue
    const server = byName.get(name)
    if (server !== undefined) {
      server.tools.push(schema.name)
      continue
    }
    const added: InstalledMcpServer = {
      name, entryId: '', transport: '', summary: '', enabled: true, tools: [schema.name], editable: false,
    }
    byName.set(name, added)
    known.add(name)
    out.push(added)
  }

  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 从 JSON 文本解析服务器列表（.mcp.json 形态 / 单个 / 数组）。
 * 返回规范化条目；解析失败返回 null 并带错误信息。
 */
export function parseServerJson(json: string): { servers: ManagedMcpServer[]; error?: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    return { servers: [], error: 'invalid json: ' + (error instanceof Error ? error.message : String(error)) }
  }
  const entries: ManagedMcpServer[] = []
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
      const name = typeof (item as Record<string, unknown>).name === 'string' ? (item as Record<string, unknown>).name as string : ''
      if (name === '') continue
      entries.push(normalizeServerEntry(name, item as Record<string, unknown>))
    }
    return { servers: entries }
  }
  if (parsed === null || typeof parsed !== 'object') return { servers: [], error: 'expected a .mcp.json document, a server map, or an array' }
  const obj = parsed as Record<string, unknown>
  // 单个服务器配置：{ name, command|url, ... }
  if (typeof obj.name === 'string' && obj.name !== '' && (typeof obj.command === 'string' || typeof obj.url === 'string')) {
    return { servers: [normalizeServerEntry(obj.name, obj)] }
  }
  // .mcp.json 形态：{ servers: { name: {...} } }
  const serverMap = obj.servers !== undefined && obj.servers !== null && typeof obj.servers === 'object' && !Array.isArray(obj.servers)
    ? obj.servers as Record<string, unknown>
    : obj
  for (const [key, value] of Object.entries(serverMap)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    entries.push(normalizeServerEntry(key, value as Record<string, unknown>))
  }
  return { servers: entries }
}

/**
 * 通道端点分发（独立导出便于测试：deps 提供注册表读写与实时名单）。
 * @param endpoint - 通道内端点（mcp/manager/*）。
 * @param payload - 请求体。
 * @param deps - host 装配期注入的读写能力。
 */
export async function dispatchMcpManagerRpc(
  endpoint: string,
  payload: unknown,
  deps: {
    /** 当前注册表。 */
    servers(): ManagedMcpServer[]
    /** 持久化整份注册表（触发 settings 变更 → reconcile）。 */
    replace(next: ManagedMcpServer[]): Promise<void>
    /** 当前已装载的服务器名。 */
    live(): string[]
    /** loader 装配的外部 MCP 服务器。 */
    installed(): InstalledMcpServer[]
    /** profile patch 层的读写面（已安装条目的关 / 卸载）。 */
    patch(): PatchLayer
  },
): Promise<RpcResult<unknown>> {
  try {
    return await dispatchMcpManagerRpcInner(endpoint, payload, deps)
  } catch (error) {
    return rpcError(error instanceof Error ? error.message : String(error))
  }
}

/** profile patch 层的最小读写面。 */
export interface PatchLayer {
  /** patch 文件绝对路径；null 表示定位不到（例如从仓库 junction 加载）。 */
  file: string | null
  /** patch 文件里定义的条目 id（可关 / 可卸载）。 */
  editable(): string[]
  /** 关 / 开一个条目。 */
  toggle(id: string, enabled: boolean): Promise<void>
  /** 从 patch 文件里删掉条目定义。 */
  remove(id: string): Promise<void>
}

/** dispatch 内部实现（被外部 try/catch 包裹，避免未处理拒绝）。 */
async function dispatchMcpManagerRpcInner(
  endpoint: string,
  payload: unknown,
  deps: {
    servers(): ManagedMcpServer[]
    replace(next: ManagedMcpServer[]): Promise<void>
    live(): string[]
    /** loader 装配的外部 MCP 服务器。 */
    installed(): InstalledMcpServer[]
    /** profile patch 层的读写面（已安装条目的关 / 卸载）。 */
    patch(): PatchLayer
  },
): Promise<RpcResult<unknown>> {
  if (endpoint === MCP_MANAGER_LIST) {
    return {
      ok: true,
      value: { servers: deps.servers(), live: deps.live(), installed: deps.installed() } satisfies McpManagerView,
    }
  }
  if (endpoint === MCP_MANAGER_ADD) {
    const body = payload as Partial<ManagedMcpServer> | undefined
    if (body === undefined || body === null || typeof body !== 'object') return rpcError('mcp add requires a server object')
    const input: McpServerInput = {
      name: typeof body.name === 'string' ? body.name.trim() : '',
      transport: body.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
      command: typeof body.command === 'string' ? body.command : '',
      args: Array.isArray(body.args) ? body.args.filter((x): x is string => typeof x === 'string') : [],
      env: (body.env ?? {}) as Record<string, string>,
      cwd: typeof body.cwd === 'string' ? body.cwd : '',
      url: typeof body.url === 'string' ? body.url : '',
      headers: (body.headers ?? {}) as Record<string, string>,
    }
    const invalid = validateServerInput(input)
    if (invalid !== null) return rpcError(invalid)
    const current = deps.servers()
    if (current.some((s) => s.name === input.name)) return rpcError('server already exists: ' + input.name)
    await deps.replace([...current, { ...input, enabled: true }])
    return { ok: true, value: { name: input.name } }
  }
  if (endpoint === MCP_MANAGER_IMPORT) {
    const body = payload as { json?: unknown } | undefined
    if (typeof body?.json !== 'string') return rpcError('mcp import requires a json string')
    const parsed = parseServerJson(body.json)
    if (parsed.error !== undefined) return rpcError(parsed.error)
    const current = deps.servers()
    const existing = new Set(current.map((s) => s.name))
    const added: string[] = []
    const skipped: string[] = []
    const next = [...current]
    for (const entry of parsed.servers) {
      if (existing.has(entry.name)) {
        skipped.push(entry.name)
        continue
      }
      existing.add(entry.name)
      added.push(entry.name)
      next.push(entry)
    }
    if (added.length > 0) await deps.replace(next)
    return { ok: true, value: { added, skipped } }
  }
  if (endpoint === MCP_MANAGER_TOGGLE) {
    const body = payload as { name?: unknown; enabled?: unknown } | undefined
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const enabled = body?.enabled === true
    if (!isValidServerName(name)) return rpcError('mcp toggle requires a valid server name')
    const current = deps.servers()
    const target = current.find((s) => s.name === name)
    if (target === undefined) return rpcError('server not found: ' + name)
    if (target.enabled === enabled) return { ok: true, value: { name, enabled } }
    const next = current.map((s) => (s.name === name ? { ...s, enabled } : s))
    await deps.replace(next)
    return { ok: true, value: { name, enabled } }
  }
  if (endpoint === MCP_MANAGER_PATCH) {
    const body = payload as { entryId?: unknown; action?: unknown; enabled?: unknown } | undefined
    const entryId = typeof body?.entryId === 'string' ? body.entryId.trim() : ''
    if (entryId === '') return rpcError('mcp patch requires an entryId')
    const layer = deps.patch()
    if (layer.file === null) return rpcError('profile patch layer not found; installed servers are not editable from here')
    const id = patchIdOf(entryId)
    if (!layer.editable().includes(id)) return rpcError(`entry ${id} is not defined by the profile patch layer`)
    if (body?.action === 'remove') {
      await layer.remove(id)
      return { ok: true, value: { entryId, action: 'remove' } }
    }
    if (body?.action === 'toggle') {
      const enabled = body.enabled === true
      await layer.toggle(id, enabled)
      return { ok: true, value: { entryId, action: 'toggle', enabled } }
    }
    return rpcError('mcp patch requires action "toggle" or "remove"')
  }
  return rpcError('unknown mcp-manager endpoint: ' + endpoint)
}

/**
 * 装配 mcp-manager host 半区。
 * @param ctx - host 插件上下文（需要 settings + connection + tools 服务）。
 */
export function applyMcpManager(ctx: Context): void {
  const logger = ctx.logger('mcp-manager')
  // 注册配置命名空间（schema 默认值 = 空注册表；重复注册忽略）。
  let scope: SettingsScope<McpManagerSettings> | undefined
  try {
    scope = ctx.settings.register(MCP_MANAGER_NS, McpManagerSettingsSchema, {})
  } catch (error) {
    logger.warn('mcp-manager namespace register failed: %s', (error as Error).message)
  }

  /** 当前注册表（命名空间未接管时为 []）。 */
  const servers = (): ManagedMcpServer[] => scope?.get().servers ?? []

  /** 已启动的 mcp-client 子插件 fiber（name → fiber）。 */
  const fibers = new Map<string, Fiber>()
  /** name → 当前已装载配置的 JSON（用于变更检测）。 */
  const liveConfigs = new Map<string, string>()
  const live = (): string[] => [...fibers.keys()]

  /** 单次对账：停止不再启用/配置变化的，启动新增/被启用的。 */
  const reconcileOnce = async (): Promise<void> => {
    const desired = new Map<string, { server: ManagedMcpServer; cfg: McpClientConfig }>()
    for (const s of servers()) {
      if (!s.enabled) continue
      if (validateServerInput({ name: s.name, transport: s.transport, command: s.command, args: s.args, env: s.env, cwd: s.cwd, url: s.url, headers: s.headers }) !== null) {
        logger.warn('mcp server %s skipped: invalid config', s.name)
        continue
      }
      try {
        desired.set(s.name, { server: s, cfg: entryToMcpClientConfig(s) })
      } catch (error) {
        logger.warn('mcp server %s config error: %s', s.name, (error as Error).message)
      }
    }
    // 1) dispose 掉已关闭/被删除/配置变化的
    for (const [name, fiber] of fibers) {
      const want = desired.get(name)
      const wantJson = want === undefined ? '' : JSON.stringify(want.cfg)
      if (want === undefined || liveConfigs.get(name) !== wantJson) {
        fibers.delete(name)
        liveConfigs.delete(name)
        try {
          await fiber.dispose()
          logger.info('mcp server %s unloaded', name)
        } catch (error) {
          logger.warn('mcp server %s dispose failed: %s', name, (error as Error).message)
        }
      }
    }
    // 2) 启动新增/被启用的
    for (const [name, { cfg }] of desired) {
      if (fibers.has(name)) continue
      try {
        const fiber = ctx.plugin({ inject: ['tools'], apply: applyMcpClient }, cfg)
        fibers.set(name, fiber)
        liveConfigs.set(name, JSON.stringify(cfg))
        void fiber.then(
          () => logger.info('mcp server %s loaded', name),
          (error: unknown) => {
            logger.warn('mcp server %s failed to start: %s', name, error instanceof Error ? error.message : String(error))
            fibers.delete(name)
            liveConfigs.delete(name)
          },
        )
      } catch (error) {
        logger.warn('mcp server %s start error: %s', name, error instanceof Error ? error.message : String(error))
      }
    }
  }

  // 对账去重：watch 回调串行到达，期间再触发只补一次。
  let reconciling = false
  let reconcileAgain = false
  const reconcile = async (): Promise<void> => {
    if (reconciling) {
      reconcileAgain = true
      return
    }
    reconciling = true
    try {
      do {
        reconcileAgain = false
        await reconcileOnce()
      } while (reconcileAgain)
    } finally {
      reconciling = false
    }
  }

  // settings 变更（新增/导入/开关都走这里）→ 热对账。
  const unwatch = scope?.watch(() => { void reconcile() })

  // 首次装配即按当前注册表装载。
  void reconcile()

  // profile patch 层：定位一次，之后每次读盘（用户可能手改文件）。
  // 优先用运行时配置基址，它指向 profile 根，因而对 node_modules 与 link: 两种安装都成立。
  const patchFile = resolveProfilePatchFile(import.meta.url, ctx.baseUrl)

  /**
   * 读 patch 文件并列出可编辑条目 id。
   *
   * 每次都重新读盘：用户可能手改过文件，缓存会让「可编辑」判断和真实内容脱节。
   * @returns 条目 id 列表；文件缺失或解析失败时为 []。
   */
  const editableIds = (): string[] => {
    if (patchFile === null) return []
    try {
      const text = readPatchText(patchFile)
      const ids: string[] = []
      for (const entry of (ctx.get('loader') as LoaderLike | undefined)?.entries() ?? []) {
        if (entry.options.name !== MCP_CLIENT_MODULE) continue
        const id = patchIdOf(entry.id)
        if (patchFileDefinesEntry(text, id)) ids.push(id)
      }
      return ids
    } catch (error) {
      logger.warn('patch layer read failed: %s', (error as Error).message)
      return []
    }
  }

  /** 读-改-写 patch 文件（备份 + 原子替换），改完由官方 watchUserPatches 热重组。 */
  const editPatch = (transform: (text: string) => string): void => {
    if (patchFile === null) throw new Error('profile patch layer not found')
    const next = transform(readPatchText(patchFile))
    writePatchText(patchFile, next)
  }

  const patch: PatchLayer = {
    file: patchFile,
    editable: editableIds,
    toggle: async (id, enabled) => {
      editPatch((text) => applyPatchToggle(text, id, enabled))
      logger.info('patch layer: %s -> %s', id, enabled ? 'enabled' : 'disabled')
    },
    remove: async (id) => {
      editPatch((text) => {
        const outcome = applyPatchRemoval(text, id)
        if (!outcome.removed) throw new Error(`entry ${id} is not defined by the profile patch layer`)
        return outcome.text
      })
      logger.info('patch layer: %s removed', id)
    },
  }

  // RPC 通道：绑定注册表读写 + 实时名单 + loader 已安装清单 + patch 层编辑。
  const dispose = provideRpcChannel(MCP_MANAGER_RPC_CHANNEL, (endpoint, payload) => {
    return dispatchMcpManagerRpc(endpoint, payload, {
      servers,
      replace: async (next) => {
        if (scope === undefined) throw new Error('mcp-manager namespace unavailable')
        await scope.replace({ servers: next })
      },
      live,
      installed: () => collectInstalledMcpServers(ctx, new Set(servers().map((s) => s.name)), new Set(editableIds())),
      patch: () => patch,
    })
  })

  ctx.effect(() => () => {
    dispose()
    unwatch?.()
  }, 'mcp-manager: rpc channel + settings watch')
}
