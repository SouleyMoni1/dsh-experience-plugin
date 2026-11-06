/**
 * mcp-manager 设置卡片 —— 渲染在设置页「日用优化」分区「插件设置」页签。
 *
 * 管理 MCP 服务器注册表（settings 命名空间 dsh-experience-mcp-manager）：
 *   - 查：列表上方搜索框，按名称 / 说明文本实时过滤「已安装」与「插件托管」两份清单；
 *   - 改：托管行行内编辑（复用新增表单布局与解析函数），保存后 host 写回注册表并热对账；
 *   - 删：托管行两步确认删除（4 秒或点别处自动复位），host 侧删除前二次校验存在；
 *   - 排序：托管行 ↑ / ↓ 与相邻可见条目交换数组位置——数组顺序即 reconcile 装配与展示顺序；
 *   - 开关 / 新增 / 导入保持原行为；已安装行仍只读（开关与卸载走 profile patch 层）。
 *
 * 数据与操作走 host 端 RPC 通道 /dsh-mcp-manager（loopback）。
 *
 * 视觉：结构与类名统一走共用骨架 ../../settings/client/ManagerKit.js（工具条 / 搜索框 /
 * 分组标题 / 列表行 / 行内编辑 / 两步删除 / 开关），外观仍全部来自 .dx-* 类；本文件只
 * 处理数据与 RPC，内联 style 仅剩新增 / 导入面板里表单字段行的布局（flex / width）。
 */
import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import type { ExperienceRpc } from '../../../client/rpc-transport.js'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ui } from '../../../client/design/index.js'
import { ModuleCard } from '../../settings/client/ExperienceSettingsCard.js'
import {
  ManagerActions,
  ManagerEditRow,
  ManagerEmpty,
  ManagerRows,
  ManagerEntryButton,
  ManagerMsg,
  ManagerRow,
  ManagerSearch,
  ManagerSectionHeader,
  RowDeleteButton,
  RowIconButton,
  RowSwitch,
} from '../../settings/client/ManagerKit.js'

/** RPC 通道（与 host 端 MCP_MANAGER_RPC_CHANNEL 一致）。*/
const CHANNEL = '/dsh-mcp-manager'
const LIST = 'mcp/manager/list'
const TOGGLE = 'mcp/manager/toggle'
const ADD = 'mcp/manager/add'
const IMPORT = 'mcp/manager/import'
const PATCH = 'mcp/manager/patch'
const UPDATE = 'mcp/manager/update'
const REMOVE = 'mcp/manager/remove'
const ORDER = 'mcp/manager/order'

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

/** 新增 / 编辑共用的表单值（args/env/headers 以 JSON 文本编辑）。*/
interface ServerForm {
  name: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  env: string
  cwd: string
  url: string
  headers: string
}

/** 空表单（新增用；保存成功后复位）。*/
const EMPTY_FORM: ServerForm = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  env: '',
  cwd: '',
  url: '',
  headers: '',
}

/** 表单字段行：横向排列 + 换行（外观全在 .dx-* 类里，这里只留布局）。*/
const fieldRowStyle: CSSProperties = { ...ui.hstack(8), flexWrap: 'wrap' }

/** 字段标签：不参与伸缩，固定最小宽（静态外观由 dx-label 承担）。*/
const fieldLabelStyle: CSSProperties = { margin: 0, flex: 'none', minWidth: 56 }

/** 文本输入：吃掉剩余宽度（dx-input 自带 width:100%，用 flex-basis 接管）。*/
const fieldInputStyle: CSSProperties = { flex: 1, minWidth: 120 }

/** 下拉框：按内容宽度（dx-select 自带 width:100%，这里还原为 auto）。*/
const fieldSelectStyle: CSSProperties = { flex: 'none', width: 'auto', minWidth: 140 }

/** 托管服务器的说明文本：stdio 看 command，http 看 url。*/
const managedSummary = (server: ManagedMcpServer): string =>
  server.transport === 'stdio' ? server.command : server.url

/** 已安装服务器的说明文本：loader 配置摘要，退回条目 id。*/
const installedSummary = (server: InstalledMcpServer): string => server.summary || server.entryId

/**
 * 按名称 / 说明文本过滤（大小写不敏感）；查询为空原样返回，保持原顺序。
 * 顺序很重要：托管清单的数组顺序就是装配与展示顺序，过滤不能重排。
 * @param list - 待过滤清单。
 * @param query - 搜索框原文。
 * @param desc - 取说明文本。
 * @returns 过滤后的清单（相对顺序不变）。
 */
function filterServers<T extends { name: string }>(list: T[], query: string, desc: (item: T) => string): T[] {
  const q = query.trim().toLowerCase()
  if (q === '') return list
  return list.filter((item) => item.name.toLowerCase().includes(q) || desc(item).toLowerCase().includes(q))
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

/** MCP 管理卡：列表 + 搜索 + 开关 + 行内编辑 / 删除 / 排序 + 新增 + 导入。*/
export function McpManagerCard({ rpc, t, disabled = false, bare = false }: McpManagerCardProps): JSX.Element {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [view, setView] = useState<McpManagerView | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<ServerForm>(EMPTY_FORM)

  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState('')

  /** 正在行内编辑的服务器名（原值；空串表示没有）。*/
  const [editing, setEditing] = useState('')
  const [editForm, setEditForm] = useState<ServerForm>(EMPTY_FORM)

  /** 正在等待「确认删除」的托管服务器名（空串表示没有）。*/
  const [deleting, setDeleting] = useState('')

  /** 正在等待「确认卸载」的已安装服务器名（空串表示没有）。*/
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

  // 行内删除的两步确认：4 秒无操作、或点击「确认删除」以外的位置时自动复位。
  useEffect(() => {
    if (deleting === '') return
    const timer = window.setTimeout(() => setDeleting(''), 4000)
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-confirm-delete="true"]') !== null) return
      setDeleting('')
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [deleting])

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

  /** 解析 JSON 数组为字符串数组（严格校验）；错误文案由调用方补「失败: 」前缀。*/
  const parseStrArr = (raw: string, field: string): string[] => {
    const trimmed = raw.trim()
    if (trimmed === '') return []
    let value: unknown
    try {
      value = JSON.parse(trimmed)
    } catch (cause) {
      throw new Error(field + ': ' + (cause instanceof Error ? cause.message : String(cause)))
    }
    if (!Array.isArray(value)) throw new Error(field + ': ' + t('emptyJson'))
    return value.filter((x): x is string => typeof x === 'string')
  }

  /** 解析 JSON 对象为字符串字典（严格校验）；错误文案由调用方补「失败: 」前缀。*/
  const parseStrDict = (raw: string, field: string): Record<string, string> => {
    const trimmed = raw.trim()
    if (trimmed === '') return {}
    let value: unknown
    try {
      value = JSON.parse(trimmed)
    } catch (cause) {
      throw new Error(field + ': ' + (cause instanceof Error ? cause.message : String(cause)))
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(field + ': ' + t('emptyJson'))
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v
    return out
  }

  const addServer = async (): Promise<void> => {
    if (busy) return
    const name = addForm.name.trim()
    if (name === '') {
      setMsg({ kind: 'err', text: t('emptyName') })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const payload = addForm.transport === 'stdio'
        ? {
            name,
            transport: 'stdio' as const,
            command: addForm.command.trim(),
            args: parseStrArr(addForm.args, t('addArgs')),
            env: parseStrDict(addForm.env, t('addEnv')),
            cwd: addForm.cwd.trim(),
          }
        : {
            name,
            transport: 'streamable-http' as const,
            url: addForm.url.trim(),
            headers: parseStrDict(addForm.headers, t('addHeaders')),
          }
      const result = await call<{ name: string }>(ADD, payload)
      setMsg({ kind: 'ok', text: t('addOk', { name: result.name }) })
      setAddForm(EMPTY_FORM)
      setShowAdd(false)
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('addFailed') + (cause instanceof Error ? cause.message : String(cause)) })
    } finally {
      setBusy(false)
    }
  }

  /** 进入行内编辑：预填现值（args/env/headers 转 JSON 文本）。*/
  const startEdit = (server: ManagedMcpServer): void => {
    if (busy || disabled) return
    setMsg(null)
    setDeleting('')
    setEditing(server.name)
    setEditForm({
      name: server.name,
      transport: server.transport,
      command: server.command,
      args: server.args.length > 0 ? JSON.stringify(server.args) : '',
      env: Object.keys(server.env).length > 0 ? JSON.stringify(server.env) : '',
      cwd: server.cwd,
      url: server.url,
      headers: Object.keys(server.headers).length > 0 ? JSON.stringify(server.headers) : '',
    })
  }

  /**
   * 保存行内编辑：只提交 transport 相关字段，host 端按 patch 合并、保留 enabled 与数组位置。
   * 改名会改变工具命名空间（mcp__<name>__<tool>），host 端对账时会卸载旧名、装载新名。
   * @param server - 被编辑的条目（原值用于定位）。
   */
  const saveEdit = async (server: ManagedMcpServer): Promise<void> => {
    if (busy) return
    const name = editForm.name.trim()
    if (name === '') {
      setMsg({ kind: 'err', text: t('emptyName') })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const patch = editForm.transport === 'stdio'
        ? {
            name,
            transport: 'stdio' as const,
            command: editForm.command.trim(),
            args: parseStrArr(editForm.args, t('addArgs')),
            env: parseStrDict(editForm.env, t('addEnv')),
            cwd: editForm.cwd.trim(),
          }
        : {
            name,
            transport: 'streamable-http' as const,
            url: editForm.url.trim(),
            headers: parseStrDict(editForm.headers, t('addHeaders')),
          }
      const result = await call<{ name: string }>(UPDATE, { name: server.name, patch })
      setMsg({ kind: 'ok', text: t('editOk', { name: result.name }) })
      setEditing('')
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('editFailed') + (cause instanceof Error ? cause.message : String(cause)) })
    } finally {
      setBusy(false)
    }
  }

  /**
   * 删除托管条目（已在 UI 侧二次确认过；host 端还会再校验目标存在）。
   * @param server - 目标服务器。
   */
  const removeServer = async (server: ManagedMcpServer): Promise<void> => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    setDeleting('')
    try {
      await call<{ name: string }>(REMOVE, { name: server.name })
      setMsg({ kind: 'ok', text: t('deleteOk', { name: server.name }) })
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('deleteFailed') + (cause instanceof Error ? cause.message : String(cause)) })
    } finally {
      setBusy(false)
    }
  }

  /**
   * 行内排序：与「当前可见清单」里的相邻条目交换数组位置并持久化。
   * 数组顺序就是 reconcile 装配顺序，所以保存后立即按新顺序重装。
   * @param name - 当前服务器名。
   * @param delta - -1 上移 / 1 下移。
   */
  const moveServer = async (name: string, delta: -1 | 1): Promise<void> => {
    if (busy) return
    const current = view?.servers ?? []
    const visible = filterServers(current, search, managedSummary)
    const pos = visible.findIndex((server) => server.name === name)
    const neighbor = pos < 0 ? undefined : visible[pos + delta] as ManagedMcpServer | undefined
    if (neighbor === undefined) return
    const from = current.findIndex((server) => server.name === name)
    const to = current.findIndex((server) => server.name === neighbor.name)
    if (from < 0 || to < 0) return
    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setBusy(true)
    setMsg(null)
    try {
      await call<{ names: string[] }>(ORDER, { names: next.map((server) => server.name) })
      setMsg({ kind: 'ok', text: t('orderOk') })
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('orderFailed') + (cause instanceof Error ? cause.message : String(cause)) })
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

  /**
   * 服务器表单字段（新增与行内编辑共用布局 / 占位 / 解析口径）。
   * @param form - 当前表单值。
   * @param setForm - 整表替换（字段不多，整体替换最直观）。
   * @param namePlaceholder - 名称占位（新增给示例，编辑给原值）。
   */
  const serverFields = (form: ServerForm, setForm: (next: ServerForm) => void, namePlaceholder: string): JSX.Element => (
    <>
      <div style={fieldRowStyle}>
        <span className="dx-label" style={fieldLabelStyle}>{t('addName')}</span>
        <input className="dx-input dx-focus" value={form.name} placeholder={namePlaceholder} aria-label={t('addName')} style={fieldInputStyle} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <span className="dx-label" style={fieldLabelStyle}>{t('addTransport')}</span>
        <select className="dx-select dx-focus" value={form.transport} aria-label={t('addTransport')} style={fieldSelectStyle} onChange={(e) => setForm({ ...form, transport: e.target.value === 'streamable-http' ? 'streamable-http' : 'stdio' })}>
          <option value="stdio">{t('transportStdio')}</option>
          <option value="streamable-http">{t('transportHttp')}</option>
        </select>
      </div>
      {form.transport === 'stdio' ? (
        <>
          <div style={fieldRowStyle}>
            <span className="dx-label" style={fieldLabelStyle}>{t('addCommand')}</span>
            <input className="dx-input dx-focus" value={form.command} placeholder="npx -y @some/mcp-server" aria-label={t('addCommand')} style={fieldInputStyle} onChange={(e) => setForm({ ...form, command: e.target.value })} />
          </div>
          <div style={fieldRowStyle}>
            <span className="dx-label" style={fieldLabelStyle}>{t('addArgs')}</span>
            <input className="dx-input dx-focus" value={form.args} placeholder='["--flag", "value"]' aria-label={t('addArgs')} style={fieldInputStyle} onChange={(e) => setForm({ ...form, args: e.target.value })} />
          </div>
          <div style={fieldRowStyle}>
            <span className="dx-label" style={fieldLabelStyle}>{t('addEnv')}</span>
            <input className="dx-input dx-focus" value={form.env} placeholder='{"KEY": "value"}' aria-label={t('addEnv')} style={fieldInputStyle} onChange={(e) => setForm({ ...form, env: e.target.value })} />
          </div>
          <div style={fieldRowStyle}>
            <span className="dx-label" style={fieldLabelStyle}>{t('addCwd')}</span>
            <input className="dx-input dx-focus" value={form.cwd} placeholder="(optional)" aria-label={t('addCwd')} style={fieldInputStyle} onChange={(e) => setForm({ ...form, cwd: e.target.value })} />
          </div>
        </>
      ) : (
        <>
          <div style={fieldRowStyle}>
            <span className="dx-label" style={fieldLabelStyle}>{t('addUrl')}</span>
            <input className="dx-input dx-focus" value={form.url} placeholder="https://example.com/mcp" aria-label={t('addUrl')} style={fieldInputStyle} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <div style={fieldRowStyle}>
            <span className="dx-label" style={fieldLabelStyle}>{t('addHeaders')}</span>
            <input className="dx-input dx-focus" value={form.headers} placeholder='{"Authorization": "Bearer ..."}' aria-label={t('addHeaders')} style={fieldInputStyle} onChange={(e) => setForm({ ...form, headers: e.target.value })} />
          </div>
        </>
      )}
    </>
  )

  /**
   * 托管服务器行：常规态展示 + 开关 + 排序 / 编辑 / 两步确认删除；编辑态整行变表单。
   * @param server - 条目。
   * @param visibleIndex - 在当前可见清单里的位置（首末行禁用判断）。
   * @param visible - 当前可见清单（搜索过滤后，顺序同注册表）。
   */
  const serverRow = (server: ManagedMcpServer, visibleIndex: number, visible: ManagedMcpServer[]): JSX.Element => {
    const isLive = view?.live.includes(server.name) === true
    const summary = managedSummary(server)
    // 编辑态：改名会换掉工具命名空间，保存前先给一行提示。
    if (editing === server.name) {
      const renamed = editForm.name.trim() !== server.name
      return (
        <ManagerEditRow
          key={server.name}
          fields={serverFields(editForm, setEditForm, server.name)}
          hint={renamed ? t('renameHint', { from: server.name, to: editForm.name.trim() }) : undefined}
          saveLabel={busy ? t('saving') : t('save')}
          cancelLabel={t('cancel')}
          busy={busy}
          disabled={disabled}
          onSave={() => void saveEdit(server)}
          onCancel={() => { setEditing(''); setMsg(null) }}
        />
      )
    }
    return (
      <ManagerRow
        key={server.name}
        title={server.name}
        description={summary || t('none')}
        hover
        badges={
          <>
            <span className="dx-badge">{server.transport === 'stdio' ? t('transportStdio') : t('transportHttp')}</span>
            {server.enabled
              ? <span className="dx-badge dx-badge--ok">{isLive ? t('live') : t('none')}</span>
              : <span className="dx-badge">{t('off')}</span>}
          </>
        }
        actions={
          <>
            <RowIconButton
              label={t('moveUp')}
              glyph="↑"
              disabled={busy || disabled || visibleIndex === 0}
              onClick={() => void moveServer(server.name, -1)}
            />
            <RowIconButton
              label={t('moveDown')}
              glyph="↓"
              disabled={busy || disabled || visibleIndex === visible.length - 1}
              onClick={() => void moveServer(server.name, 1)}
            />
            <RowIconButton label={t('edit')} glyph="✎" disabled={busy || disabled} onClick={() => startEdit(server)} />
            <RowDeleteButton
              icon="✕"
              label={t('delete')}
              confirmLabel={t('deleteConfirm')}
              cancelLabel={t('cancel')}
              confirming={deleting === server.name}
              disabled={busy || disabled}
              onArm={() => setDeleting(server.name)}
              onConfirm={() => void removeServer(server)}
              onCancel={() => setDeleting('')}
            />
          </>
        }
        trailing={
          <RowSwitch
            label={server.name}
            on={server.enabled}
            disabled={busy || disabled}
            onToggle={() => void toggle(server.name, !server.enabled)}
          />
        }
      />
    )
  }

  /**
   * 外部（loader 装配）服务器行：展示状态；可编辑的（patch 层定义）给开关与卸载。
   *
   * 已安装区是只读的：编辑 / 排序 / 删除只对插件托管注册表开放，所以 actions 里只放「卸载」，
   * 开关统一放 trailing（与插件托管行、Skills 行同一顺序：徽标 → 操作 → 开关）。
   * 卸载走两步确认，因为它是破坏性操作——会真的删掉主人手写的条目定义。
   */
  const installedRow = (server: InstalledMcpServer): JSX.Element => {
    const connected = server.tools.length > 0
    const editable = server.editable === true
    return (
      <ManagerRow
        key={server.name}
        title={server.name}
        description={installedSummary(server) || t('none')}
        hover={editable}
        badges={
          <>
            {server.transport === '' ? null : <span className="dx-badge">{server.transport}</span>}
            <span className={connected ? 'dx-badge dx-badge--ok' : 'dx-badge'}>
              {connected ? t('toolCount', { count: server.tools.length }) : t('notConnected')}
            </span>
            <span className="dx-badge">{editable ? t('composed') : t('external')}</span>
          </>
        }
        actions={editable ? (
          <RowDeleteButton
            label={t('uninstall')}
            confirmLabel={t('uninstallConfirm')}
            cancelLabel={t('cancel')}
            confirming={confirming === server.name}
            disabled={busy || disabled}
            onArm={() => setConfirming(server.name)}
            onConfirm={() => void uninstall(server)}
            onCancel={() => setConfirming('')}
          />
        ) : undefined}
        trailing={editable ? (
          <RowSwitch
            label={server.name + ' ' + (server.enabled ? t('patchToggleOff') : t('patchToggleOn'))}
            on={server.enabled}
            disabled={busy || disabled}
            onToggle={() => void patchToggle(server, !server.enabled)}
          />
        ) : undefined}
      />
    )
  }

  if (phase === 'loading') {
    return <ManagerEmpty text={t('loading')} />
  }
  if (phase === 'error') {
    return <div className="dx-msg dx-msg--error">{t('loadFailed') + error}</div>
  }

  /** 归一化后的两份清单（load 已保证存在，这里再兜一层类型）。 */
  const installed = view?.installed ?? []
  const managed = view?.servers ?? []
  /** 是否处于搜索过滤态（决定计数展示与空态文案）。 */
  const filtering = search.trim() !== ''
  const shownInstalled = filterServers(installed, search, installedSummary)
  const shownManaged = filterServers(managed, search, managedSummary)
  /** 空列表提示：搜索无结果给专门文案，否则「（无）」。 */
  const emptyText = (): string => (filtering ? t('searchEmpty') : t('none'))
  /** 分组计数：常规态给总数，搜索态给「命中/总数」。 */
  const countOf = (shown: number, total: number): string => (filtering ? shown + '/' + total : String(total))
  /** 分组说明：有可编辑条目时才追加「卸载会改 profile 组合文件」的提示。 */
  const installedHint = (): string => {
    const hint = t('installedHint')
    return installed.some((s) => s.editable === true) ? hint + ' ' + t('uninstallHint') : hint
  }

  return (
    <ModuleCard title={t('nav')} description={t('cardDescription')} disabled={disabled} bare={bare}>
      <div style={ui.stack(10)}>
        <ManagerActions>
          <ManagerEntryButton
            label={t('addTab')}
            glyph="+"
            open={showAdd}
            disabled={disabled}
            onClick={() => { setShowAdd(!showAdd); setShowImport(false) }}
          />
          <ManagerEntryButton
            label={t('importTab')}
            glyph="⇩"
            open={showImport}
            disabled={disabled}
            onClick={() => { setShowImport(!showImport); setShowAdd(false) }}
          />
        </ManagerActions>

        {showAdd ? (
          <div className="dx-fade" style={ui.stack(8)}>
            {serverFields(addForm, setAddForm, 'e.g. my-server')}
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

        {msg !== null ? <ManagerMsg kind={msg.kind} text={msg.text} /> : null}

        {/* 查：列表上方搜索框，同时过滤「已安装」与「插件托管」两份清单。 */}
        <ManagerSearch
          value={search}
          placeholder={t('searchPlaceholder')}
          clearLabel={t('clearSearch')}
          disabled={disabled}
          onChange={(next) => {
            setSearch(next)
            setEditing('')
            setDeleting('')
          }}
        />

        <ManagerSectionHeader
          title={t('installedHeader')}
          count={countOf(shownInstalled.length, installed.length)}
          hint={installedHint()}
        />
        {shownInstalled.length === 0
          ? <ManagerEmpty text={emptyText()} />
          : <ManagerRows>{shownInstalled.map((server) => installedRow(server))}</ManagerRows>}

        <ManagerSectionHeader
          title={t('managedHeader')}
          count={countOf(shownManaged.length, managed.length)}
          hint={t('managedHint')}
        />
        {shownManaged.length === 0
          ? <ManagerEmpty text={emptyText()} />
          : <ManagerRows>{shownManaged.map((server, i) => serverRow(server, i, shownManaged))}</ManagerRows>}
      </div>
    </ModuleCard>
  )
}
