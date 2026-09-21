/**
 * mcp-manager 设置卡片 —— 渲染在设置页「日用优化」分区「插件设置」页签。
 *
 * 管理 MCP 服务器注册表（settings 命名空间 dsh-experience-mcp-manager）：
 *   - 列表：全部已注册服务器（含 enabled 标记）+ 当前已动态装配（live）的服务器名；
 *   - 开关：enabled 切换 → host 热对账（启动/卸载 mcp-client 子插件 fiber）；
 *   - 新增：填写 name/transport/command/args/env/cwd/url/headers；
 *   - 导入：粘贴 .mcp.json servers 表 / 单个服务器配置 / JSON 数组。
 *
 * 数据与操作走 host 端 RPC 通道 /dsh-mcp-manager（loopback）。
 */
import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import type { ExperienceRpc } from '../../../client/rpc-transport.js'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ModuleCard } from '../../settings/client/ExperienceSettingsCard.js'

/** RPC 通道（与 host 端 MCP_MANAGER_RPC_CHANNEL 一致）。*/
const CHANNEL = '/dsh-mcp-manager'
const LIST = 'mcp/manager/list'
const TOGGLE = 'mcp/manager/toggle'
const ADD = 'mcp/manager/add'
const IMPORT = 'mcp/manager/import'
const PATCH = 'mcp/manager/patch'

/** MCP 服务器条目（与 host 端 ManagedMcpServer 对应）。*/
interface ManagedMcpServer {
  name: string
  transport: 'stdio' | 'streamable-http'
  enabled: boolean
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
  url: string
  headers: Record<string, string>
}

/** list 返回（与 host 端 McpManagerView 对应）。*/
interface InstalledMcpServer {
  name: string
  entryId: string
  transport: string
  summary: string
  enabled: boolean
  tools: string[]
  /** 由 profile patch 文件定义（可关 / 可卸载）；旧宿主不返回时视为不可编辑。 */
  editable?: boolean
}

interface McpManagerView {
  servers: ManagedMcpServer[]
  live: string[]
  /** 宿主旧版本可能不返回此字段（client 半区可独立热载）。 */
  installed?: InstalledMcpServer[]
}

/** 状态消息。*/
interface Msg {
  kind: 'ok' | 'err'
  text: string
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  gap: '10px',
  padding: '8px 0',
  display: 'flex',
}

const rowTextStyle: CSSProperties = {
  flexDirection: 'column',
  flex: 1,
  gap: '2px',
  minWidth: 0,
  display: 'flex',
}

const rowTitleStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 13,
  fontWeight: 500,
  lineHeight: '20px',
}

const rowDescStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 12,
  lineHeight: '18px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const badgeStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 4,
  padding: '1px 5px',
  fontSize: 11,
  lineHeight: '16px',
  flex: 'none',
}

const liveBadgeStyle: CSSProperties = {
  ...badgeStyle,
  color: 'var(--dsw-alias-brand-primary)',
  borderColor: 'var(--dsw-alias-brand-primary)',
}

const headerStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 13,
  fontWeight: 600,
  margin: '10px 0 2px',
}

const actionRowStyle: CSSProperties = {
  alignItems: 'center',
  gap: '10px',
  marginBottom: 6,
  display: 'flex',
}

const linkBtnStyle: CSSProperties = {
  font: 'inherit',
  cursor: 'pointer',
  color: 'var(--dsw-alias-label-primary)',
  background: 'transparent',
  border: 0,
  padding: '2px 0',
  fontSize: 13,
  lineHeight: '20px',
}

const formStyle: CSSProperties = {
  flexDirection: 'column',
  gap: '8px',
  padding: '10px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  marginBottom: 8,
  display: 'flex',
}

const fieldRowStyle: CSSProperties = {
  alignItems: 'center',
  gap: '8px',
  display: 'flex',
  flexWrap: 'wrap',
}

const labelStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  lineHeight: '18px',
  flex: 'none',
  minWidth: 56,
}

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 120,
  boxSizing: 'border-box',
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 13,
  fontFamily: 'inherit',
}

const selectStyle: CSSProperties = { ...inputStyle, flex: 'none', minWidth: 140 }

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minWidth: '100%',
  minHeight: 72,
  resize: 'vertical',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
}

const msgStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: '20px',
}

const hintStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 12,
  lineHeight: '18px',
  margin: '0 0 4px',
}

function switchStyle(on: boolean): CSSProperties {
  return {
    appearance: 'none',
    width: 40,
    height: 22,
    borderRadius: 11,
    border: on ? '0' : '1px solid var(--dsw-alias-border-l2)',
    cursor: 'pointer',
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 3px',
    background: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-module-platform)',
    transition: 'background .16s, border-color .16s',
  }
}

function thumbStyle(on: boolean): CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#ffffff',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
    flex: 'none',
    transform: on ? 'translateX(18px)' : 'translateX(0)',
    transition: 'transform .16s',
  }
}

/** 卡片 props：RPC 通道 + 文案。*/
export interface McpManagerCardProps {
  rpc: ExperienceRpc | undefined
  t: TranslateNS<'mcp-manager'>
  /** 禁用态（模块关闭时）。*/
  disabled?: boolean
  /** 裸渲染：作为独立选项卡页面，不使用 ModuleCard 外壳。*/
  bare?: boolean
}

/** MCP 管理卡：列表 + 开关 + 新增 + 导入。*/
export function McpManagerCard({ rpc, t, disabled = false, bare = false }: McpManagerCardProps): JSX.Element {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [view, setView] = useState<McpManagerView | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busy, setBusy] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [transport, setTransport] = useState<'stdio' | 'streamable-http'>('stdio')
  const [addName, setAddName] = useState('')
  const [addCommand, setAddCommand] = useState('')
  const [addArgs, setAddArgs] = useState('')
  const [addEnv, setAddEnv] = useState('')
  const [addCwd, setAddCwd] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addHeaders, setAddHeaders] = useState('')

  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState('')

  /** 正在等待「确认卸载」的服务器名（空串表示没有）。 */
  const [confirming, setConfirming] = useState('')

  /** RPC 调用包装：失败抛错，成功返回值。*/
  const call = async <T,>(endpoint: string, payload: unknown): Promise<T> => {
    if (rpc === undefined) throw new Error('rpc channel unavailable')
    const response = await rpc.call(CHANNEL, endpoint, payload)
    if (!response.ok) throw new Error((response.error as { message?: string }).message ?? endpoint + ' failed')
    return response.value as T
  }

  const load = async (): Promise<void> => {
    setPhase('loading')
    setError('')
    try {
      const v = await call<McpManagerView>(LIST, {})
      // RPC 边界归一化：client 半区可独立热载而 host 不能，宿主还是旧代码时
      // 响应里没有 installed，直接渲染会以 undefined.length 炸掉整个设置页。
      setView({ servers: v.servers ?? [], live: v.live ?? [], installed: v.installed ?? [] })
      setPhase('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPhase('error')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc])

  const toggle = async (name: string, next: boolean): Promise<void> => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      await call<{ name: string; enabled: boolean }>(TOGGLE, { name, enabled: next })
      setMsg({ kind: 'ok', text: t('toggleOk', { name, action: next ? t('live') : t('off') }) })
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('toggleFailed') + (cause instanceof Error ? cause.message : String(cause)) })
    } finally {
      setBusy(false)
    }
  }

  /** 解析 JSON 数组为字符串数组（严格校验）。*/
  const parseStrArr = (raw: string, field: string): string[] => {
    const trimmed = raw.trim()
    if (trimmed === '') return []
    let value: unknown
    try {
      value = JSON.parse(trimmed)
    } catch (cause) {
      throw new Error(t('addFailed') + field + ': ' + (cause instanceof Error ? cause.message : String(cause)))
    }
    if (!Array.isArray(value)) throw new Error(t('addFailed') + field + ': ' + t('emptyJson'))
    return value.filter((x): x is string => typeof x === 'string')
  }

  /** 解析 JSON 对象为字符串字典（严格校验）。*/
  const parseStrDict = (raw: string, field: string): Record<string, string> => {
    const trimmed = raw.trim()
    if (trimmed === '') return {}
    let value: unknown
    try {
      value = JSON.parse(trimmed)
    } catch (cause) {
      throw new Error(t('addFailed') + field + ': ' + (cause instanceof Error ? cause.message : String(cause)))
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(t('addFailed') + field + ': ' + t('emptyJson'))
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v
    return out
  }

  const addServer = async (): Promise<void> => {
    if (busy) return
    const name = addName.trim()
    if (name === '') {
      setMsg({ kind: 'err', text: t('emptyName') })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const payload = transport === 'stdio'
        ? {
            name,
            transport: 'stdio' as const,
            command: addCommand.trim(),
            args: parseStrArr(addArgs, t('addArgs')),
            env: parseStrDict(addEnv, t('addEnv')),
            cwd: addCwd.trim(),
          }
        : {
            name,
            transport: 'streamable-http' as const,
            url: addUrl.trim(),
            headers: parseStrDict(addHeaders, t('addHeaders')),
          }
      const result = await call<{ name: string }>(ADD, payload)
      setMsg({ kind: 'ok', text: t('addOk', { name: result.name }) })
      setAddName('')
      setAddCommand('')
      setAddArgs('')
      setAddEnv('')
      setAddCwd('')
      setAddUrl('')
      setAddHeaders('')
      setShowAdd(false)
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBusy(false)
    }
  }

  const importServers = async (): Promise<void> => {
    if (busy) return
    const json = importJson.trim()
    if (json === '') {
      setMsg({ kind: 'err', text: t('emptyJson') })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const result = await call<{ added: string[]; skipped: string[] }>(IMPORT, { json })
      setMsg({ kind: 'ok', text: t('importOk', { added: result.added.length, skipped: result.skipped.length }) })
      setImportJson('')
      setShowImport(false)
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('importFailed') + (cause instanceof Error ? cause.message : String(cause)) })
    } finally {
      setBusy(false)
    }
  }

  /**
   * 关 / 开一个 loader 装配的服务器（写回 profile patch 文件，DSH 热重组）。
   * @param server - 目标服务器。
   * @param next - 目标启用状态。
   */
  const patchToggle = async (server: InstalledMcpServer, next: boolean): Promise<void> => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      await call<{ entryId: string }>(PATCH, { entryId: server.entryId, action: 'toggle', enabled: next })
      setMsg({ kind: 'ok', text: t('patchToggleOk', { name: server.name, action: next ? t('patchToggleOn') : t('patchToggleOff') }) })
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('patchFailed') + (cause instanceof Error ? cause.message : String(cause)) })
    } finally {
      setBusy(false)
    }
  }

  /**
   * 从 profile patch 文件卸载一个 loader 条目（删除定义）。
   * @param server - 目标服务器。
   */
  const uninstall = async (server: InstalledMcpServer): Promise<void> => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    setConfirming('')
    try {
      await call<{ entryId: string }>(PATCH, { entryId: server.entryId, action: 'remove' })
      setMsg({ kind: 'ok', text: t('patchRemoveOk', { name: server.name }) })
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('patchFailed') + (cause instanceof Error ? cause.message : String(cause)) })
    } finally {
      setBusy(false)
    }
  }

  const serverRow = (server: ManagedMcpServer): JSX.Element => {
    const isLive = view?.live.includes(server.name) === true
    const summary = server.transport === 'stdio'
      ? server.command || t('none')
      : server.url || t('none')
    return (
      <div key={server.name} style={rowStyle}>
        <div style={rowTextStyle}>
          <div style={rowTitleStyle}>{server.name}</div>
          <div style={rowDescStyle}>{summary}</div>
        </div>
        <span style={badgeStyle}>{server.transport === 'stdio' ? t('transportStdio') : t('transportHttp')}</span>
        {server.enabled ? <span style={liveBadgeStyle}>{isLive ? t('live') : t('none')}</span> : <span style={badgeStyle}>{t('off')}</span>}
        <button
          type="button"
          role="switch"
          aria-checked={server.enabled}
          aria-label={server.name}
          disabled={busy || disabled}
          style={switchStyle(server.enabled)}
          onClick={() => void toggle(server.name, !server.enabled)}
        >
          <span style={thumbStyle(server.enabled)} />
        </button>
      </div>
    )
  }

  /**
   * 外部（loader 装配）服务器行：展示状态；可编辑的（patch 层定义）给开关与卸载。
   *
   * 卸载走两步确认，因为它是破坏性操作——会真的删掉主人手写的条目定义。
   */
  const installedRow = (server: InstalledMcpServer): JSX.Element => {
    const connected = server.tools.length > 0
    const editable = server.editable === true
    const confirmingThis = confirming === server.name
    return (
      <div key={server.name} style={rowStyle}>
        <div style={rowTextStyle}>
          <div style={rowTitleStyle}>{server.name}</div>
          <div style={rowDescStyle}>{server.summary || server.entryId || t('none')}</div>
        </div>
        {server.transport !== '' ? <span style={badgeStyle}>{server.transport}</span> : null}
        <span style={connected ? liveBadgeStyle : badgeStyle}>
          {connected ? t('toolCount', { count: server.tools.length }) : t('notConnected')}
        </span>
        <span style={badgeStyle}>{editable ? t('composed') : t('external')}</span>
        {editable ? (
          <>
            <button
              type="button"
              role="switch"
              aria-checked={server.enabled}
              aria-label={`${server.name} ${server.enabled ? t('patchToggleOff') : t('patchToggleOn')}`}
              disabled={busy || disabled}
              style={switchStyle(server.enabled)}
              onClick={() => void patchToggle(server, !server.enabled)}
            >
              <span style={thumbStyle(server.enabled)} />
            </button>
            {confirmingThis ? (
              <>
                <button
                  type="button"
                  disabled={busy || disabled}
                  style={{ ...linkBtnStyle, color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 }}
                  onClick={() => void uninstall(server)}
                >
                  {t('uninstallConfirm')}
                </button>
                <button type="button" style={{ ...linkBtnStyle, fontSize: 12 }} onClick={() => setConfirming('')}>
                  {t('cancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || disabled}
                style={{ ...linkBtnStyle, color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 }}
                onClick={() => setConfirming(server.name)}
              >
                {t('uninstall')}
              </button>
            )}
          </>
        ) : null}
      </div>
    )
  }

  if (phase === 'loading') {
    return <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>{t('loading')}</div>
  }
  if (phase === 'error') {
    return <div style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{t('loadFailed') + error}</div>
  }

  /** 归一化后的两份清单（load 已保证存在，这里再兜一层类型）。 */
  const installed = view?.installed ?? []
  const managed = view?.servers ?? []

  return (
    <ModuleCard title={t('nav')} description={t('cardDescription')} disabled={disabled} bare={bare}>
      <div style={actionRowStyle}>
        <button type="button" style={linkBtnStyle} onClick={() => { setShowAdd(!showAdd); setShowImport(false) }}>
          {showAdd ? '✓ ' : '+ '}{t('addTab')}
        </button>
        <button type="button" style={linkBtnStyle} onClick={() => { setShowImport(!showImport); setShowAdd(false) }}>
          {showImport ? '✓ ' : '⇩ '}{t('importTab')}
        </button>
      </div>

      {showAdd ? (
        <div style={formStyle}>
          <div style={fieldRowStyle}>
            <span style={labelStyle}>{t('addName')}</span>
            <input value={addName} placeholder="e.g. my-server" aria-label={t('addName')} style={inputStyle} onChange={(e) => setAddName(e.target.value)} />
            <span style={labelStyle}>{t('addTransport')}</span>
            <select value={transport} aria-label={t('addTransport')} style={selectStyle} onChange={(e) => setTransport(e.target.value === 'streamable-http' ? 'streamable-http' : 'stdio')}>
              <option value="stdio">{t('transportStdio')}</option>
              <option value="streamable-http">{t('transportHttp')}</option>
            </select>
          </div>
          {transport === 'stdio' ? (
            <>
              <div style={fieldRowStyle}>
                <span style={labelStyle}>{t('addCommand')}</span>
                <input value={addCommand} placeholder="npx -y @some/mcp-server" aria-label={t('addCommand')} style={inputStyle} onChange={(e) => setAddCommand(e.target.value)} />
              </div>
              <div style={fieldRowStyle}>
                <span style={labelStyle}>{t('addArgs')}</span>
                <input value={addArgs} placeholder='["--flag", "value"]' aria-label={t('addArgs')} style={inputStyle} onChange={(e) => setAddArgs(e.target.value)} />
              </div>
              <div style={fieldRowStyle}>
                <span style={labelStyle}>{t('addEnv')}</span>
                <input value={addEnv} placeholder='{"KEY": "value"}' aria-label={t('addEnv')} style={inputStyle} onChange={(e) => setAddEnv(e.target.value)} />
              </div>
              <div style={fieldRowStyle}>
                <span style={labelStyle}>{t('addCwd')}</span>
                <input value={addCwd} placeholder="(optional)" aria-label={t('addCwd')} style={inputStyle} onChange={(e) => setAddCwd(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div style={fieldRowStyle}>
                <span style={labelStyle}>{t('addUrl')}</span>
                <input value={addUrl} placeholder="https://example.com/mcp" aria-label={t('addUrl')} style={inputStyle} onChange={(e) => setAddUrl(e.target.value)} />
              </div>
              <div style={fieldRowStyle}>
                <span style={labelStyle}>{t('addHeaders')}</span>
                <input value={addHeaders} placeholder='{"Authorization": "Bearer ..."}' aria-label={t('addHeaders')} style={inputStyle} onChange={(e) => setAddHeaders(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <button type="button" disabled={busy || disabled} style={{ ...linkBtnStyle, color: 'var(--dsw-alias-brand-primary)' }} onClick={() => void addServer()}>
              {busy ? t('adding') : t('addBtn')}
            </button>
          </div>
        </div>
      ) : null}

      {showImport ? (
        <div style={formStyle}>
          <p style={hintStyle}>{t('importHint')}</p>
          <textarea
            value={importJson}
            placeholder={t('importJsonPlaceholder')}
            aria-label="import json"
            style={textareaStyle}
            onChange={(e) => setImportJson(e.target.value)}
          />
          <div>
            <button type="button" disabled={busy || disabled} style={{ ...linkBtnStyle, color: 'var(--dsw-alias-brand-primary)' }} onClick={() => void importServers()}>
              {busy ? t('importing') : t('importBtn')}
            </button>
          </div>
        </div>
      ) : null}

      {msg !== null ? (
        <div style={{ ...msgStyle, color: msg.kind === 'ok' ? '#12965b' : 'var(--dsw-alias-state-error-primary)' }}>{msg.text}</div>
      ) : null}

      <div style={headerStyle}>{t('installedHeader')} ({installed.length})</div>
      <p style={hintStyle}>{t('installedHint')}</p>
      {installed.some((s) => s.editable === true) ? <p style={hintStyle}>{t('uninstallHint')}</p> : null}
      {installed.length === 0
        ? <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>{t('none')}</div>
        : installed.map(installedRow)}

      <div style={headerStyle}>{t('managedHeader')} ({managed.length})</div>
      <p style={hintStyle}>{t('managedHint')}</p>
      {managed.length === 0 ? <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>{t('none')}</div> : null}
      {managed.map(serverRow)}
    </ModuleCard>
  )
}
