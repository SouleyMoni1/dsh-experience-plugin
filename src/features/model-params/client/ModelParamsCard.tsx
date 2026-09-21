/**
 * model-params —— 设置页「模型参数手动配置」卡片。
 *
 * 配置说明：
 *   - 规则按列表顺序匹配，先命中先得（provider 留空 = 全部路由；
 *     modelPattern 留空 = 该路由下全部模型；modelPattern 是正则，按子串匹配）。
 *   - 实际生效字段：temperature（0..2）、maxTokens（正整数）、
 *     reasoningEffort（off/minimal/low/medium/high/xhigh/max）；
 *     空值表示继承，不覆盖。
 *   - 当前 DSH 的 llm-pi-ai 适配器只支持这三个 GenerateOptions 字段，
 *     所以不提供 top_p / frequency_penalty 这类「看起来能配但不会生效」的假开关。
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { ModuleCard } from '../../settings/client/ExperienceSettingsCard.js'
import { REASONING_EFFORT_LEVELS, MODEL_PARAMS_NS, type ModelParamsSettings, type ModelParamRule } from '../settings.js'

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--dsw-alias-label-primary, #24292f)',
}

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

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--dsw-alias-label-tertiary, #6e7781)',
  lineHeight: 1.5,
  marginTop: 4,
}

const ruleBoxStyle: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2, #d0d7de)',
  borderRadius: '10px',
  background: 'var(--dsw-alias-bg-layer-3, #ffffff)',
  padding: '12px',
  marginBottom: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const fieldGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
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
  borderColor: 'var(--dsw-alias-state-error-border, #ff818266)',
  color: 'var(--dsw-alias-state-error-primary, #cf222e)',
  background: 'transparent',
}

const iconButtonStyle: CSSProperties = {
  ...buttonStyle,
  padding: '4px 8px',
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

/** 编辑器草稿：数字用字符串，方便留空表示“继承”。 */
interface RuleDraft {
  id: string
  label: string
  enabled: boolean
  provider: string
  modelPattern: string
  temperature: string
  maxTokens: string
  reasoningEffort: string
}

function toDraft(rule: ModelParamRule): RuleDraft {
  return {
    id: rule.id,
    label: rule.label,
    enabled: rule.enabled,
    provider: rule.provider,
    modelPattern: rule.modelPattern,
    temperature: rule.temperature === null ? '' : String(rule.temperature),
    maxTokens: rule.maxTokens === null ? '' : String(rule.maxTokens),
    reasoningEffort: rule.reasoningEffort ?? '',
  }
}

function fromDraft(draft: RuleDraft): ModelParamRule {
  const temperature = draft.temperature.trim() === '' ? null : Number(draft.temperature)
  const maxTokens = draft.maxTokens.trim() === '' ? null : Math.max(1, Math.floor(Number(draft.maxTokens)))
  return {
    id: draft.id,
    label: draft.label.trim() || draft.modelPattern.trim() || draft.provider.trim() || '未命名规则',
    enabled: draft.enabled,
    provider: draft.provider.trim(),
    modelPattern: draft.modelPattern.trim(),
    temperature: temperature !== null && Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : null,
    maxTokens: maxTokens !== null && Number.isFinite(maxTokens) ? maxTokens : null,
    reasoningEffort: draft.reasoningEffort.trim() === '' ? null : draft.reasoningEffort.trim(),
  }
}

function newDraft(): RuleDraft {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: '新规则',
    enabled: true,
    provider: '',
    modelPattern: '',
    temperature: '',
    maxTokens: '',
    reasoningEffort: '',
  }
}

export interface ModelParamsCardProps {
  api: any
  /** 禁用态（模块关闭时）。 */
  disabled?: boolean
}

export function ModelParamsCard(props: ModelParamsCardProps): any {
  const { api, disabled } = props
  const [phase, setPhase] = useState('loading')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [revision, setRevision] = useState(0)
  const [enabled, setEnabled] = useState(true)
  const [rules, setRules] = useState<RuleDraft[]>([])
  const [dirty, setDirty] = useState(false)

  const load = async (): Promise<void> => {
    setPhase('loading')
    setError('')
    try {
      if (!api) throw new Error('settings api unavailable')
      const response = await api.settings.describe({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      const view = response.result.value.namespaces.find((entry: any) => entry.ns === MODEL_PARAMS_NS)
      const value = (view?.value ?? {}) as ModelParamsSettings
      setEnabled(value.enabled === true)
      setRules(Array.isArray(value.rules) ? value.rules.map(toDraft) : [])
      setRevision(view?.revision ?? 0)
      setDirty(false)
      setPhase('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPhase('error')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      if (!api) throw new Error('settings api unavailable')
      const cleanRules = rules.map(fromDraft)
      const response = await api.settings.update({
        ns: MODEL_PARAMS_NS,
        patch: { enabled, rules: cleanRules },
        expectedRevision: revision,
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      setRevision(response.result.value.revision)
      setRules(cleanRules.map(toDraft))
      setDirty(false)
      setSavedAt(Date.now())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const updateRule = (id: string, patch: Partial<RuleDraft>): void => {
    setRules((prev) => prev.map((rule) => rule.id === id ? { ...rule, ...patch } : rule))
    setDirty(true)
  }

  const removeRule = (id: string): void => {
    setRules((prev) => prev.filter((rule) => rule.id !== id))
    setDirty(true)
  }

  const moveRule = (id: string, delta: -1 | 1): void => {
    setRules((prev) => {
      const index = prev.findIndex((rule) => rule.id === id)
      if (index < 0) return prev
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
    setDirty(true)
  }

  const addRule = (): void => {
    setRules((prev) => [...prev, newDraft()])
    setDirty(true)
  }

  return (
    <ModuleCard title="模型参数" description="按 Provider / 模型手动覆盖温度、输出上限、思考等级" disabled={disabled}>
      {phase === 'loading' ? (
        <div style={{ padding: '14px 0', color: 'var(--dsw-alias-label-tertiary, #6e7781)', fontSize: 13 }}>加载中…</div>
      ) : phase === 'error' ? (
        <div style={{ padding: '14px 0', color: 'var(--dsw-alias-state-error-primary, #cf222e)', fontSize: 13 }}>{error}</div>
      ) : (
        <div>
          <div style={{ ...rowStyle, marginBottom: 12 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={enabled}
                disabled={disabled}
                onChange={(event: any) => {
                  setEnabled(event.target.checked)
                  setDirty(true)
                }}
                style={{ margin: 0, accentColor: 'var(--dsw-alias-brand-primary)' }}
              />
              启用模型参数覆盖
            </label>
            {dirty ? <span style={badgeStyle}>未保存</span> : null}
            <span style={hintStyle}>当前实际生效：temperature / maxTokens / reasoningEffort</span>
          </div>

          {rules.length === 0 ? (
            <div style={{ ...hintStyle, marginBottom: 12 }}>还没有规则。添加一条后，把 provider / 模型正则 / 参数留空即可匹配全部或部分模型。</div>
          ) : rules.map((rule, index) => (
            <div key={rule.id} style={ruleBoxStyle}>
              <div style={rowStyle}>
                <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6e7781)', fontWeight: 600, minWidth: 62 }}>
                  规则 {index + 1}
                </span>
                <input
                  type="text"
                  style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                  value={rule.label}
                  placeholder="规则名称"
                  disabled={disabled}
                  onChange={(event: any) => updateRule(rule.id, { label: event.target.value })}
                />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { enabled: event.target.checked })}
                    style={{ margin: 0, accentColor: 'var(--dsw-alias-brand-primary)' }}
                  />
                  启用
                </label>
                <button type="button" style={iconButtonStyle} disabled={disabled || index === 0} onClick={() => moveRule(rule.id, -1)} title="上移">↑</button>
                <button type="button" style={iconButtonStyle} disabled={disabled || index === rules.length - 1} onClick={() => moveRule(rule.id, 1)} title="下移">↓</button>
                <button type="button" style={dangerButtonStyle} disabled={disabled} onClick={() => removeRule(rule.id)}>
                  删除
                </button>
              </div>

              <div style={fieldGridStyle}>
                <div>
                  <label style={labelStyle}>Provider 路由</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={rule.provider}
                    placeholder="例如 custom-gateway / deepseek，留空=全部"
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { provider: event.target.value })}
                  />
                  <div style={hintStyle}>settings.yaml 里 llm-pi-ai.providers 的键名</div>
                </div>
                <div>
                  <label style={labelStyle}>模型 ID 正则</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={rule.modelPattern}
                    placeholder="例如 ^deepseek-v4|grok-4，留空=全部"
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { modelPattern: event.target.value })}
                  />
                  <div style={hintStyle}>按模型 id 做正则匹配（不自动加 ^$），先命中先得</div>
                </div>
              </div>

              <div style={fieldGridStyle}>
                <div>
                  <label style={labelStyle}>温度 temperature</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    style={inputStyle}
                    value={rule.temperature}
                    placeholder="继承"
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { temperature: event.target.value })}
                  />
                  <div style={hintStyle}>0 更稳定，2 更发散；留空 = 不覆盖</div>
                </div>
                <div>
                  <label style={labelStyle}>最大输出 maxTokens</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    style={inputStyle}
                    value={rule.maxTokens}
                    placeholder="继承"
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { maxTokens: event.target.value })}
                  />
                  <div style={hintStyle}>正整数；留空 = 使用适配器默认/会话值</div>
                </div>
                <div>
                  <label style={labelStyle}>思考等级 reasoningEffort</label>
                  <select
                    style={inputStyle}
                    value={rule.reasoningEffort}
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { reasoningEffort: event.target.value })}
                  >
                    <option value="">继承</option>
                    {REASONING_EFFORT_LEVELS.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                  <div style={hintStyle}>与「模型思考等级」的档位一致；留空 = 不覆盖</div>
                </div>
              </div>
            </div>
          ))}

          <div style={{ ...rowStyle, justifyContent: 'space-between', marginTop: 4 }}>
            <button type="button" style={ghostButtonStyle} disabled={disabled} onClick={addRule}>+ 添加规则</button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {savedAt > 0 ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6e7781)' }}>已保存</span> : null}
              {error ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-state-error-primary, #cf222e)' }}>{error}</span> : null}
              <button type="button" style={ghostButtonStyle} disabled={saving || !dirty || disabled} onClick={() => void load()}>放弃修改</button>
              <button type="button" style={primaryButtonStyle} disabled={saving || disabled} onClick={() => void save()}>
                {saving ? '保存中…' : '保存配置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModuleCard>
  )
}
