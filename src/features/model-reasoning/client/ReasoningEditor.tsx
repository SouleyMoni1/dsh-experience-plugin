/**
 * model-reasoning 设置页 —— 模型思考等级 + 输入能力编辑器。
 *
 * 三块内容：
 *   1. 系列配置：默认兜底等级 + 系列规则（id / 名称 / 关键词正则 / 等级 / 输入模态），
 *      存到本插件的 settings 命名空间（dsh-experience-plugin），schema 默认值 =
 *      内置知识库，所以首次打开即为完整内置列表，可编辑、可增删。
 *   2. 模型等级：llm-pi-ai 下每个模型的等级开关（可折叠），保存时整体写回。
 *   3. 模型输入能力：每个模型的「文字 / 视觉」声明，写入 llm-pi-ai 的 `input`。
 *
 * 视觉：静态外观全部来自 .dx-* 类（分组 dx-card + dx-card__header / dx-card__body /
 * dx-card__chevron、行 dx-row、表单 dx-label / dx-input / dx-check、徽标 dx-badge、
 * 按钮 dx-btn、提示 dx-hint / dx-msg / dx-empty），内联 style 只留布局（flex / gap /
 * minWidth / boxSizing / 溢出）与折叠箭头旋转（ui.chevron）；列表项以 dx-rise 错峰浮入。
 *
 * 数据流与官方 Models 页一致：settings.describe → 编辑 → settings.update
 * 深合并 patch（数组整体替换、其余字段保留、revision 冲突保护）。
 */
import { useEffect, useRef, useState, type CSSProperties, type JSX, type SyntheticEvent } from 'react'
import { IconChevronDownOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import { cx, ui } from '../../../client/design/index.js'
import type { ExperienceRpc } from '../../../client/rpc-transport.js'
import type { SettingsAccess } from '../../../client/settings-access.js'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { FamilyRule } from '../defaults.js'
import type { ModelReasoningLocaleKey } from './locales.js'

/** client 端订阅 Host 转发事件的最小面（只用到 settings/document-updated）。 */
export interface RemoteEventSink {
  $on(event: 'settings/document-updated', listener: (ns: string, revision: number) => void): () => void
}

/** pi-ai 的 ModelThinkingLevel 枚举（与 host 端 THINKING_LEVELS 一致）。 */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

/** pi-ai 的输入模态（与 host 端 MODALITIES 一致）。 */
export const MODALITIES = ['text', 'image'] as const
export type ModelModality = (typeof MODALITIES)[number]

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

/** 模态 → 文案键。 */
const MODALITY_KEY: Record<ModelModality, ModelReasoningLocaleKey> = {
  text: 'modalityText',
  image: 'modalityImage',
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
  /** 输入模态声明；空数组 = 未声明（不写入 input）。 */
  input: ModelModality[]
  /** 命中的系列（id + 显示名）。 */
  family?: { id: string; label: string }
}

/** 收敛任意值为合法模态表（去重、text 在前）；空表 / 非法值 → 空数组 = 未声明。 */
function normalizeModalities(value: unknown): ModelModality[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<ModelModality>()
  for (const item of value) {
    if (typeof item === 'string' && (MODALITIES as readonly string[]).includes(item)) seen.add(item as ModelModality)
  }
  return MODALITIES.filter((modality) => seen.has(modality))
}

/**
 * 切换一个模态。视觉蕴含文字：勾「视觉」自动带上「文字」（纯图片模型没有意义），
 * 取消「文字」则一并取消「视觉」。全部取消 = 回到未声明状态。
 */
function toggleModality(list: readonly ModelModality[], modality: ModelModality): ModelModality[] {
  const next = new Set(list)
  if (next.has(modality)) {
    next.delete(modality)
    if (modality === 'text') next.delete('image')
  } else {
    next.add(modality)
    if (modality === 'image') next.add('text')
  }
  return MODALITIES.filter((item) => next.has(item))
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
  api: SettingsAccess | undefined
  /** 系列配置 RPC 通道（host 端 connection.rpc）。 */
  rpc: ExperienceRpc | undefined
  /** 转发事件订阅（settings/document-updated 等 Host 事件）。 */
  remote: RemoteEventSink | undefined
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
/** 本插件 settings 命名空间（与 host 端 MODEL_REASONING_NS 一致）。 */
const MR_SETTINGS_NS = 'dsh-experience-plugin'
/** 收到 document-updated 后延迟重拉：host 端注入有 500ms 防抖 + 异步 update。 */
const AUTO_REFRESH_DELAY_MS = 900

/** 页面状态。 */
type Phase = 'loading' | 'ready' | 'error'

/** 行内表单标签：外观在 .dx-label，这里只抵消它的堆叠下边距（行内布局）。 */
const labelInline: CSSProperties = { marginBottom: 0 }

/** 标题：字号 / 字重 / 颜色在 .dx-card__title，这里只抵消 h2 的默认外边距。 */
const titleInline: CSSProperties = { margin: 0 }

/** 长 id / 名称：只处理溢出布局，文本样式在 .dx-row__title / .dx-hint。 */
const wrapAnywhere: CSSProperties = { overflowWrap: 'anywhere', minWidth: 0 }

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
          <label key={level} style={{ ...ui.hstack(6), cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              className="dx-check dx-focus"
              checked={enabled}
              disabled={disabled}
              onChange={() => onToggle(level)}
            />
            <span className="dx-label" style={labelInline}>{t(LEVEL_KEY[level])}</span>
          </label>
        )
      })}
    </div>
  )
}

/** 输入模态开关组（模型级；视觉蕴含文字）。 */
function ModalityChips(props: {
  input: ModelModality[]
  disabled: boolean
  onToggle: (modality: ModelModality) => void
  t: TranslateNS<'model-reasoning'>
}): JSX.Element {
  const { input, disabled, onToggle, t } = props
  return (
    <div style={{ ...ui.hstack(8), flexWrap: 'wrap' }}>
      {MODALITIES.map((modality) => (
        <label key={modality} style={{ ...ui.hstack(6), cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            className="dx-check dx-focus"
            checked={input.includes(modality)}
            disabled={disabled}
            onChange={() => onToggle(modality)}
          />
          <span className="dx-label" style={labelInline}>{t(MODALITY_KEY[modality])}</span>
        </label>
      ))}
      {input.length === 0 && <span className="dx-hint">{t('modalityDefault')}</span>}
    </div>
  )
}

/** 模型思考等级设置页。 */
export function ReasoningEditor(props: ReasoningEditorProps): JSX.Element | null {
  const { api, rpc, remote, t, close } = props
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
  /** 折叠区开合：只驱动箭头旋转与卡片阴影，实际开合仍由原生 <details> 承担。 */
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({})
  const isOpen = (key: string, defaultOpen: boolean): boolean => openKeys[key] ?? defaultOpen
  const recordToggle = (key: string) => (event: SyntheticEvent<HTMLDetailsElement>): void => {
    const open = event.currentTarget.open
    setOpenKeys((prev) => (prev[key] === open ? prev : { ...prev, [key]: open }))
  }
  /** 是否有未保存的本地编辑（有编辑时自动刷新应让位，避免冲掉用户改动）。 */
  const dirtyRef = useRef(false)
  const markDirty = (): void => {
    dirtyRef.current = true
  }

  const load = async (silent = false): Promise<void> => {
    if (!silent) {
      setPhase('loading')
      setError('')
    }
    try {
      if (api === undefined) throw new Error('settings api unavailable')
      const response = await api.settings.describe({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      // 静默刷新在拉取期间用户可能开始编辑（dirty 变 true），
      // 此时放弃这份旧快照，避免把新改动覆盖掉。
      if (silent && dirtyRef.current) return
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
              input: normalizeModalities(raw.input),
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
      if (silent) {
        // 静默刷新失败：保留现有视图，只记录错误（下次全量加载再暴露）
        setError(cause instanceof Error ? cause.message : String(cause))
      } else {
        setError(cause instanceof Error ? cause.message : String(cause))
        setPhase('error')
      }
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  // 订阅 Host 转发的事件：官方 Models 页增删模型 / 手改 settings.yaml 后，
  // host 已自动注入 reasoningEfforts，这里自动重拉，避免"要手动刷新才看到"。
  // 用户正在编辑（dirty）时让位——等下次保存或手动刷新再同步，不冲掉改动。
  // host 端注入带 RESCAN_DEBOUNCE（500ms）+ 异步 update，这里多留一点余量，
  // 保证重拉时能看到注入后的最终值，而不是半路状态。
  const loadRef = useRef(load)
  loadRef.current = load
  const dirtyRefLocal = dirtyRef
  useEffect(() => {
    if (remote === undefined) return
    let pending: ReturnType<typeof setTimeout> | undefined
    const dispose = remote.$on('settings/document-updated', (ns) => {
      if (ns !== LLM_NS && ns !== MR_SETTINGS_NS) return
      if (dirtyRefLocal.current) return
      if (pending !== undefined) clearTimeout(pending)
      pending = setTimeout(() => {
        pending = undefined
        void loadRef.current(true)
      }, AUTO_REFRESH_DELAY_MS)
    })
    return () => {
      if (pending !== undefined) clearTimeout(pending)
      dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote])

  /** 切换一个模型的某个等级。 */
  const toggleLevel = (rowIndex: number, modelIndex: number, level: ThinkingLevel): void => {
    markDirty()
    setRows((prev) => {
      const next = structuredClone(prev)
      const efforts = next[rowIndex].models[modelIndex].efforts
      const current = efforts[level]
      if (current === undefined) efforts[level] = { enabled: true, wire: level === 'off' ? '' : level }
      else efforts[level] = { ...current, enabled: !current.enabled }
      return next
    })
  }

  /** 切换一个模型的某个输入模态。 */
  const toggleModelModality = (rowIndex: number, modelIndex: number, modality: ModelModality): void => {
    markDirty()
    setRows((prev) => {
      const next = structuredClone(prev)
      const model = next[rowIndex].models[modelIndex]
      model.input = toggleModality(model.input, modality)
      return next
    })
  }

  /** 切换系列配置里的一个等级。 */
  const toggleFamilyEffort = (index: number, level: ThinkingLevel): void => {
    markDirty()
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

  /** 切换系列配置里的一个输入模态。 */
  const toggleFamilyModality = (index: number, modality: ModelModality): void => {
    markDirty()
    setFamilies((prev) => {
      const next = structuredClone(prev)
      next[index] = { ...next[index], input: toggleModality(next[index].input ?? [], modality) }
      return next
    })
  }

  /** 切换默认配置里的一个等级。 */
  const toggleDefaultEffort = (level: ThinkingLevel): void => {
    markDirty()
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

  /** 按当前系列配置计算一个模型的输入模态（未命中系列时保持未声明）。 */
  const modalitiesForModel = (id: string): ModelModality[] => normalizeModalities(matchFamily(id, families)?.input)

  /** 把单个模型行按当前系列配置重新配对。 */
  const refreshModelFromFamily = (rowIndex: number, modelIndex: number): void => {
    markDirty()
    setRows((prev) => {
      const next = structuredClone(prev)
      const model = next[rowIndex].models[modelIndex]
      model.efforts = effortsForModel(model.id)
      model.input = modalitiesForModel(model.id)
      return next
    })
  }

  /** 把整个渠道下所有模型按当前系列配置一键重新配对。 */
  const refreshProvider = (rowIndex: number): void => {
    markDirty()
    setRows((prev) => {
      const next = structuredClone(prev)
      for (const model of next[rowIndex].models) {
        model.efforts = effortsForModel(model.id)
        model.input = modalitiesForModel(model.id)
      }
      return next
    })
  }

  /** 添加一个空白系列。 */
  const addFamily = (): void => {
    markDirty()
    setFamilies((prev) => [
      ...prev,
      { id: 'family-' + Date.now(), label: '', pattern: '', efforts: { off: null, low: 'low', medium: 'medium', high: 'high' } },
    ])
  }

  /** 删除一个系列。 */
  const removeFamily = (index: number): void => {
    markDirty()
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
          input: normalizeModalities(rule.input),
        })),
      }
      const mrResponse = await rpc.call(MR_RPC_CHANNEL, MR_RPC_WRITE, mrPatch)
      if (!mrResponse.ok) {
        const message = (mrResponse.error as { message?: string }).message ?? 'write failed'
        throw new Error(message)
      }
      const mrView = mrResponse.value as { revision?: number }
      if (typeof mrView.revision === 'number') setMrRevision(mrView.revision)

      // 2) 模型等级 / 输入能力 → llm-pi-ai（深合并：models 数组整体替换，其余字段保留）
      // 空勾选（一个等级都没启用）→ 省略 reasoningEfforts 字段：
      //   - pi-ai 拒绝空对象（"has an empty reasoningEfforts"）；
      //   - 省略 = 恢复该模型的目录能力，宿主扫描会按系列配置重新注入。
      // 模态同理：空表 = 未声明，省略 input 字段（pi-ai 把缺省与空表都当作"没配"）。
      if (api === undefined) throw new Error('settings api unavailable')
      const llmPatch: { providers: Record<string, { models: Record<string, unknown>[] }> } = { providers: {} }
      for (const row of rows) {
        llmPatch.providers[row.route] = {
          models: row.models.map((draft) => {
            const { reasoningEfforts: _droppedEfforts, input: _droppedInput, ...rest } = draft.raw
            const value = effortsValue(draft.efforts)
            const modalities = normalizeModalities(draft.input)
            return {
              ...rest,
              ...(Object.keys(value).length > 0 ? { reasoningEfforts: value } : {}),
              ...(modalities.length > 0 ? { input: modalities } : {}),
            }
          }),
        }
      }
      const llmResponse = await api.settings.update({ ns: LLM_NS, patch: llmPatch, expectedRevision: llmRevision })
      if (!llmResponse.result.ok) throw new Error(llmResponse.result.error.message)
      setLlmRevision(llmResponse.result.value.revision)

      setSavedAt(Date.now())
      dirtyRef.current = false
      void load()
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  if (phase === 'loading') {
    return <div className="dx-empty">{t('saving')}</div>
  }
  if (phase === 'error') {
    return <div className="dx-msg dx-msg--error">{t('loadError', { message: error })}</div>
  }

  return (
    <section className="dx-section" style={ui.stack(12)}>
      <h2 className="dx-card__title" style={titleInline}>{t('title')}</h2>
      <p className="dx-section__intro">{t('intro')}</p>
      {!writable && (
        <div className="dx-msg">{t('readOnly')}</div>
      )}

      {/* 系列配置区（可折叠，默认展开） */}
      <details
        open={isOpen('families', true)}
        onToggle={recordToggle('families')}
        className="dx-card"
        data-hover="true"
        data-open={isOpen('families', true)}
      >
        <summary className="dx-card__header dx-focus dx-tap" style={{ boxSizing: 'border-box', userSelect: 'none' }}>
          <span className="dx-card__title" style={ui.grow}>{t('familiesTitle')}</span>
          <span className="dx-card__chevron" aria-hidden="true" style={ui.chevron(isOpen('families', true))}>
            <IconChevronDownOutlineMedium />
          </span>
        </summary>
        <div className="dx-card__body" style={ui.stack(14)}>
          <p className="dx-section__intro">{t('familiesIntro')}</p>

          {/* 默认配置 */}
          <div>
            <div className="dx-label">{t('defaultEfforts')}</div>
            <EffortsChips efforts={defaultEfforts} disabled={!writable || saving} onToggle={toggleDefaultEffort} t={t} />
          </div>

          {/* 系列列表 */}
          <div style={ui.stack(8)}>
            {families.map((family, index) => (
              <details
                key={family.id}
                className="dx-rise"
                style={ui.stagger(index)}
                open={isOpen(family.id, false)}
                onToggle={recordToggle(family.id)}
              >
                <summary className="dx-row dx-focus dx-tap dx-press" data-hover="true" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <span className="dx-row__title">{family.label || family.pattern || ('family-' + (index + 1))}</span>
                  <span className="dx-hint" style={{ ...ui.grow, ...ui.ellipsis }}>{family.pattern}</span>
                  <span className="dx-card__chevron" aria-hidden="true" style={ui.chevron(isOpen(family.id, false))}>
                    <IconChevronDownOutlineMedium />
                  </span>
                </summary>
                <div style={ui.stack(8)}>
                  <div style={ui.hstack(8)}>
                    <label style={{ ...ui.stack(0), flex: 1, minWidth: 0 }}>
                      <span className="dx-label">{t('familyName')}</span>
                      <input
                        className="dx-input dx-focus"
                        value={family.label}
                        disabled={!writable || saving}
                        onChange={(event) => {
                          const value = event.target.value
                          markDirty()
                          setFamilies((prev) => {
                            const next = structuredClone(prev)
                            next[index] = { ...next[index], label: value }
                            return next
                          })
                        }}
                      />
                    </label>
                    <label style={{ ...ui.stack(0), flex: 1, minWidth: 0 }}>
                      <span className="dx-label">{t('familyPattern')}</span>
                      <input
                        className="dx-input dx-focus"
                        value={family.pattern}
                        placeholder={t('familyPatternPlaceholder')}
                        disabled={!writable || saving}
                        onChange={(event) => {
                          const value = event.target.value
                          markDirty()
                          setFamilies((prev) => {
                            const next = structuredClone(prev)
                            next[index] = { ...next[index], pattern: value }
                            return next
                          })
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="dx-btn dx-btn--danger dx-btn--sm dx-press dx-focus"
                      disabled={!writable || saving}
                      onClick={() => removeFamily(index)}
                      style={{ alignSelf: 'flex-end' }}
                    >
                      {t('deleteFamily')}
                    </button>
                  </div>
                  <EffortsChips efforts={effortsState(family.efforts)} disabled={!writable || saving} onToggle={(level) => toggleFamilyEffort(index, level)} t={t} />
                  <div>
                    <div className="dx-label">{t('modalities')}</div>
                    <ModalityChips input={normalizeModalities(family.input)} disabled={!writable || saving} onToggle={(modality) => toggleFamilyModality(index, modality)} t={t} />
                  </div>
                </div>
              </details>
            ))}
          </div>

          <div>
            <button type="button" className="dx-btn dx-btn--secondary dx-press dx-focus" disabled={!writable || saving} onClick={addFamily}>{t('addFamily')}</button>
          </div>
        </div>
      </details>

      {/* 模型等级区 */}
      <details
        open={isOpen('models', true)}
        onToggle={recordToggle('models')}
        className="dx-card"
        data-hover="true"
        data-open={isOpen('models', true)}
      >
        <summary className="dx-card__header dx-focus dx-tap" style={{ boxSizing: 'border-box', userSelect: 'none' }}>
          <span className="dx-card__title" style={ui.grow}>{t('modelsTitle')}</span>
          <span className="dx-card__chevron" aria-hidden="true" style={ui.chevron(isOpen('models', true))}>
            <IconChevronDownOutlineMedium />
          </span>
        </summary>
        <div className="dx-card__body" style={ui.stack(14)}>
          <p className="dx-section__intro">{t('modelsIntro')}</p>
          {rows.length === 0 ? (
            <div className="dx-empty">{t('empty')}</div>
          ) : (
            <div style={ui.stack(10)}>
              {rows.map((row, rowIndex) => (
                <div key={row.route} className="dx-rise" style={ui.stagger(rowIndex)}>
                  <details open={isOpen(row.route, true)} onToggle={recordToggle(row.route)}>
                    <summary className="dx-row dx-focus dx-tap dx-press" data-hover="true" style={{ cursor: 'pointer', userSelect: 'none' }}>
                      <span className="dx-row__title">{row.providerDisplay}</span>
                      <span className="dx-badge">{row.route}</span>
                      {row.api !== undefined && (
                        <span className="dx-badge">{row.api}</span>
                      )}
                      <span style={ui.grow} />
                      <button
                        type="button"
                        className="dx-btn dx-btn--ghost dx-btn--sm dx-press dx-focus"
                        disabled={!writable || saving}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          refreshProvider(rowIndex)
                        }}
                        style={{ flexShrink: 0 }}
                      >
                        {t('refreshProvider')}
                      </button>
                      <span className="dx-card__chevron" aria-hidden="true" style={ui.chevron(isOpen(row.route, true))}>
                        <IconChevronDownOutlineMedium />
                      </span>
                    </summary>
                    <div style={ui.stack(8)}>
                      {row.models.map((model, modelIndex) => {
                        const matched = matchFamily(model.id, families)
                        const openKey = row.route + '/' + model.id
                        return (
                          <details
                            key={model.id}
                            className="dx-rise"
                            style={ui.stagger(modelIndex)}
                            open={isOpen(openKey, false)}
                            onToggle={recordToggle(openKey)}
                          >
                            <summary className="dx-row dx-focus dx-tap dx-press" data-hover="true" style={{ cursor: 'pointer', userSelect: 'none' }}>
                              <span className="dx-mono dx-row__title" style={wrapAnywhere}>{model.id}</span>
                              {model.name !== undefined && model.name !== model.id && (
                                <span className="dx-hint" style={{ ...ui.ellipsis, minWidth: 0 }}>{model.name}</span>
                              )}
                              <span style={ui.grow} />
                              <span className={cx('dx-badge', matched === undefined && 'dx-badge--warn')} style={{ ...ui.ellipsis, flexShrink: 1 }}>
                                {matched !== undefined ? `${t('matchedFamily')}: ${matched.label}` : t('unmatched')}
                              </span>
                              <span className="dx-card__chevron" aria-hidden="true" style={ui.chevron(isOpen(openKey, false))}>
                                <IconChevronDownOutlineMedium />
                              </span>
                            </summary>
                            <div style={ui.stack(8)}>
                              <EffortsChips efforts={model.efforts} disabled={!writable || saving} onToggle={(level) => toggleLevel(rowIndex, modelIndex, level)} t={t} />
                              <div>
                                <div className="dx-label">{t('modalities')}</div>
                                <ModalityChips input={model.input} disabled={!writable || saving} onToggle={(modality) => toggleModelModality(rowIndex, modelIndex, modality)} t={t} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button type="button" className="dx-btn dx-btn--ghost dx-btn--sm dx-press dx-focus" disabled={!writable || saving} onClick={() => refreshModelFromFamily(rowIndex, modelIndex)}>
                                  {t('refreshFamily')}
                                </button>
                              </div>
                            </div>
                          </details>
                        )
                      })}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* 底部操作 */}
      <div style={{ ...ui.hstack(8), justifyContent: 'flex-end' }}>
        {saveError !== '' && (
          <span className="dx-msg dx-msg--error">{t('saveError', { message: saveError })}</span>
        )}
        {savedAt !== 0 && saveError === '' && (
          <span className="dx-msg dx-msg--ok">{t('saved')}</span>
        )}
        {close !== undefined && (
          <button type="button" className="dx-btn dx-btn--ghost dx-press dx-focus" disabled={!writable || saving} onClick={close}>{t('cancel')}</button>
        )}
        <button type="button" className="dx-btn dx-btn--primary dx-press dx-focus" disabled={!writable || saving} onClick={() => void save()}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </section>
  )
}
