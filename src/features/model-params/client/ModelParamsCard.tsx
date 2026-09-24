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
 *
 * 视觉：静态外观全部来自 .dx-* 类（规则盒 dx-panel、字段 dx-label / dx-input /
 * dx-select、复选 dx-check、徽标 dx-badge、按钮 dx-btn 变体），内联 style 只保留
 * 布局（flex / grid / gap / margin）与随状态变化的属性。
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { ui } from '../../../client/design/index.js'
import { ModuleCard } from '../../settings/client/ExperienceSettingsCard.js'
import { REASONING_EFFORT_LEVELS, MODEL_PARAMS_NS, type ModelParamsSettings, type ModelParamRule } from '../settings.js'

/** 规则盒：外观在 .dx-panel，这里只保留内部纵向堆叠与盒子间距。 */
const ruleBoxInline: CSSProperties = { ...ui.stack(10), marginBottom: 10 }

/** 字段网格：布局内联（自适应列 + 间距）。 */
const fieldGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
}

/** 横向行：布局内联（垂直居中 + 可换行）。 */
const rowInline: CSSProperties = { ...ui.hstack(8), flexWrap: 'wrap' }

/** 规则名称输入：外观在 .dx-input，这里只占满剩余宽度。 */
const nameFieldInline: CSSProperties = { flex: 1, minWidth: 140 }

/** 规则序号：外观在 .dx-label，这里只固定起始列宽。 */
const ruleIndexInline: CSSProperties = { minWidth: 62 }

/** 复选框标签：外观在 .dx-text / .dx-check，这里只写横向布局。 */
const checkLabelInline: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }

/** 说明文字：字号/颜色在 .dx-hint，这里只保留上方间距。 */
const hintInline: CSSProperties = { marginTop: 4 }

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
        <div className="dx-empty">加载中…</div>
      ) : phase === 'error' ? (
        <div className="dx-msg dx-msg--error">{error}</div>
      ) : (
        <div>
          <div style={{ ...rowInline, marginBottom: 12 }}>
            <label className="dx-text" style={checkLabelInline}>
              <input
                type="checkbox"
                className="dx-check dx-focus"
                checked={enabled}
                disabled={disabled}
                onChange={(event: any) => {
                  setEnabled(event.target.checked)
                  setDirty(true)
                }}
              />
              启用模型参数覆盖
            </label>
            {dirty ? <span className="dx-badge dx-badge--outline">未保存</span> : null}
            <span className="dx-hint" style={hintInline}>当前实际生效：temperature / maxTokens / reasoningEffort</span>
          </div>

          {rules.length === 0 ? (
            <div className="dx-hint" style={{ marginTop: 4, marginBottom: 12 }}>还没有规则。添加一条后，把 provider / 模型正则 / 参数留空即可匹配全部或部分模型。</div>
          ) : rules.map((rule, index) => (
            <div key={rule.id} className="dx-panel" style={ruleBoxInline}>
              <div style={rowInline}>
                <span className="dx-label dx-label--inline" style={ruleIndexInline}>
                  规则 {index + 1}
                </span>
                <input
                  type="text"
                  className="dx-input dx-focus"
                  style={nameFieldInline}
                  value={rule.label}
                  placeholder="规则名称"
                  disabled={disabled}
                  onChange={(event: any) => updateRule(rule.id, { label: event.target.value })}
                />
                <label className="dx-text" style={checkLabelInline}>
                  <input
                    type="checkbox"
                    className="dx-check dx-focus"
                    checked={rule.enabled}
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { enabled: event.target.checked })}
                  />
                  启用
                </label>
                <button type="button" className="dx-btn dx-btn--icon dx-press dx-focus" disabled={disabled || index === 0} onClick={() => moveRule(rule.id, -1)} title="上移">↑</button>
                <button type="button" className="dx-btn dx-btn--icon dx-press dx-focus" disabled={disabled || index === rules.length - 1} onClick={() => moveRule(rule.id, 1)} title="下移">↓</button>
                <button type="button" className="dx-btn dx-btn--danger dx-press dx-focus" disabled={disabled} onClick={() => removeRule(rule.id)}>
                  删除
                </button>
              </div>

              <div style={fieldGridStyle}>
                <div>
                  <label className="dx-label">Provider 路由</label>
                  <input
                    type="text"
                    className="dx-input dx-focus"
                    value={rule.provider}
                    placeholder="例如 custom-gateway / deepseek，留空=全部"
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { provider: event.target.value })}
                  />
                  <div className="dx-hint" style={hintInline}>settings.yaml 里 llm-pi-ai.providers 的键名</div>
                </div>
                <div>
                  <label className="dx-label">模型 ID 正则</label>
                  <input
                    type="text"
                    className="dx-input dx-focus"
                    value={rule.modelPattern}
                    placeholder="例如 ^deepseek-v4|grok-4，留空=全部"
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { modelPattern: event.target.value })}
                  />
                  <div className="dx-hint" style={hintInline}>按模型 id 做正则匹配（不自动加 ^$），先命中先得</div>
                </div>
              </div>

              <div style={fieldGridStyle}>
                <div>
                  <label className="dx-label">温度 temperature</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    className="dx-input dx-focus"
                    value={rule.temperature}
                    placeholder="继承"
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { temperature: event.target.value })}
                  />
                  <div className="dx-hint" style={hintInline}>0 更稳定，2 更发散；留空 = 不覆盖</div>
                </div>
                <div>
                  <label className="dx-label">最大输出 maxTokens</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="dx-input dx-focus"
                    value={rule.maxTokens}
                    placeholder="继承"
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { maxTokens: event.target.value })}
                  />
                  <div className="dx-hint" style={hintInline}>正整数；留空 = 使用适配器默认/会话值</div>
                </div>
                <div>
                  <label className="dx-label">思考等级 reasoningEffort</label>
                  <select
                    className="dx-select dx-focus"
                    value={rule.reasoningEffort}
                    disabled={disabled}
                    onChange={(event: any) => updateRule(rule.id, { reasoningEffort: event.target.value })}
                  >
                    <option value="">继承</option>
                    {REASONING_EFFORT_LEVELS.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                  <div className="dx-hint" style={hintInline}>与「模型思考等级」的档位一致；留空 = 不覆盖</div>
                </div>
              </div>
            </div>
          ))}

          <div style={{ ...rowInline, justifyContent: 'space-between', marginTop: 4 }}>
            <button type="button" className="dx-btn dx-btn--secondary dx-press dx-focus" disabled={disabled} onClick={addRule}>+ 添加规则</button>
            <div style={{ ...ui.hstack(8), flexWrap: 'wrap' }}>
              {savedAt > 0 ? <span className="dx-hint">已保存</span> : null}
              {error ? <span className="dx-msg dx-msg--error">{error}</span> : null}
              <button type="button" className="dx-btn dx-btn--ghost dx-press dx-focus" disabled={saving || !dirty || disabled} onClick={() => void load()}>放弃修改</button>
              <button type="button" className="dx-btn dx-btn--primary dx-press dx-focus" disabled={saving || disabled} onClick={() => void save()}>
                {saving ? '保存中…' : '保存配置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModuleCard>
  )
}
