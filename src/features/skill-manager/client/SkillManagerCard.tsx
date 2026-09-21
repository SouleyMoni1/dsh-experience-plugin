/**
 * skill-manager 设置卡片 —— 渲染在设置页「日用优化」分区「插件设置」页签。
 *
 * 管理 $DSH_HOME/skills 下的技能：
 *   - 列表：已启用 + 已关闭（关闭 = 物理移入 skills/.disabled，dsh 不再发现）；
 *   - 开关：移入/移回 .disabled，chokidar 热失效/热加载；
 *   - 新增：创建 skills/<name>/SKILL.md（最小 frontmatter 模板）；
 *   - 导入：本地目录复制，或 SkillHub slug（skillhub CLI）。
 *
 * 数据与操作走 host 端 RPC 通道 /dsh-skill-manager（loopback）。
 */
import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import type { ExperienceRpc } from '../../../client/rpc-transport.js'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
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

const selectStyle: CSSProperties = { ...inputStyle, flex: 'none', minWidth: 100 }

const msgStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: '20px',
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

  const skillRow = (skill: ManagedSkill): JSX.Element => (
    <div key={skill.name} style={rowStyle}>
      <div style={rowTextStyle}>
        <div style={rowTitleStyle}>{skill.name}</div>
        <div style={rowDescStyle}>{skill.description || t('none')}</div>
      </div>
      <span style={badgeStyle}>{skill.kind === 'bundle' ? t('bundle') : t('flat')}</span>
      <button
        type="button"
        role="switch"
        aria-checked={skill.enabled}
        aria-label={skill.name}
        disabled={busy || disabled}
        style={switchStyle(skill.enabled)}
        onClick={() => void toggle(skill.name, !skill.enabled)}
      >
        <span style={thumbStyle(skill.enabled)} />
      </button>
    </div>
  )

  if (phase === 'loading') {
    return <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>{t('loading')}</div>
  }
  if (phase === 'error') {
    return <div style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{t('loadFailed') + error}</div>
  }

  return (
    <ModuleCard title={t('nav')} description={t('cardDescription')} disabled={disabled} bare={bare}>
      <div style={actionRowStyle}>
        <button type="button" style={linkBtnStyle} onClick={() => { setShowAdd(!showAdd); setShowImport(false) }}>
          {showAdd ? '✕ ' : '+ '}{t('addTab')}
        </button>
        <button type="button" style={linkBtnStyle} onClick={() => { setShowImport(!showImport); setShowAdd(false) }}>
          {showImport ? '✕ ' : '⇩ '}{t('importTab')}
        </button>
      </div>

      {showAdd ? (
        <div style={formStyle}>
          <div style={fieldRowStyle}>
            <span style={labelStyle}>{t('addName')}</span>
            <input value={addName} placeholder="e.g. my-skill" aria-label={t('addName')} style={inputStyle} onChange={(e) => setAddName(e.target.value)} />
          </div>
          <div style={fieldRowStyle}>
            <span style={labelStyle}>{t('addDesc')}</span>
            <input value={addDesc} placeholder={t('addDescPlaceholder')} aria-label={t('addDesc')} style={inputStyle} onChange={(e) => setAddDesc(e.target.value)} />
          </div>
          <div>
            <button type="button" disabled={busy || disabled} style={{ ...linkBtnStyle, color: 'var(--dsw-alias-brand-primary)' }} onClick={() => void addSkill()}>
              {busy ? t('adding') : t('addBtn')}
            </button>
          </div>
        </div>
      ) : null}

      {showImport ? (
        <div style={formStyle}>
          <div style={fieldRowStyle}>
            <span style={labelStyle}>{t('importSourceLocal')}</span>
            <select
              value={importSource}
              aria-label="import source"
              style={selectStyle}
              onChange={(e) => setImportSource(e.target.value === 'skillhub' ? 'skillhub' : 'local')}
            >
              <option value="local">{t('importSourceLocal')}</option>
              <option value="skillhub">{t('importSourceSkillhub')}</option>
            </select>
          </div>
          <div style={fieldRowStyle}>
            <input
              value={importValue}
              placeholder={importSource === 'local' ? t('importPathPlaceholder') : t('importSlugPlaceholder')}
              aria-label="import value"
              style={inputStyle}
              onChange={(e) => setImportValue(e.target.value)}
            />
          </div>
          <div>
            <button type="button" disabled={busy || disabled} style={{ ...linkBtnStyle, color: 'var(--dsw-alias-brand-primary)' }} onClick={() => void importSkill()}>
              {busy ? t('importing') : t('importBtn')}
            </button>
          </div>
        </div>
      ) : null}

      {msg !== null ? (
        <div style={{ ...msgStyle, color: msg.kind === 'ok' ? '#12965b' : 'var(--dsw-alias-state-error-primary)' }}>{msg.text}</div>
      ) : null}

      <div style={headerStyle}>{t('enabledHeader')} ({view?.skills.length ?? 0})</div>
      {(view?.skills.length ?? 0) === 0 ? <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>{t('none')}</div> : null}
      {(view?.skills ?? []).map(skillRow)}

      <div style={headerStyle}>{t('disabledHeader')} ({view?.disabled.length ?? 0})</div>
      {(view?.disabled.length ?? 0) === 0 ? <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>{t('none')}</div> : null}
      {(view?.disabled ?? []).map(skillRow)}
    </ModuleCard>
  )
}
