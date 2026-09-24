/**
 * skill-manager 设置卡片 —— 渲染在设置页「日用优化」分区的「Skills 管理」页签（bare）。
 *
 * 管理 $DSH_HOME/skills 下的技能：
 *   - 列表：已启用 + 已关闭（关闭 = 物理移入 skills/.disabled，dsh 不再发现）；
 *   - 开关：移入/移回 .disabled，chokidar 热失效/热加载；
 *   - 新增：创建 skills/<name>/SKILL.md（最小 frontmatter 模板）；
 *   - 导入：本地目录复制，或 SkillHub slug（skillhub CLI）。
 *
 * 数据与操作走 host 端 RPC 通道 /dsh-skill-manager（loopback）。
 *
 * 视觉：静态外观全部来自 .dx-* 类（技能行 dx-row、开关 dx-switch、表单
 * dx-label / dx-input / dx-select、徽标 dx-badge），内联 style 只留布局与
 * 错峰延迟；bare 模式外层只做纵向 flex + gap，不再套定宽内容列。
 */
import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import type { ExperienceRpc } from '../../../client/rpc-transport.js'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { cx, ui } from '../../../client/design/index.js'
import { ModuleCard } from '../../settings/client/ExperienceSettingsCard.js'

/** RPC 通道（与 host 端 SKILL_MANAGER_RPC_CHANNEL 一致）。 */
const CHANNEL = '/dsh-skill-manager'
const LIST = 'skill/manager/list'
const TOGGLE = 'skill/manager/toggle'
const ADD = 'skill/manager/add'
const IMPORT = 'skill/manager/import'

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

/** 行内标签：只写布局；字号/颜色在 .dx-label，这里抵消它的堆叠下边距。 */
const labelInline: CSSProperties = { flex: 'none', marginBottom: 0 }

/** 行内输入框：只写布局；外观在 .dx-input。 */
const fieldInline: CSSProperties = { flex: 1, minWidth: 120 }

/** 行内下拉：只写布局（width:auto 抵消 .dx-select 的通栏宽度）；外观在 .dx-select。 */
const selectInline: CSSProperties = { flex: 'none', width: 'auto', minWidth: 120 }

/** 卡片 props：RPC 通道 + 文案。 */
export interface SkillManagerCardProps {
  rpc: ExperienceRpc | undefined
  t: TranslateNS<'skill-manager'>
  /** 禁用态（模块关闭时）。 */
  disabled?: boolean
  /** 裸渲染：作为独立选项卡页面，不使用 ModuleCard 外壳。 */
  bare?: boolean
}

/** 技能管理卡：列表 + 开关 + 新增 + 导入。 */
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
      setMsg({ kind: 'ok', text: t('toggleOk', { name, action: next ? t('enabled') : t('disabled') }) })
      await load()
    } catch (cause) {
      setMsg({ kind: 'err', text: t('toggleFailed') + (cause instanceof Error ? cause.message : String(cause)) })
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
      setMsg({ kind: 'err', text: t('addFailed') + (cause instanceof Error ? cause.message : String(cause)) })
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
      setMsg({ kind: 'err', text: t('importFailed') + (cause instanceof Error ? cause.message : String(cause)) })
    } finally {
      setBusy(false)
    }
  }

  /** 技能行：dx-row 承载外观与悬停，dx-rise + ui.stagger 做错峰入场。 */
  const skillRow = (skill: ManagedSkill, index: number): JSX.Element => (
    <div key={skill.name} className="dx-row dx-rise" style={ui.stagger(index)}>
      <div style={{ ...ui.stack(2), ...ui.grow }}>
        <div className="dx-row__title">{skill.name}</div>
        <div className="dx-row__desc" style={ui.ellipsis}>{skill.description || t('none')}</div>
      </div>
      <span className="dx-badge">{skill.kind === 'bundle' ? t('bundle') : t('flat')}</span>
      <button
        type="button"
        role="switch"
        aria-checked={skill.enabled}
        aria-label={skill.name}
        disabled={busy || disabled}
        className="dx-switch dx-focus dx-tap"
        style={ui.switchTrack(skill.enabled)}
        onClick={() => void toggle(skill.name, !skill.enabled)}
      >
        <span className="dx-switch__thumb" style={ui.switchThumb(skill.enabled)} />
      </button>
    </div>
  )

  if (phase === 'loading') {
    return <div className="dx-empty">{t('loading')}</div>
  }
  if (phase === 'error') {
    return <div className="dx-msg dx-msg--error">{t('loadFailed') + error}</div>
  }

  return (
    <ModuleCard title={t('nav')} description={t('cardDescription')} disabled={disabled} bare={bare}>
      {/* bare 模式的外层：只做纵向 flex + gap */}
      <div style={ui.stack(10)}>
        <div style={ui.hstack(8)}>
          <button type="button" className="dx-btn dx-btn--link dx-press dx-focus" onClick={() => { setShowAdd(!showAdd); setShowImport(false) }}>
            {showAdd ? '✕ ' : '+ '}{t('addTab')}
          </button>
          <button type="button" className="dx-btn dx-btn--link dx-press dx-focus" onClick={() => { setShowImport(!showImport); setShowAdd(false) }}>
            {showImport ? '✕ ' : '⇩ '}{t('importTab')}
          </button>
        </div>

        {showAdd ? (
          <div style={ui.stack(2)}>
            <div className="dx-row">
              <span className="dx-label" style={labelInline}>{t('addName')}</span>
              <input value={addName} placeholder="e.g. my-skill" aria-label={t('addName')} className="dx-input dx-focus" style={fieldInline} onChange={(e) => setAddName(e.target.value)} />
            </div>
            <div className="dx-row">
              <span className="dx-label" style={labelInline}>{t('addDesc')}</span>
              <input value={addDesc} placeholder={t('addDescPlaceholder')} aria-label={t('addDesc')} className="dx-input dx-focus" style={fieldInline} onChange={(e) => setAddDesc(e.target.value)} />
            </div>
            <div>
              <button type="button" disabled={busy || disabled} className="dx-btn dx-btn--primary dx-press dx-focus" onClick={() => void addSkill()}>
                {busy ? t('adding') : t('addBtn')}
              </button>
            </div>
          </div>
        ) : null}

        {showImport ? (
          <div style={ui.stack(2)}>
            <div className="dx-row">
              <span className="dx-label" style={labelInline}>{t('importSourceLocal')}</span>
              <select
                value={importSource}
                aria-label="import source"
                className="dx-select dx-focus"
                style={selectInline}
                onChange={(e) => setImportSource(e.target.value === 'skillhub' ? 'skillhub' : 'local')}
              >
                <option value="local">{t('importSourceLocal')}</option>
                <option value="skillhub">{t('importSourceSkillhub')}</option>
              </select>
            </div>
            <div className="dx-row">
              <input
                value={importValue}
                placeholder={importSource === 'local' ? t('importPathPlaceholder') : t('importSlugPlaceholder')}
                aria-label="import value"
                className="dx-input dx-focus"
                style={fieldInline}
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

        {msg !== null ? (
          <div className={cx('dx-msg', msg.kind === 'ok' ? 'dx-msg--ok' : 'dx-msg--error')}>{msg.text}</div>
        ) : null}

        <div style={ui.stack(4)}>
          <div className="dx-label">{t('enabledHeader')} ({view?.skills.length ?? 0})</div>
          {(view?.skills.length ?? 0) === 0 ? <div className="dx-empty">{t('none')}</div> : null}
          {(view?.skills ?? []).map((skill, i) => skillRow(skill, i))}
        </div>

        <div style={ui.stack(4)}>
          <div className="dx-label">{t('disabledHeader')} ({view?.disabled.length ?? 0})</div>
          {(view?.disabled.length ?? 0) === 0 ? <div className="dx-empty">{t('none')}</div> : null}
          {(view?.disabled ?? []).map((skill, i) => skillRow(skill, i))}
        </div>
      </div>
    </ModuleCard>
  )
}
