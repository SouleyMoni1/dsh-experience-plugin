/**
 * skill-manager 设置卡片 —— 渲染在设置页「日用优化」分区的「Skills 管理」页签（bare）。
 *
 * 管理 $DSH_HOME/skills 下的技能：
 *   - 列表：已启用 + 已关闭（关闭 = 物理移入 skills/.disabled，dsh 不再发现）；
 *   - 搜索：按名字/描述实时过滤（大小写不敏感），无匹配给一行提示；
 *   - 开关：移入/移回 .disabled，chokidar 热失效/热加载；
 *   - 行内编辑：改名 + 改描述（host 同步改写 frontmatter，改名连目录/文件一起改）；
 *   - 行内删除：两步确认（4 秒未确认或点别处自动复位）；
 *   - 排序：行内 ↑/↓，顺序持久化到 skills/.order.json（list 按它输出）；
 *   - 新增 / 导入：保持原有行为。
 *
 * 数据与操作走 host 端 RPC 通道 /dsh-skill-manager（loopback）。
 *
 * 视觉：与「MCP 管理」共用 settings/client/ManagerKit 的统一骨架（工具条 / 搜索框 /
 * 分组标题 / 列表行 / 行尾操作 / 开关 / 空态），静态外观仍全部来自 .dx-* 类；
 * 本文件只保留数据、RPC 与布局（ui.stack / ui.hstack / ui.grow / ui.ellipsis）。
 */
import { useEffect, useRef, useState, type JSX } from 'react'
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

/** RPC 通道（与 host 端 SKILL_MANAGER_RPC_CHANNEL 一致）。 */
const CHANNEL = '/dsh-skill-manager'
const LIST = 'skill/manager/list'
const TOGGLE = 'skill/manager/toggle'
const ADD = 'skill/manager/add'
const IMPORT = 'skill/manager/import'
const UPDATE = 'skill/manager/update'
const REMOVE = 'skill/manager/remove'
const ORDER = 'skill/manager/order'

/** 技能条目（与 host 端 ManagedSkill 对应）。 */
interface ManagedSkill {
  name: string
  description: string
  kind: 'bundle' | 'flat'
  enabled: boolean
  relPath: string
}

/** list 返回（与 host 端 SkillManagerView 对应）。 */
interface SkillManagerView {
  skills: ManagedSkill[]
  disabled: ManagedSkill[]
  root: string
}

/** 状态消息。 */
interface Msg {
  kind: 'ok' | 'err'
  text: string
}

/** 行内编辑草稿。 */
interface Editing {
  /** 行 key（区分启用段/关闭段的同名技能）。 */
  key: string
  /** 原始名字（提交时作为定位用的 name）。 */
  original: string
  /** 草稿名字。 */
  name: string
  /** 草稿描述。 */
  description: string
}

/** 行 key：同名技能可能同时存在于两段，必须带段前缀。 */
function rowKey(skill: ManagedSkill): string {
  return (skill.enabled ? 'e:' : 'd:') + skill.name
}

/** 卡片 props：RPC 通道 + 文案。 */
export interface SkillManagerCardProps {
  rpc: ExperienceRpc | undefined
  t: TranslateNS<'skill-manager'>
  /** 禁用态（模块关闭时）。 */
  disabled?: boolean
  /** 裸渲染：作为独立选项卡页面，不使用 ModuleCard 外壳。 */
  bare?: boolean
}

/** 技能管理卡：列表 + 搜索 + 开关 + 行内编辑/删除/排序 + 新增 + 导入。 */
export function SkillManagerCard({ rpc, t, disabled = false, bare = false }: SkillManagerCardProps): JSX.Element {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [view, setView] = useState<SkillManagerView | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busy, setBusy] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addDesc, setAddDesc] = useState('')

  const [showImport, setShowImport] = useState(false)
  const [importSource, setImportSource] = useState<'local' | 'skillhub'>('local')
  const [importValue, setImportValue] = useState('')

  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const confirmTimer = useRef<number | null>(null)

  /** 错误对象转文案。 */
  const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

  /** RPC 调用包装：失败抛错，成功返回值。 */
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
      const v = await call<SkillManagerView>(LIST, {})
      setView(v)
      setPhase('ready')
    } catch (cause) {
      setError(messageOf(cause))
      setPhase('error')
    }
  }

  /** 两步删除的复位：清掉计时器与待确认行。 */
  const clearConfirm = (): void => {
    if (confirmTimer.current !== null) {
      window.clearTimeout(confirmTimer.current)
      confirmTimer.current = null
    }
    setConfirmKey(null)
  }

  /** 进入待确认态：4 秒没点第二次就自动复位。 */
  const armConfirm = (key: string): void => {
    clearConfirm()
    setConfirmKey(key)
    confirmTimer.current = window.setTimeout(() => {
      confirmTimer.current = null
      setConfirmKey(null)
    }, 4000)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc])

  // 卸载时清掉未触发的确认计时器
  useEffect(
    () => () => {
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current)
    },
    [],
  )

  // 点别处自动复位待确认态（确认按钮自身带 data-confirm-delete，不触发复位）
  useEffect(() => {
    if (confirmKey === null) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-confirm-delete="true"]') !== null) return
      clearConfirm()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmKey])

  const toggle = async (name: string, next: boolean): Promise<void> => {
    if (busy) return
    clearConfirm()
    setBusy(true)
    setMsg(null)
    try {
      await call<{ name: string; enabled: boolean }>(TOGGLE, { name, enabled: next })
      setMsg({ kind: 'ok', text: t('toggleOk', { name, action: next ? t('enabled') : t('disabled') }) })
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('toggleFailed') + messageOf(cause) })
    } finally {
      setBusy(false)
    }
  }

  /** 开始编辑一行（预填现值）。 */
  const startEdit = (skill: ManagedSkill): void => {
    clearConfirm()
    setEditing({ key: rowKey(skill), original: skill.name, name: skill.name, description: skill.description })
  }

  /** 保存行内编辑：名字 + 描述一起提交（名字没变时 host 只改描述）。 */
  const saveEdit = async (): Promise<void> => {
    if (busy || editing === null) return
    const nextName = editing.name.trim()
    if (nextName === '') {
      setMsg({ kind: 'err', text: t('emptyName') })
      return
    }
    const state = editing
    setBusy(true)
    setMsg(null)
    try {
      const result = await call<ManagedSkill>(UPDATE, {
        name: state.original,
        patch: { name: nextName, description: state.description },
      })
      setMsg({ kind: 'ok', text: t('editOk', { name: result.name }) })
      setEditing(null)
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('editFailed') + messageOf(cause) })
    } finally {
      setBusy(false)
    }
  }

  /** 行内移动：提交该段的新顺序（host 合并成 .order.json 并刷新）。 */
  const move = async (skill: ManagedSkill, list: ManagedSkill[], delta: number): Promise<void> => {
    if (busy) return
    const index = list.findIndex((item) => item.name === skill.name)
    const target = index + delta
    if (index === -1 || target < 0 || target >= list.length) return
    const names = list.map((item) => item.name)
    const moved = names[index]
    names[index] = names[target]
    names[target] = moved
    clearConfirm()
    setBusy(true)
    setMsg(null)
    try {
      await call<unknown>(ORDER, { names })
      await load()
      setMsg({ kind: 'ok', text: t('orderOk') })
    } catch (cause) {
      setMsg({ kind: 'err', text: t('orderFailed') + messageOf(cause) })
    } finally {
      setBusy(false)
    }
  }

  /** 两步删除：第一次点只进入确认态，第二次才真正删除。 */
  const removeSkill = async (skill: ManagedSkill): Promise<void> => {
    if (busy) return
    const key = rowKey(skill)
    if (confirmKey !== key) {
      armConfirm(key)
      return
    }
    clearConfirm()
    setBusy(true)
    setMsg(null)
    try {
      await call<{ name: string }>(REMOVE, { name: skill.name })
      setMsg({ kind: 'ok', text: t('removeOk', { name: skill.name }) })
      if (editing !== null && editing.key === key) setEditing(null)
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('removeFailed') + messageOf(cause) })
    } finally {
      setBusy(false)
    }
  }

  const addSkill = async (): Promise<void> => {
    if (busy) return
    const name = addName.trim()
    if (name === '') {
      setMsg({ kind: 'err', text: t('emptyName') })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const result = await call<ManagedSkill>(ADD, { name, description: addDesc })
      setMsg({ kind: 'ok', text: t('addOk', { name: result.name }) })
      setAddName('')
      setAddDesc('')
      setShowAdd(false)
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('addFailed') + messageOf(cause) })
    } finally {
      setBusy(false)
    }
  }

  const importSkill = async (): Promise<void> => {
    if (busy) return
    const value = importValue.trim()
    if (value === '') {
      setMsg({ kind: 'err', text: t('emptyPath') })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const payload = importSource === 'local' ? { source: 'local' as const, path: value } : { source: 'skillhub' as const, slug: value }
      const result = await call<ManagedSkill>(IMPORT, payload)
      setMsg({ kind: 'ok', text: t('importOk', { name: result.name }) })
      setImportValue('')
      setShowImport(false)
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('importFailed') + messageOf(cause) })
    } finally {
      setBusy(false)
    }
  }

  /** 行内编辑表单：预填名字与描述，保存/取消由 ManagerEditRow 统一。 */
  const editRow = (state: Editing): JSX.Element => (
    <ManagerEditRow
      key={state.key}
      fields={
        <>
          <input
            value={state.name}
            placeholder="e.g. my-skill"
            aria-label={t('addName')}
            className="dx-input dx-focus"
            onChange={(e) => setEditing({ ...state, name: e.target.value })}
          />
          <input
            value={state.description}
            placeholder={t('addDescPlaceholder')}
            aria-label={t('addDesc')}
            className="dx-input dx-focus"
            onChange={(e) => setEditing({ ...state, description: e.target.value })}
          />
        </>
      }
      saveLabel={busy ? t('saving') : t('save')}
      cancelLabel={t('cancel')}
      busy={busy}
      disabled={disabled}
      onSave={() => void saveEdit()}
      onCancel={() => setEditing(null)}
    />
  )

  /** 技能行：左「名字 + 描述」，右「形态徽标 / 操作 / 开关」；编辑态整行换表单。 */
  const skillRow = (skill: ManagedSkill, list: ManagedSkill[]): JSX.Element => {
    const key = rowKey(skill)
    if (editing !== null && editing.key === key) return editRow(editing)
    const index = list.findIndex((item) => item.name === skill.name)
    const isFirst = index <= 0
    const isLast = index === list.length - 1
    return (
      <ManagerRow
        key={key}
        title={skill.name}
        description={skill.description || t('none')}
        badges={<span className="dx-badge">{skill.kind === 'bundle' ? t('bundle') : t('flat')}</span>}
        actions={
          <>
            <RowIconButton label={t('moveUp')} glyph="↑" disabled={busy || disabled || isFirst} onClick={() => void move(skill, list, -1)} />
            <RowIconButton label={t('moveDown')} glyph="↓" disabled={busy || disabled || isLast} onClick={() => void move(skill, list, 1)} />
            <RowIconButton label={t('edit')} glyph="✎" disabled={busy || disabled} onClick={() => startEdit(skill)} />
            <RowDeleteButton
              icon="✕"
              label={t('remove')}
              confirmLabel={t('confirmDelete')}
              cancelLabel={t('cancel')}
              confirming={confirmKey === key}
              disabled={busy || disabled}
              onArm={() => armConfirm(key)}
              onConfirm={() => void removeSkill(skill)}
              onCancel={clearConfirm}
            />
          </>
        }
        trailing={
          <RowSwitch
            label={skill.name}
            on={skill.enabled}
            disabled={busy || disabled}
            onToggle={() => void toggle(skill.name, !skill.enabled)}
          />
        }
      />
    )
  }

  if (phase === 'loading') {
    return <ManagerEmpty text={t('loading')} />
  }
  if (phase === 'error') {
    return <div className="dx-msg dx-msg--error">{t('loadFailed') + error}</div>
  }

  const skills = view?.skills ?? []
  const disabledSkills = view?.disabled ?? []
  const search = query.trim().toLowerCase()
  const filtering = search !== ''
  const matches = (skill: ManagedSkill): boolean =>
    search === '' || skill.name.toLowerCase().includes(search) || skill.description.toLowerCase().includes(search)
  const visibleSkills = skills.filter(matches)
  const visibleDisabled = disabledSkills.filter(matches)
  /** 分组计数：搜索态给「命中/总数」，否则给总数。 */
  const countOf = (shown: number, total: number): string => (filtering ? shown + '/' + total : String(total))

  /** 一段技能列表（已启用 / 已关闭）：分组标题 + 计数 + 行，扁平直排到外层 stack。 */
  const section = (title: string, list: ManagedSkill[], visibleList: ManagedSkill[]): JSX.Element => (
    <>
      <ManagerSectionHeader title={title} count={countOf(visibleList.length, list.length)} />
      {visibleList.length === 0
        ? <ManagerEmpty text={filtering ? t('noMatch') : t('none')} />
        : <ManagerRows>{visibleList.map((skill) => skillRow(skill, list))}</ManagerRows>}
    </>
  )

  return (
    <ModuleCard title={t('nav')} description={t('cardDescription')} disabled={disabled} bare={bare}>
      {/* bare 模式的外层：只做纵向 flex + gap */}
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
            <div style={ui.hstack(8)}>
              <span className="dx-label dx-label--inline">{t('addName')}</span>
              <input
                value={addName}
                placeholder="e.g. my-skill"
                aria-label={t('addName')}
                className="dx-input dx-focus"
                style={ui.grow}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <div style={ui.hstack(8)}>
              <span className="dx-label dx-label--inline">{t('addDesc')}</span>
              <input
                value={addDesc}
                placeholder={t('addDescPlaceholder')}
                aria-label={t('addDesc')}
                className="dx-input dx-focus"
                style={ui.grow}
                onChange={(e) => setAddDesc(e.target.value)}
              />
            </div>
            <div>
              <button type="button" disabled={busy || disabled} className="dx-btn dx-btn--primary dx-press dx-focus" onClick={() => void addSkill()}>
                {busy ? t('adding') : t('addBtn')}
              </button>
            </div>
          </div>
        ) : null}

        {showImport ? (
          <div className="dx-fade" style={ui.stack(8)}>
            <div style={ui.hstack(8)}>
              <span className="dx-label dx-label--inline">{t('importSourceLocal')}</span>
              <select
                value={importSource}
                aria-label="import source"
                className="dx-select dx-focus"
                style={ui.grow}
                onChange={(e) => setImportSource(e.target.value === 'skillhub' ? 'skillhub' : 'local')}
              >
                <option value="local">{t('importSourceLocal')}</option>
                <option value="skillhub">{t('importSourceSkillhub')}</option>
              </select>
            </div>
            <div style={ui.hstack(8)}>
              <input
                value={importValue}
                placeholder={importSource === 'local' ? t('importPathPlaceholder') : t('importSlugPlaceholder')}
                aria-label="import value"
                className="dx-input dx-focus"
                style={ui.grow}
                onChange={(e) => setImportValue(e.target.value)}
              />
            </div>
            <div>
              <button type="button" disabled={busy || disabled} className="dx-btn dx-btn--primary dx-press dx-focus" onClick={() => void importSkill()}>
                {busy ? t('importing') : t('importBtn')}
              </button>
            </div>
          </div>
        ) : null}

        {msg !== null ? <ManagerMsg kind={msg.kind} text={msg.text} /> : null}

        <ManagerSearch
          value={query}
          placeholder={t('searchPlaceholder')}
          clearLabel={t('clearSearch')}
          disabled={disabled}
          onChange={setQuery}
        />

        {section(t('enabledHeader'), skills, visibleSkills)}
        {section(t('disabledHeader'), disabledSkills, visibleDisabled)}
      </div>
    </ModuleCard>
  )
}
