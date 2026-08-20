/**
 * Shared CLI mimic profile definitions.
 *
 * Presets are code-owned starting points; custom profiles are stored in the
 * settings namespace and can be duplicated, renamed, edited, and removed.
 */

export interface MimicProfile {
  name: string
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
  extraHeadersJson: string
  extraBodyJson: string
}

export interface PresetProfile extends MimicProfile {
  id: string
  kind: 'preset'
}

export interface StoredProfile extends MimicProfile {
  id: string
  kind: 'custom'
  createdAt: number
}

export type ProfileSource = PresetProfile | StoredProfile

export const PROFILE_FIELDS: Array<keyof MimicProfile> = [
  'name',
  'targetPath',
  'port',
  'host',
  'upstreamBaseUrl',
  'apiKeyEnv',
  'authorizationPrefix',
  'userAgent',
  'originator',
  'installationId',
  'addClientMetadata',
  'extraHeadersJson',
  'extraBodyJson',
]

export const PRESET_IDS = ['codex', 'claude-code', 'grok-cli'] as const
export type PresetId = (typeof PRESET_IDS)[number]

export const PRESETS: Record<PresetId, PresetProfile> = {
  codex: {
    id: 'codex',
    kind: 'preset',
    name: 'Codex CLI',
    targetPath: '/codex/responses',
    port: 4123,
    host: '127.0.0.1',
    upstreamBaseUrl: '',
    apiKeyEnv: '',
    authorizationPrefix: 'Bearer',
    userAgent: 'codex_cli_rs/0.148.0 (Windows 10.0; x86_64) WindowsTerminal',
    originator: 'codex_cli_rs',
    installationId: '',
    addClientMetadata: true,
    extraHeadersJson: JSON.stringify({
      'openai-beta': 'responses=experimental',
      version: '0.148.0',
    }, null, 2),
    extraBodyJson: '{}',
  },
  'claude-code': {
    id: 'claude-code',
    kind: 'preset',
    name: 'Claude Code',
    targetPath: '/messages',
    port: 4123,
    host: '127.0.0.1',
    upstreamBaseUrl: '',
    apiKeyEnv: '',
    authorizationPrefix: 'Bearer',
    userAgent: 'claude-cli/2.1.237 (external, cli)',
    originator: '',
    installationId: '',
    addClientMetadata: false,
    extraHeadersJson: JSON.stringify({
      'x-app': 'cli',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'claude-code-20250219,context-1m-2025-08-07,interleaved-thinking-2025-05-14,thinking-token-count-2026-05-13,context-management-2025-06-27,prompt-caching-scope-2026-01-05,mid-conversation-system-2026-04-07,advisor-tool-2026-03-01,effort-2025-11-24,structured-outputs-2025-12-15',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-stainless-lang': 'js',
      'x-stainless-package-version': '0.112.1',
      'x-stainless-runtime': 'node',
      'x-stainless-runtime-version': 'v26.3.0',
      'x-stainless-arch': 'x64',
      'x-stainless-os': 'Windows',
      'x-stainless-timeout': '600',
    }, null, 2),
    extraBodyJson: '{}',
  },
  'grok-cli': {
    id: 'grok-cli',
    kind: 'preset',
    name: 'Grok CLI',
    targetPath: '/responses',
    port: 4123,
    host: '127.0.0.1',
    upstreamBaseUrl: '',
    apiKeyEnv: '',
    authorizationPrefix: 'Bearer',
    userAgent: 'xai-grok-workspace/0.2.115',
    originator: '',
    installationId: '',
    addClientMetadata: false,
    extraHeadersJson: JSON.stringify({
      'x-grok-client-version': '0.2.115',
      'x-grok-client-identifier': 'grok-shell',
      'x-grok-client-mode': 'interactive',
      'x-xai-token-auth': 'xai-grok-cli',
      'x-authenticateresponse': 'authenticate-response',
    }, null, 2),
    extraBodyJson: '{}',
  },
}

export function presetById(id: string): PresetProfile | undefined {
  return PRESETS[id as PresetId]
}

export function createCustomProfile(name: string, source: Partial<MimicProfile> = {}): StoredProfile {
  const base = {
    targetPath: '/codex/responses',
    port: 4123,
    host: '127.0.0.1',
    upstreamBaseUrl: '',
    apiKeyEnv: '',
    authorizationPrefix: 'Bearer',
    userAgent: 'codex_cli_rs/0.148.0 (Windows 10.0; x86_64) WindowsTerminal',
    originator: 'codex_cli_rs',
    installationId: '',
    addClientMetadata: true,
    extraHeadersJson: '{}',
    extraBodyJson: '{}',
  }
  return {
    ...base,
    ...source,
    id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'custom',
    name: name.trim() || '自定义配置',
    createdAt: Date.now(),
  }
}

export function isStoredProfile(value: unknown): value is StoredProfile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredProfile>
  return typeof candidate.name === 'string'
    && typeof candidate.targetPath === 'string'
    && typeof candidate.userAgent === 'string'
    && typeof candidate.addClientMetadata === 'boolean'
}

export function normalizeStoredProfiles(value: unknown): Record<string, StoredProfile> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, StoredProfile> = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isStoredProfile(raw)) continue
    out[id] = {
      ...raw,
      id,
      kind: 'custom',
      name: raw.name || '自定义配置',
      targetPath: raw.targetPath || '/codex/responses',
      port: typeof raw.port === 'number' ? raw.port : 4123,
      host: raw.host || '127.0.0.1',
      authorizationPrefix: raw.authorizationPrefix || 'Bearer',
      userAgent: raw.userAgent || PRESETS.codex.userAgent,
      originator: raw.originator ?? '',
      addClientMetadata: raw.addClientMetadata !== false,
      extraHeadersJson: raw.extraHeadersJson || '{}',
      extraBodyJson: raw.extraBodyJson || '{}',
    }
  }
  return out
}
