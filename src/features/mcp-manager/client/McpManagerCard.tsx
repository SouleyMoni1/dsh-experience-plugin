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
 *
 * 视觉：静态外观全部来自 src/client/design/styles.ts 的 .dx-* 类（列表行 dx-row、
 * 徽标 dx-badge、开关 dx-switch、表单 dx-input/dx-select/dx-textarea、按钮 dx-btn），
 * 内联 style 只留布局（flex/gap/width…）与随状态变化的开关位移；bare 模式作为独立
 * 页签直接渲染，外层只有纵向 flex + gap，不再套定宽（分区已限定 980px 内容列）。
 */
import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import type { ExperienceRpc } from '../../../client/rpc-transport.js'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { cx, ui } from '../../../client/design/index.js'
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

/** 表单字段行：横向排列 + 换行（外观全在 .dx-* 类里，这里只留布局）。*/
const fieldRowStyle: CSSProperties = { ...ui.hstack(8), flexWrap: 'wrap' }

/** 字段标签：不参与伸缩，固定最小宽（静态外观由 dx-label 承担）。*/
const fieldLabelStyle: CSSProperties = { margin: 0, flex: 'none', minWidth: 56 }

/** 文本输入：吃掉剩余宽度（dx-input 自带 width:100%，用 flex-basis 接管）。*/
const fieldInputStyle: CSSProperties = { flex: 1, minWidth: 120 }

/** 下拉框：按内容宽度（dx-select 自带 width:100%，这里还原为 auto）。*/
const fieldSelectStyle: CSSProperties = { flex: 'none', width: 'auto', minWidth: 140 }

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

  const serverRow = (server: ManagedMcpServer, index: number): JSX.Element => {
    const isLive = view?.live.includes(server.name) === true
    const summary = server.transport === 'stdio'
      ? server.command || t('none')
      : server.url || t('none')
    return (
      <div key={server.name} className="dx-row dx-rise" data-hover="true" style={ui.stagger(index)}>
        <div style={{ ...ui.stack(2), ...ui.grow }}>
          <div className="dx-row__title">{server.name}</div>
          <div className="dx-row__desc" style={ui.ellipsis}>{summary}</div>
        </div>
        <span className="dx-badge">{server.transport === 'stdio' ? t('transportStdio') : t('transportHttp')}</span>
        {server.enabled ? <span className="dx-badge dx-badge--ok">{isLive ? t('live') : t('none')}</span> : <span className="dx-badge">{t('off')}</span>}
        <button
          type="button"
          role="switch"
          aria-checked={server.enabled}
          aria-label={server.name}
          disabled={busy || disabled}
          className="dx-switch dx-focus dx-tap"
          style={ui.switchTrack(server.enabled)}
          onClick={() => void toggle(server.name, !server.enabled)}
        >
          <span className="dx-switch__thumb" style={ui.switchThumb(server.enabled)} />
        </button>
      </div>
    )
  }

  /**
   * 外部（loader 装配）服务器行：展示状态；可编辑的（patch 层定义）给开关与卸载。
   *
   * 卸载走两步确认，因为它是破坏性操作——会真的删掉主人手写的条目定义。
   */
  const installedRow = (server: InstalledMcpServer, index: number): JSX.Element => {
    const connected = server.tools.length > 0
    const editable = server.editable === true
    const confirmingThis = confirming === server.name
    return (
      <div key={server.name} className="dx-row dx-rise" data-hover={editable} style={ui.stagger(index)}>
        <div style={{ ...ui.stack(2), ...ui.grow }}>
          <div className="dx-row__title">{server.name}</div>
          <div className="dx-row__desc" style={ui.ellipsis}>{server.summary || server.entryId || t('none')}</div>
        </div>
        {server.transport !== '' ? <span className="dx-badge">{server.transport}</span> : null}
        <span className={cx('dx-badge', connected && 'dx-badge--ok')}>
          {connected ? t('toolCount', { count: server.tools.length }) : t('notConnected')}
        </span>
        <span className="dx-badge">{editable ? t('composed') : t('external')}</span>
        {editable ? (
          <>
            <button
              type="button"
              role="switch"
              aria-checked={server.enabled}
              aria-label={`${server.name} ${server.enabled ? t('patchToggleOff') : t('patchToggleOn')}`}
              disabled={busy || disabled}
              className="dx-switch dx-focus dx-tap"
              style={ui.switchTrack(server.enabled)}
              onClick={() => void patchToggle(server, !server.enabled)}
            >
              <span className="dx-switch__thumb" style={ui.switchThumb(server.enabled)} />
            </button>
            {confirmingThis ? (
              <>
                <button
                  type="button"
                  disabled={busy || disabled}
                  className="dx-btn dx-btn--sm dx-btn--danger dx-focus dx-press dx-tap"
                  onClick={() => void uninstall(server)}
                >
                  {t('uninstallConfirm')}
                </button>
                <button
                  type="button"
                  className="dx-btn dx-btn--sm dx-btn--link dx-focus dx-press dx-tap"
                  onClick={() => setConfirming('')}
                >
                  {t('cancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || disabled}
                className="dx-btn dx-btn--sm dx-btn--danger dx-focus dx-press dx-tap"
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
    return <div className="dx-hint">{t('loading')}</div>
  }
  if (phase === 'error') {
    return <div className="dx-msg dx-msg--error">{t('loadFailed') + error}</div>
  }

  /** 归一化后的两份清单（load 已保证存在，这里再兜一层类型）。 */
  const installed = view?.installed ?? []
  const managed = view?.servers ?? []

  return (
    <ModuleCard title={t('nav')} description={t('cardDescription')} disabled={disabled} bare={bare}>
      <div style={ui.stack(10)}>
        <div style={ui.hstack(10)}>
          <button type="button" className="dx-btn dx-btn--link dx-focus dx-press dx-tap" onClick={() => { setShowAdd(!showAdd); setShowImport(false) }}>
            {showAdd ? '✓ ' : '+ '}{t('addTab')}
          </button>
          <button type="button" className="dx-btn dx-btn--link dx-focus dx-press dx-tap" onClick={() => { setShowImport(!showImport); setShowAdd(false) }}>
            {showImport ? '✓ ' : '⇩ '}{t('importTab')}
          </button>
        </div>

        {showAdd ? (
          <div className="dx-fade" style={ui.stack(8)}>
            <div style={fieldRowStyle}>
              <span className="dx-label" style={fieldLabelStyle}>{t('addName')}</span>
              <input className="dx-input dx-focus" value={addName} placeholder="e.g. my-server" aria-label={t('addName')} style={fieldInputStyle} onChange={(e) => setAddName(e.target.value)} />
              <span className="dx-label" style={fieldLabelStyle}>{t('addTransport')}</span>
              <select className="dx-select dx-focus" value={transport} aria-label={t('addTransport')} style={fieldSelectStyle} onChange={(e) => setTransport(e.target.value === 'streamable-http' ? 'streamable-http' : 'stdio')}>
                <option value="stdio">{t('transportStdio')}</option>
                <option value="streamable-http">{t('transportHttp')}</option>
              </select>
            </div>
            {transport === 'stdio' ? (
              <>
                <div style={fieldRowStyle}>
                  <span className="dx-label" style={fieldLabelStyle}>{t('addCommand')}</span>
                  <input className="dx-input dx-focus" value={addCommand} placeholder="npx -y @some/mcp-server" aria-label={t('addCommand')} style={fieldInputStyle} onChange={(e) => setAddCommand(e.target.value)} />
                </div>
                <div style={fieldRowStyle}>
                  <span className="dx-label" style={fieldLabelStyle}>{t('addArgs')}</span>
                  <input className="dx-input dx-focus" value={addArgs} placeholder='["--flag", "value"]' aria-label={t('addArgs')} style={fieldInputStyle} onChange={(e) => setAddArgs(e.target.value)} />
                </div>
                <div style={fieldRowStyle}>
                  <span className="dx-label" style={fieldLabelStyle}>{t('addEnv')}</span>
                  <input className="dx-input dx-focus" value={addEnv} placeholder='{"KEY": "value"}' aria-label={t('addEnv')} style={fieldInputStyle} onChange={(e) => setAddEnv(e.target.value)} />
                </div>
                <div style={fieldRowStyle}>
                  <span className="dx-label" style={fieldLabelStyle}>{t('addCwd')}</span>
                  <input className="dx-input dx-focus" value={addCwd} placeholder="(optional)" aria-label={t('addCwd')} style={fieldInputStyle} onChange={(e) => setAddCwd(e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div style={fieldRowStyle}>
                  <span className="dx-label" style={fieldLabelStyle}>{t('addUrl')}</span>
                  <input className="dx-input dx-focus" value={addUrl} placeholder="https://example.com/mcp" aria-label={t('addUrl')} style={fieldInputStyle} onChange={(e) => setAddUrl(e.target.value)} />
                </div>
                <div style={fieldRowStyle}>
                  <span className="dx-label" style={fieldLabelStyle}>{t('addHeaders')}</span>
                  <input className="dx-input dx-focus" value={addHeaders} placeholder='{"Authorization": "Bearer ..."}' aria-label={t('addHeaders')} style={fieldInputStyle} onChange={(e) => setAddHeaders(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <button type="button" disabled={busy || disabled} className="dx-btn dx-btn--primary dx-focus dx-press dx-tap" onClick={() => void addServer()}>
                {busy ? t('adding') : t('addBtn')}
              </button>
            </div>
          </div>
        ) : null}

        {showImport ? (
          <div className="dx-fade" style={ui.stack(8)}>
            <p className="dx-hint" style={{ margin: 0 }}>{t('importHint')}</p>
            <textarea
              className="dx-textarea dx-mono dx-focus"
              value={importJson}
              placeholder={t('importJsonPlaceholder')}
              aria-label="import json"
              onChange={(e) => setImportJson(e.target.value)}
            />
            <div>
              <button type="button" disabled={busy || disabled} className="dx-btn dx-btn--primary dx-focus dx-press dx-tap" onClick={() => void importServers()}>
                {busy ? t('importing') : t('importBtn')}
              </button>
            </div>
          </div>
        ) : null}

        {msg !== null ? (
          <div className={cx('dx-msg', msg.kind === 'ok' ? 'dx-msg--ok' : 'dx-msg--error')}>{msg.text}</div>
        ) : null}

        <div className="dx-label" style={{ margin: 0 }}>{t('installedHeader')} ({installed.length})</div>
        <p className="dx-hint" style={{ margin: 0 }}>{t('installedHint')}</p>
        {installed.some((s) => s.editable === true) ? <p className="dx-hint" style={{ margin: 0 }}>{t('uninstallHint')}</p> : null}
        {installed.length === 0
          ? <div className="dx-empty">{t('none')}</div>
          : installed.map((s, i) => installedRow(s, i))}

        <div className="dx-label" style={{ margin: 0 }}>{t('managedHeader')} ({managed.length})</div>
        <p className="dx-hint" style={{ margin: 0 }}>{t('managedHint')}</p>
        {managed.length === 0 ? <div className="dx-empty">{t('none')}</div> : null}
        {managed.map((s, i) => serverRow(s, i))}
      </div>
    </ModuleCard>
  )
}
