/**
 * model-reasoning 设置页 —— 模型思考等级编辑器。
 *
 * 两块内容：
 *   1. 系列配置：默认兜底等级 + 系列规则（id / 名称 / 关键词正则 / 等级），
 *      存到本插件的 settings 命名空间（dsh-experience-plugin），schema 默认值 =
 *      内置知识库，所以首次打开即为完整内置列表，可编辑、可增删。
 *   2. 模型等级：llm-pi-ai 下每个模型的等级开关（可折叠），保存时整体写回。
 *
 * 数据流与官方 Models 页一致：settings.describe → 编辑 → settings.update
 * 深合并 patch（数组整体替换、其余字段保留、revision 冲突保护）。
 */
import { useEffect, useState, type JSX } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientConnectionRpc, IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { FamilyRule } from '../defaults.js'
import type { ModelReasoningLocaleKey } from './locales.js'

/** pi-ai 的 ModelThinkingLevel 枚举（与 host 端 THINKING_LEVELS 一致）。 */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

/** 等级 → 文案键（保持 t() 的键为字面量）。 */
const LEVEL_KEY: Record<ThinkingLevel, ModelReasoningLocaleKey> = {
  off: 'levelOff',
  minimal: 'levelMinimal',
  low: 'levelLow',
  medium: 'levelMedium',
  high: 'levelHigh',
  xhigh: 'levelXhigh',
  max: 'levelMax',
}

/** 一个模型条目的编辑状态。 */
interface ModelDraft {
  route: string
  api?: string
  id: string
  name?: string
  /** 该模型原始条目（保存时原样带回其它字段）。 */
  raw: Record<string, unknown>
  /** 每个等级的开关与 wire。 */
  efforts: Partial<Record<ThinkingLevel, { enabled: boolean; wire: string }>>
  /** 命中的系列（id + 显示名）。 */
  family?: { id: string; label: string }
}

/** 从设置段还原一个模型的等级表。 */
function effortsOf(model: Record<string, unknown>): ModelDraft['efforts'] {
  const raw = model.reasoningEfforts
  const out: ModelDraft['efforts'] = {}
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const level of THINKING_LEVELS) {
      const value = (raw as Record<string, unknown>)[level]
      if (value === null) out[level] = { enabled: true, wire: '' }
      else if (typeof value === 'string') out[level] = { enabled: true, wire: value }
    }
  }
  return out
}

/** 匹配一个模型 id 命中的系列（按数组顺序，先命中先得）。 */
function matchFamily(modelId: string, families: readonly FamilyRule[]): FamilyRule | undefined {
  for (const family of families) {
    if (family.pattern.trim().length === 0) continue
    try {
      if (new RegExp(family.pattern, 'i').test(modelId)) return family
    } catch {
      // 非法正则：跳过该系列
    }
  }
  return undefined
}

/** 等级表 → 编辑状态。 */
function effortsState(efforts: FamilyRule['efforts']): ModelDraft['efforts'] {
  const out: ModelDraft['efforts'] = {}
  for (const level of THINKING_LEVELS) {
    const value = efforts[level]
    if (value === null) out[level] = { enabled: true, wire: '' }
    else if (typeof value === 'string') out[level] = { enabled: true, wire: value }
  }
  return out
}

/** 编辑状态 → 可写入的等级表。 */
function effortsValue(state: ModelDraft['efforts']): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const level of THINKING_LEVELS) {
    const entry = state[level]
    if (entry === undefined || !entry.enabled) continue
    out[level] = level === 'off' ? null : (entry.wire.trim() || level)
  }
  return out
}

/** 编辑器注入面（register 的 inject 工厂返回值）。 */
export interface ReasoningEditorInjected {
  api: Pick<IApiClient, 'settings'> | undefined
  /** 系列配置 RPC 通道（host 端 connection.rpc）。 */
  rpc: ClientConnectionRpc | undefined
  t: TranslateNS<'model-reasoning'>
}

/** 系列配置 RPC 通道。 */
const MR_RPC_CHANNEL = '/dsh-experience-plugin'
const MR_RPC_GET = 'model-reasoning/get'
const MR_RPC_WRITE = 'model-reasoning/write'

/** GET 返回（与 host 端 remote.ts 的 FamilySettingsView 对应）。 */
interface FamilySettingsView {
  defaultEfforts: Record<string, string | null>
  families: FamilyRule[]
  userOwns: boolean
  revision: number
}

/** 属性：inject 面 + owner（设置页提供 close；嵌入统一卡片时可不传）。 */
export interface ReasoningEditorProps extends ReasoningEditorInjected {
  close?: () => void
}

interface Row {
  route: string
  api?: string
  providerDisplay: string
  models: ModelDraft[]
}

const LLM_NS = 'llm-pi-ai'

/** 页面状态。 */
type Phase = 'loading' | 'ready' | 'error'

/** 等级开关组（系列或模型共用；wire 固定取等级名，不提供输入框）。 */
function EffortsChips(props: {
  efforts: ModelDraft['efforts']
  disabled: boolean
  onToggle: (level: ThinkingLevel) => void
  t: TranslateNS<'model-reasoning'>
}): JSX.Element {
  const { efforts, disabled, onToggle, t } = props
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {THINKING_LEVELS.map((level) => {
        const entry = efforts[level]
        const enabled = entry !== undefined && entry.enabled
        return (
          <label key={level} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={disabled}
              onChange={() => onToggle(level)}
              style={{ margin: 0, accentColor: 'var(--dsw-alias-brand-primary)' }}
            />
            <span style={{ fontSize: 13, lineHeight: '20px' }}>{t(LEVEL_KEY[level])}</span>
          </label>
        )
      })}
    </div>
  )
}

/** 模型思考等级设置页。 */
export function ReasoningEditor(props: ReasoningEditorProps): JSX.Element | null {
  const { api, rpc, t, close } = props
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [writable, setWritable] = useState(true)
  // 系列配置编辑状态（初始来自命名空间 value = 默认→用户合并）
  const [families, setFamilies] = useState<FamilyRule[]>([])
  const [defaultEfforts, setDefaultEfforts] = useState<ModelDraft['efforts']>({})
  const [mrRevision, setMrRevision] = useState<number | undefined>(undefined)
  const [llmRevision, setLlmRevision] = useState<number | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [saveError, setSaveError] = useState<string>('')

  const load = async (): Promise<void> => {
    setPhase('loading')
    setError('')
    try {
      if (api === undefined) throw new Error('settings api unavailable')
      const response = await api.settings.describe({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      const namespaces = response.result.value.namespaces
      setWritable(response.result.value.writable)

      // 系列配置：经 RPC 通道读取（settings 命名空间不直接暴露给配置客户端）
      if (rpc !== undefined) {
        const rpcResponse = await rpc.call(MR_RPC_CHANNEL, MR_RPC_GET, {})
        if (rpcResponse.ok) {
          const view = rpcResponse.value as FamilySettingsView
          setMrRevision(view.revision)
          setFamilies(Array.isArray(view.families) ? view.families.map((rule) => ({ ...rule })) : [])
          setDefaultEfforts(effortsState((view.defaultEfforts ?? {}) as FamilyRule['efforts']))
        } else {
          const message = (rpcResponse.error as { message?: string }).message ?? 'rpc failed'
          throw new Error(message)
        }
      } else {
        setFamilies([])
        setDefaultEfforts({})
      }

      // llm-pi-ai 模型
      const view = namespaces.find((entry) => entry.ns === LLM_NS)
      if (view !== undefined) {
        setLlmRevision(view.revision)
        const providers = (view.user as { providers?: Record<string, Record<string, unknown>> } | undefined)?.providers ?? {}
        const next: Row[] = []
        for (const [route, provider] of Object.entries(providers)) {
          const models = Array.isArray(provider.models) ? provider.models : []
          const drafts: ModelDraft[] = []
          for (const entry of models) {
            if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
            const raw = entry as Record<string, unknown>
            if (typeof raw.id !== 'string' || raw.id.length === 0) continue
            drafts.push({
              route,
              api: typeof provider.api === 'string' ? provider.api : undefined,
              id: raw.id,
              name: typeof raw.name === 'string' ? raw.name : undefined,
              raw: { ...raw },
              efforts: effortsOf(raw),
            })
          }
          if (drafts.length > 0) {
            next.push({
              route,
              api: typeof provider.api === 'string' ? provider.api : undefined,
              providerDisplay: typeof provider.displayName === 'string' ? provider.displayName : route,
              models: drafts,
            })
          }
        }
        setRows(next)
      } else {
        setRows([])
      }
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

  /** 切换一个模型的某个等级。 */
  const toggleLevel = (rowIndex: number, modelIndex: number, level: ThinkingLevel): void => {
    setRows((prev) => {
      const next = structuredClone(prev)
      const efforts = next[rowIndex].models[modelIndex].efforts
      const current = efforts[level]
      if (current === undefined) efforts[level] = { enabled: true, wire: level === 'off' ? '' : level }
      else efforts[level] = { ...current, enabled: !current.enabled }
      return next
    })
  }

  /** 切换系列配置里的一个等级。 */
  const toggleFamilyEffort = (index: number, level: ThinkingLevel): void => {
    setFamilies((prev) => {
      const next = structuredClone(prev)
      const efforts = next[index].efforts
      if (efforts[level] === undefined) {
        next[index] = { ...next[index], efforts: { ...efforts, [level]: level === 'off' ? null : level } }
      } else {
        const { [level]: removed, ...kept } = efforts
        next[index] = { ...next[index], efforts: kept }
      }
      return next
    })
  }

  /** 切换默认配置里的一个等级。 */
  const toggleDefaultEffort = (level: ThinkingLevel): void => {
    setDefaultEfforts((prev) => {
      const next = structuredClone(prev)
      const current = next[level]
      if (current === undefined) next[level] = { enabled: true, wire: level === 'off' ? '' : level }
      else next[level] = { ...current, enabled: !current.enabled }
      return next
    })
  }

  /** 按当前系列配置计算一个模型的等级（未命中时用默认配置）。 */
  const effortsForModel = (id: string): ModelDraft['efforts'] => {
    const matched = matchFamily(id, families)
    if (matched !== undefined) return effortsState(matched.efforts)
    const value: Record<string, string | null> = {}
    for (const level of THINKING_LEVELS) {
      const entry = defaultEfforts[level]
      if (entry === undefined || !entry.enabled) continue
      value[level] = level === 'off' ? null : (entry.wire.trim() || level)
    }
    return effortsState(value as FamilyRule['efforts'])
  }

  /** 把单个模型行按当前系列配置重新配对。 */
  const refreshModelFromFamily = (rowIndex: number, modelIndex: number): void => {
    setRows((prev) => {
      const next = structuredClone(prev)
      next[rowIndex].models[modelIndex].efforts = effortsForModel(next[rowIndex].models[modelIndex].id)
      return next
    })
  }

  /** 把整个渠道下所有模型按当前系列配置一键重新配对。 */
  const refreshProvider = (rowIndex: number): void => {
    setRows((prev) => {
      const next = structuredClone(prev)
      for (const model of next[rowIndex].models) model.efforts = effortsForModel(model.id)
      return next
    })
  }

  /** 添加一个空白系列。 */
  const addFamily = (): void => {
    setFamilies((prev) => [
      ...prev,
      { id: 'family-' + Date.now(), label: '', pattern: '', efforts: { off: null, low: 'low', medium: 'medium', high: 'high' } },
    ])
  }

  /** 删除一个系列。 */
  const removeFamily = (index: number): void => {
    setFamilies((prev) => prev.filter((_, i) => i !== index))
  }

  /** 保存全部（系列配置 + 模型等级）。 */
  const save = async (): Promise<void> => {
    if (!writable || saving) return
    setSaving(true)
    setSaveError('')
    try {
      // 1) 系列配置 → RPC 通道写本插件命名空间
      if (rpc === undefined) throw new Error('settings rpc channel unavailable')
      const mrPatch = {
        defaultEfforts: effortsValue(defaultEfforts),
        families: families.map((rule) => ({
          id: rule.id || 'family-' + Date.now(),
          label: rule.label.trim() || rule.pattern.trim() || rule.id,
          pattern: rule.pattern.trim(),
          efforts: effortsValue(effortsState(rule.efforts)),
        })),
      }
      const mrResponse = await rpc.call(MR_RPC_CHANNEL, MR_RPC_WRITE, mrPatch)
      if (!mrResponse.ok) {
        const message = (mrResponse.error as { message?: string }).message ?? 'write failed'
        throw new Error(message)
      }
      const mrView = mrResponse.value as { revision?: number }
      if (typeof mrView.revision === 'number') setMrRevision(mrView.revision)

      // 2) 模型等级 → llm-pi-ai（深合并：models 数组整体替换，其余字段保留）
      // 空勾选（一个等级都没启用）→ 省略 reasoningEfforts 字段：
      //   - pi-ai 拒绝空对象（"has an empty reasoningEfforts"）；
      //   - 省略 = 恢复该模型的目录能力，宿主扫描会按系列配置重新注入。
      if (api === undefined) throw new Error('settings api unavailable')
      const llmPatch: { providers: Record<string, { models: Record<string, unknown>[] }> } = { providers: {} }
      for (const row of rows) {
        llmPatch.providers[row.route] = {
          models: row.models.map((draft) => {
            const { reasoningEfforts: _dropped, ...rest } = draft.raw
            const value = effortsValue(draft.efforts)
            return Object.keys(value).length > 0 ? { ...rest, reasoningEfforts: value } : rest
          }),
        }
      }
      const llmResponse = await api.settings.update({ ns: LLM_NS, patch: llmPatch, expectedRevision: llmRevision })
      if (!llmResponse.result.ok) throw new Error(llmResponse.result.error.message)
      setLlmRevision(llmResponse.result.value.revision)

      setSavedAt(Date.now())
      void load()
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  if (phase === 'loading') {
    return <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 14 }}>{t('saving')}</div>
  }
  if (phase === 'error') {
    return <div style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 14 }}>{t('loadError', { message: error })}</div>
  }

  return (
    <section style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--dsw-alias-label-primary)' }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, lineHeight: '24px' }}>{t('title')}</h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-tertiary)' }}>{t('intro')}</p>
      {!writable && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-warn-label)' }}>{t('readOnly')}</p>
      )}

      {/* 系列配置区（可折叠，默认展开） */}
      <details open style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: '12px 14px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, lineHeight: '22px', userSelect: 'none' }}>
          {t('familiesTitle')}
        </summary>
        <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }}>{t('familiesIntro')}</p>

        {/* 默认配置 */}
        <div style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 8, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: '20px' }}>{t('defaultEfforts')}</span>
          </div>
          <EffortsChips efforts={defaultEfforts} disabled={!writable || saving} onToggle={toggleDefaultEffort} t={t} />
        </div>

        {/* 系列列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {families.map((family, index) => (
            <details key={family.id} style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, lineHeight: '20px', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 500 }}>{family.label || family.pattern || ('family-' + (index + 1))}</span>
                <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{family.pattern}</span>
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <span style={{ fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)' }}>{t('familyName')}</span>
                    <Input
                      value={family.label}
                      disabled={!writable || saving}
                      onChange={(event) => {
                        const value = event.target.value
                        setFamilies((prev) => {
                          const next = structuredClone(prev)
                          next[index] = { ...next[index], label: value }
                          return next
                        })
                      }}
                      style={{ height: 30, fontSize: 13 }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <span style={{ fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)' }}>{t('familyPattern')}</span>
                    <Input
                      value={family.pattern}
                      placeholder={t('familyPatternPlaceholder')}
                      disabled={!writable || saving}
                      onChange={(event) => {
                        const value = event.target.value
                        setFamilies((prev) => {
                          const next = structuredClone(prev)
                          next[index] = { ...next[index], pattern: value }
                          return next
                        })
                      }}
                      style={{ height: 30, fontSize: 13 }}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!writable || saving}
                    onClick={() => removeFamily(index)}
                    style={{ color: 'var(--dsw-alias-state-error-primary)', marginTop: 16 }}
                  >
                    {t('deleteFamily')}
                  </Button>
                </div>
                <EffortsChips efforts={effortsState(family.efforts)} disabled={!writable || saving} onToggle={(level) => toggleFamilyEffort(index, level)} t={t} />
              </div>
            </details>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <Button variant="outline" size="md" disabled={!writable || saving} onClick={addFamily}>{t('addFamily')}</Button>
        </div>
      </details>

      {/* 模型等级区 */}
      <details open style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: '12px 14px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, lineHeight: '22px', userSelect: 'none' }}>
          {t('modelsTitle')}
        </summary>
        <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }}>{t('modelsIntro')}</p>
        {rows.length === 0 ? (
          <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-tertiary)' }}>{t('empty')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((row, rowIndex) => (
              <li key={row.route} style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <details open>
                  <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, lineHeight: '22px' }}>{row.providerDisplay}</span>
                    <span style={{ border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 4, padding: '1px 6px', fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-secondary)' }}>{row.route}</span>
                    {row.api !== undefined && (
                      <span style={{ border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 4, padding: '1px 6px', fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-secondary)' }}>{row.api}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!writable || saving}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        refreshProvider(rowIndex)
                      }}
                      style={{ marginLeft: 'auto', flexShrink: 0 }}
                    >
                      {t('refreshProvider')}
                    </Button>
                  </summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
                    {row.models.map((model, modelIndex) => {
                      const matched = matchFamily(model.id, families)
                      return (
                        <details key={model.id} style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 8 }}>
                          <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, userSelect: 'none' }}>
                            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: '20px', fontFamily: 'var(--ds-font-family-code)', overflowWrap: 'anywhere' }}>{model.id}</span>
                            {model.name !== undefined && model.name !== model.id && (
                              <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.name}</span>
                            )}
                            {matched !== undefined ? (
                              <span style={{ border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 4, padding: '1px 6px', fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-secondary)', marginLeft: 'auto' }}>
                                {t('matchedFamily')}: {matched.label}
                              </span>
                            ) : (
                              <span style={{ border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 4, padding: '1px 6px', fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-state-warn-label)', marginLeft: 'auto' }}>
                                {t('unmatched')}
                              </span>
                            )}
                          </summary>
                          <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <EffortsChips efforts={model.efforts} disabled={!writable || saving} onToggle={(level) => toggleLevel(rowIndex, modelIndex, level)} t={t} />
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <Button variant="ghost" size="sm" disabled={!writable || saving} onClick={() => refreshModelFromFamily(rowIndex, modelIndex)}>
                                {t('refreshFamily')}
                              </Button>
                            </div>
                          </div>
                        </details>
                      )
                    })}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </details>

      {/* 底部操作 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
        {saveError !== '' && (
          <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }}>{t('saveError', { message: saveError })}</span>
        )}
        {savedAt !== 0 && saveError === '' && (
          <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-success-primary)' }}>{t('saved')}</span>
        )}
        {close !== undefined && (
          <Button variant="ghost" size="md" disabled={!writable || saving} onClick={close}>{t('cancel')}</Button>
        )}
        <Button variant="primary" size="md" disabled={!writable || saving} onClick={() => void save()}>
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </section>
  )
}