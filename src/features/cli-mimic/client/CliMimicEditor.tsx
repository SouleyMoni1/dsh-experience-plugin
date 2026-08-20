/**
 * cli-mimic —— browser 半区：CLI 请求模拟配置编辑器。
 *
 * 这个组件只渲染配置内容，外层由统一的“DSH 体验插件配置”卡片负责模块下拉。
 */
import { useEffect, useState, type CSSProperties } from 'react'
import {
  createCustomProfile,
  normalizeStoredProfiles,
  presetById,
  PRESET_IDS,
  PROFILE_FIELDS,
  type MimicProfile,
  type StoredProfile,
} from '../profiles.js'

const NS = 'cli-mimic'

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid var(--dsw-alias-border-l2, #d0d7de)',
  background: 'var(--dsw-alias-bg-layer-3, #ffffff)',
  color: 'var(--dsw-alias-label-primary, #1f2328)',
  fontSize: '13px',
  fontFamily: 'inherit',
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--dsw-alias-label-primary, #24292f)',
}

const rowStyle: CSSProperties = {
  marginBottom: '14px',
}

const badgeStyle: CSSProperties = {
  whiteSpace: 'nowrap',
  background: 'var(--dsw-alias-bg-module-platform, #eef1f4)',
  color: 'var(--dsw-alias-label-secondary, #57606a)',
  borderRadius: '999px',
  flex: 'none',
  padding: '1px 8px',
  fontSize: '11px',
  fontWeight: 500,
  lineHeight: '17px',
}

const buttonStyle: CSSProperties = {
  font: 'inherit',
  cursor: 'pointer',
  border: '1px solid transparent',
  borderRadius: '8px',
  padding: '6px 12px',
  fontSize: '13px',
  lineHeight: 1.5,
}

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'var(--dsw-alias-brand-primary, #0969da)',
  color: '#ffffff',
}

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: 'var(--dsw-alias-border-l2, #d0d7de)',
  color: 'var(--dsw-alias-label-secondary, #57606a)',
  background: 'transparent',
}

const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: 'var(--dsw-alias-border-l2, #d0d7de)',
  color: 'var(--dsw-alias-state-error-primary, #cf222e)',
  background: 'transparent',
}

const chevronSvg = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6e7781" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
)

const selectStyle: CSSProperties = {
  ...inputStyle,
  height: '38px',
  appearance: 'none',
  paddingRight: '32px',
  backgroundImage: `url("data:image/svg+xml,${chevronSvg}")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  cursor: 'pointer',
}

const checkSvg = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
)

const checkboxStyle = (checked: boolean): CSSProperties => ({
  appearance: 'none',
  width: 18,
  height: 18,
  margin: 0,
  flex: 'none',
  borderRadius: 5,
  border: '1px solid var(--dsw-alias-border-l2, #d0d7de)',
  background: 'var(--dsw-alias-bg-layer-3, #ffffff)',
  cursor: 'pointer',
  ...(checked
    ? {
        borderColor: 'var(--dsw-alias-brand-primary, #0969da)',
        background: 'var(--dsw-alias-brand-primary, #0969da)',
        backgroundImage: `url("data:image/svg+xml,${checkSvg}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: '12px 12px',
      }
    : {}),
})

function toDraft(source: MimicProfile | StoredProfile): MimicProfile {
  return {
    name: source.name,
    targetPath: source.targetPath,
    port: source.port,
    host: source.host,
    upstreamBaseUrl: source.upstreamBaseUrl,
    apiKeyEnv: source.apiKeyEnv,
    authorizationPrefix: source.authorizationPrefix,
    userAgent: source.userAgent,
    originator: source.originator,
    installationId: source.installationId,
    addClientMetadata: source.addClientMetadata,
    extraHeadersJson: source.extraHeadersJson,
    extraBodyJson: source.extraBodyJson,
  }
}

const legacyRuntimeKeys = ['port', 'host', 'upstreamBaseUrl', 'apiKeyEnv', 'authorizationPrefix', 'installationId'] as const

function mergeRuntime(base: MimicProfile, legacy: MimicProfile | null): MimicProfile {
  const next = toDraft(base)
  if (!legacy) return next
  for (const key of legacyRuntimeKeys) {
    const value = legacy[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      ;(next as unknown as Record<string, unknown>)[key] = value
    }
  }
  return next
}

function field(label: string, value: string, onChange: (next: string) => void, textarea = false, monospace = false, disabled = false) {
  const style: CSSProperties = textarea
    ? { ...inputStyle, fontFamily: monospace ? 'monospace' : 'inherit', resize: 'vertical', minHeight: 72 }
    : inputStyle
  const props = {
    style: disabled ? { ...style, opacity: 0.7, cursor: 'not-allowed' } : style,
    value,
    onChange: (event: any) => onChange(event.target.value),
    disabled,
  }
  return (
    <div style={rowStyle}>
      <label style={labelStyle}>{label}</label>
      {textarea
        ? <textarea {...props} rows={4} />
        : <input {...props} type="text" />}
    </div>
  )
}

function selectField(label: string, value: string, onChange: (next: string) => void, options: Array<{ value: string; label: string }>, disabled = false) {
  return (
    <div style={rowStyle}>
      <label style={labelStyle}>{label}</label>
      <select
        style={disabled ? { ...selectStyle, opacity: 0.7, cursor: 'not-allowed' } : selectStyle}
        value={value}
        onChange={(event: any) => onChange(event.target.value)}
        disabled={disabled}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

function toggleRow(checked: boolean, label: string, onChange: (next: boolean) => void, disabled = false) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: '16px',
      opacity: disabled ? 0.7 : 1,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event: any) => onChange(event.target.checked)}
        disabled={disabled}
        style={checkboxStyle(checked)}
      />
      <label style={{ fontSize: 13, color: 'var(--dsw-alias-label-primary, #1f2328)', cursor: disabled ? 'not-allowed' : 'pointer' }}>{label}</label>
    </div>
  )
}

export interface CliMimicEditorProps {
  api: any
}

export function CliMimicEditor(props: CliMimicEditorProps): any {
  const { api } = props
  const [phase, setPhase] = useState('loading')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [enabled, setEnabled] = useState(false)
  const [profiles, setProfiles] = useState<Record<string, StoredProfile>>({})
  const [activeId, setActiveId] = useState('codex')
  const [legacy, setLegacy] = useState<MimicProfile | null>(null)
  const [draft, setDraft] = useState<MimicProfile>(() => toDraft(presetById('codex')!))
  const [customName, setCustomName] = useState('Codex CLI 自定义')
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [activeChanged, setActiveChanged] = useState(false)
  const [libraryChanged, setLibraryChanged] = useState(false)

  const load = async () => {
    setPhase('loading')
    setError('')
    try {
      if (!api) throw new Error('settings api unavailable')
      const response = await api.settings.describe({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      const view = response.result.value.namespaces.find((entry: any) => entry.ns === NS)
      const value = view?.value ?? {}
      const nextProfiles = normalizeStoredProfiles(value.profiles)
      const nextActive = typeof value.activeProfileId === 'string' && (nextProfiles[value.activeProfileId] || presetById(value.activeProfileId))
        ? value.activeProfileId
        : 'codex'
      const source = nextProfiles[nextActive] ?? presetById(nextActive) ?? presetById('codex')!
      const legacyDraft = toDraft(value as MimicProfile)
      setEnabled(Boolean(value.enabled))
      setProfiles(nextProfiles)
      setActiveId(nextActive)
      setLegacy(legacyDraft)
      setDraft(nextProfiles[nextActive] ? toDraft(source) : mergeRuntime(toDraft(source), legacyDraft))
      setCustomName(nextProfiles[nextActive] ? source.name : `${source.name} 自定义`)
      setDeletedIds([])
      setDirty(false)
      setActiveChanged(false)
      setLibraryChanged(false)
      setRevision(view?.revision ?? 0)
      setPhase('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPhase('error')
    }
  }

  useEffect(() => {
    void load()
  }, [api])

  const setField = (key: keyof MimicProfile, value: unknown) => {
    if (!profiles[activeId]) return
    setDraft((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const setEnabledToggle = (next: boolean) => {
    setEnabled(next)
    setDirty(true)
  }

  const setProfileName = (next: string) => {
    if (!profiles[activeId]) return
    setCustomName(next)
    setDirty(true)
  }

  const selectProfile = (id: string) => {
    if (id === activeId) return
    if (dirty && !window.confirm('放弃当前未保存修改？')) return
    const source = profiles[id] ?? presetById(id) ?? presetById('codex')!
    setActiveId(id)
    setDraft(profiles[id] ? toDraft(source) : mergeRuntime(toDraft(source), legacy))
    setCustomName(profiles[id] ? source.name : `${source.name} 自定义`)
    setDirty(false)
    setActiveChanged(true)
    setLibraryChanged(false)
  }

  const addCustom = () => {
    const source = profiles[activeId] ?? presetById(activeId) ?? presetById('codex')!
    const next = createCustomProfile(customName.trim() || `${source.name} 自定义`, draft)
    setProfiles((prev) => ({ ...prev, [next.id]: next }))
    setActiveId(next.id)
    setDraft(toDraft(next))
    setCustomName(next.name)
    setDirty(false)
    setActiveChanged(true)
    setLibraryChanged(true)
  }

  const duplicateCurrent = () => {
    const base = profiles[activeId] ?? presetById(activeId) ?? presetById('codex')!
    const next = createCustomProfile(`${customName.trim() || base.name} 副本`, { ...base, ...draft })
    setProfiles((prev) => ({ ...prev, [next.id]: next }))
    setActiveId(next.id)
    setDraft(toDraft(next))
    setCustomName(next.name)
    setDirty(false)
    setActiveChanged(true)
    setLibraryChanged(true)
  }

  const removeProfile = (id: string) => {
    const target = profiles[id]
    if (!target) return
    if (id === activeId && !window.confirm(`删除自定义配置“${target.name}”？`)) return
    const nextProfiles = { ...profiles }
    delete nextProfiles[id]
    setProfiles(nextProfiles)
    setDeletedIds((prev) => prev.includes(id) ? prev : [...prev, id])
    if (id === activeId) {
      const fallback = presetById('codex')!
      setActiveId('codex')
      setDraft(mergeRuntime(toDraft(fallback), legacy))
      setCustomName(`${fallback.name} 自定义`)
      setDirty(false)
      setActiveChanged(true)
    }
    setLibraryChanged(true)
  }

  const discard = () => {
    void load()
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      if (!api) throw new Error('settings api unavailable')
      const nextProfiles = { ...profiles }
      const isPreset = !nextProfiles[activeId]
      let nextActive = activeId
      let nextDraft = draft

      for (const jsonKey of ['extraHeadersJson', 'extraBodyJson'] as const) {
        try {
          const parsed = JSON.parse(nextDraft[jsonKey])
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required')
        } catch {
          throw new Error(`${jsonKey} 必须是 JSON 对象`)
        }
      }

      if (!isPreset) {
        const existing = nextProfiles[activeId]
        nextProfiles[activeId] = {
          ...existing,
          ...nextDraft,
          id: activeId,
          kind: 'custom',
          name: customName.trim() || existing.name,
          createdAt: existing.createdAt || Date.now(),
        }
        nextDraft = toDraft(nextProfiles[activeId])
      }

      const patch: Record<string, unknown> = {
        enabled,
        activeProfileId: nextActive,
        profiles: nextProfiles,
      }
      if (isPreset) {
        const preset = presetById(activeId)
        if (preset) {
          for (const key of PROFILE_FIELDS) {
            if (key !== 'name') patch[key] = nextDraft[key]
          }
        }
      }
      const response = await api.settings.update({
        ns: NS,
        patch,
        expectedRevision: revision,
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      let nextRevision = response.result.value.revision
      if (deletedIds.length > 0) {
        const mutation = await api.settings.mutate({
          ns: NS,
          ops: deletedIds.map((id) => ({ op: 'unset', path: ['profiles', id] })),
          expectedRevision: nextRevision,
        })
        if (!mutation.result.ok) throw new Error(mutation.result.error.message)
        nextRevision = mutation.result.value.revision
      }
      setRevision(nextRevision)
      setDeletedIds([])
      setProfiles(nextProfiles)
      setActiveId(nextActive)
      setDraft(nextDraft)
      setCustomName(nextDraft.name)
      setDirty(false)
      setActiveChanged(false)
      setLibraryChanged(false)
      setSavedAt(Date.now())
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  if (phase === 'loading') {
    return <div style={{ padding: '14px 16px', color: 'var(--dsw-alias-label-tertiary, #6e7781)', fontSize: 13 }}>加载中…</div>
  }
  if (phase === 'error') {
    return <div style={{ padding: '14px 16px', color: 'var(--dsw-alias-state-error-primary, #cf222e)', fontSize: 13 }}>{error}</div>
  }

  const isPreset = !profiles[activeId]
  const source = profiles[activeId] ?? presetById(activeId) ?? presetById('codex')!
  const displayName = isPreset ? source.name : customName.trim() || source.name
  const customEntries = Object.values(profiles).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  const hasChanges = dirty || activeChanged || libraryChanged
  const profileNameInput = !isPreset
    ? field('自定义名称', customName, setProfileName)
    : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--dsw-alias-label-primary, #1f2328)', fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>CLI 请求模拟</span>
        <span style={{ color: 'var(--dsw-alias-label-tertiary, #6e7781)', fontSize: 13, lineHeight: 1.5 }}>{displayName} · {enabled ? '已启用' : '未启用'}</span>
        {hasChanges ? <span style={badgeStyle}>未保存</span> : null}
      </div>

      {toggleRow(enabled, '全局开启 CLI 请求模拟', setEnabledToggle)}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 200 }}>
          <label style={{ ...labelStyle, marginBottom: 6 }}>当前配置 · {customEntries.length} 个自定义</label>
          <select
            style={selectStyle}
            value={activeId}
            onChange={(event: any) => selectProfile(event.target.value)}
          >
            <optgroup label="预设">
              {PRESET_IDS.map((id) => {
                const preset = presetById(id)!
                return <option key={id} value={id}>{preset.name}</option>
              })}
            </optgroup>
            {customEntries.length > 0
              ? <optgroup label="自定义">
                  {customEntries.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </optgroup>
              : null}
          </select>
        </div>
        <button type="button" style={ghostButtonStyle} onClick={duplicateCurrent}>复制</button>
        <button type="button" style={ghostButtonStyle} onClick={addCustom}>新建</button>
        {!isPreset
          ? <button type="button" style={dangerButtonStyle} onClick={() => removeProfile(activeId)}>删除</button>
          : null}
      </div>

      {profileNameInput}
      {selectField('请求路径', draft.targetPath, (v) => setField('targetPath', v), [
        { value: '/codex/responses', label: 'Codex Responses' },
        { value: '/responses', label: 'OpenAI Responses' },
        { value: '/messages', label: 'Anthropic Messages' },
      ], isPreset)}
      {field('上游 base URL（留空 = 保留原请求地址）', draft.upstreamBaseUrl, (v) => setField('upstreamBaseUrl', v), false, false, isPreset)}
      {field('凭证环境变量名', draft.apiKeyEnv, (v) => setField('apiKeyEnv', v), false, false, isPreset)}
      {field('Authorization 前缀', draft.authorizationPrefix, (v) => setField('authorizationPrefix', v), false, false, isPreset)}
      {field('User-Agent', draft.userAgent, (v) => setField('userAgent', v), false, false, isPreset)}
      {field('originator（留空不发送）', draft.originator, (v) => setField('originator', v), false, false, isPreset)}
      {field('installation id（留空自动生成）', draft.installationId, (v) => setField('installationId', v), false, false, isPreset)}
      {field('本地代理端口', String(draft.port), (v) => setField('port', Number(v) || 4123), false, false, isPreset)}
      {field('本地代理监听地址', draft.host, (v) => setField('host', v), false, false, isPreset)}
      {toggleRow(draft.addClientMetadata, '注入 client_metadata', (v) => setField('addClientMetadata', v), isPreset)}
      {field('额外请求头 JSON', draft.extraHeadersJson, (v) => setField('extraHeadersJson', v), true, true, isPreset)}
      {field('额外请求体 JSON', draft.extraBodyJson, (v) => setField('extraBodyJson', v), true, true, isPreset)}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
        <button type="button" disabled={saving} onClick={() => void save()} style={primaryButtonStyle}>
          {saving ? '保存中…' : isPreset ? '使用此预设' : '保存配置'}
        </button>
        <button type="button" disabled={saving || !hasChanges} onClick={discard} style={ghostButtonStyle}>放弃修改</button>
        {savedAt > 0 ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6e7781)' }}>已保存</span> : null}
        {error ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-state-error-primary, #cf222e)' }}>{error}</span> : null}
      </div>
    </div>
  )
}
