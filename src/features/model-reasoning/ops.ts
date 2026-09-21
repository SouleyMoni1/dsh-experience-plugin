/**
 * model-reasoning —— 注入 patch 的纯函数部分（便于单测）。
 * 输入用户设置段里 `llm-pi-ai.providers` 的原始形状，输出一个适合
 * `ctx.settings.update` 的深合并 patch；不触碰任何服务。
 *
 * 为什么用 update（深合并）而不是 mutate（路径 op）：settings 的 mutate
 * 路径寻址只走对象键（applyPathOp 对数组段直接视为叶子替换），无法表达
 * `models[3].reasoningEfforts` 这种数组内寻址；官方 Models 页同样只把
 * 路径写到 `providers.<route>` 层，数组整体作为 value。所以这里把每条
 * 路由的 models 数组整体合并后放进 patch，其余字段全部原样保留。
 *
 * 每个模型的等级来源（优先级从高到低）：
 *   1. 插件配置 `effortsByApi[api]`（协议级显式覆盖）；
 *   2. 插件配置 `familyPresets`（按模型 id 正则）；
 *   3. 内置模型族知识库 FAMILY_PRESETS；
 *   4. FALLBACK_EFFORTS 兜底。
 * 已声明 reasoningEfforts 的模型默认不覆盖；若它恰等于旧版注入的统一默认
 * 表（插件注入过的旧值），则升级为新预设（`upgradeLegacy` 可关）。
 *
 * 除等级外，这里还负责补写模型的输入模态 `input`（pi-ai 的 text/image）：
 * DSH 判断"能否收图"只看目录里的 `inputModalities`，而自定义网关（edenai
 * 这类中转）的 /v1/models 不公布能力元数据、pi-ai 内置目录里也没有这些路由，
 * 于是模态落到路由级 defaultInput（默认 ['text']），能识图的模型被当成纯文本，
 * 发图时报 "当前模型不支持图片"。规则与等级一致但**更保守**：只在模型完全
 * 没声明 `input` 时补，且只有系列显式给出模态才补——缺省零注入。
 */
import type { ReasoningEfforts, FamilyPreset, ModelModality } from './defaults.js'
import {
  DEFAULT_EFFORTS_BY_API,
  FALLBACK_EFFORTS,
  FAMILY_PRESETS,
  INJECTABLE_APIS,
  LEGACY_UNIFORM_EFFORTS,
  matchFamilyPreset,
  normalizeModalities,
} from './defaults.js'

/** 用户设置段里一个 provider 条目的最小形状（我们只读 api/models 两个字段）。 */
export interface PiAiProviderSection {
  api?: unknown
  models?: unknown
}

/** 用户设置段里一个模型条目的最小形状。 */
export interface PiAiModelSection {
  reasoningEfforts?: unknown
  /** pi-ai 的输入模态；schema 会把缺省物化成 `[]`（等价于未声明）。 */
  input?: unknown
}

/** buildInjectionPatch 的选项。 */
export interface InjectionOptions {
  /** 协议级显式等级表；key 为 provider.api 的值。存在时该协议全部模型用它（最高优先级）。 */
  effortsByApi?: Record<string, ReasoningEfforts>
  /** 系列预设（正则 → 等级表），排在内置知识库之前；通常来自 settings 命名空间。 */
  familyPresets?: readonly FamilyPreset[]
  /** 兜底等级表（关键词未命中任何系列时）；缺省用 FALLBACK_EFFORTS。 */
  defaultEfforts?: ReasoningEfforts
  /** 内置知识库是否参与匹配；默认 true。用户已接管系列配置时传 false。 */
  includeBuiltinFamilies?: boolean
  /** 只处理列出的 provider 路由；空数组/缺省 = 全部。 */
  providers?: readonly string[]
  /** 允许注入的协议白名单。 */
  injectableApis?: readonly string[]
  /** 旧版统一默认值是否升级为新预设；默认 true。 */
  upgradeLegacy?: boolean
}

/** 注入 patch：providers 段的部分替换（深合并语义）。 */
export interface InjectionPatch {
  providers: Record<string, { models: unknown[] }>
}

/** buildInjectionPatch 的结果。 */
export interface InjectionResult {
  /** 待写入的深合并 patch（changed === 0 时为空对象）。 */
  patch: InjectionPatch
  /** 实际注入/升级的模型数（等级与模态任一被写入即计数）。 */
  changed: number
}

/** 深比较两个 reasoningEfforts 表。 */
export function effortsEqual(left: ReasoningEfforts, right: ReasoningEfforts): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => (left as Record<string, string | null | undefined>)[key] === (right as Record<string, string | null | undefined>)[key])
}

/**
 * 计算一个模型应当使用的等级表。
 * @param api - provider 的协议。
 * @param modelId - 模型 id。
 * @param options - 注入选项。
 * @returns 等级表（始终有值：effortsByApi 显式覆盖 → 用户预设 → 内置知识库 → 协议兜底 → 全局兜底）。
 */
export function resolveEffortsForModel(
  api: string,
  modelId: string,
  options: InjectionOptions,
): ReasoningEfforts {
  // 只有用户显式配置了 effortsByApi 才作为协议级覆盖；缺省走模型族匹配，
  // 否则所有模型都会拿到同一张表（这正是"等级全都一样"的根源）。
  const explicit = options.effortsByApi?.[api]
  if (explicit !== undefined) return explicit
  // 系列匹配：显式传入的系列在前；内置知识库按 includeBuiltinFamilies 参与
  //（用户已接管系列配置时关闭，否则用户删掉的系列会被内置知识库"复活"）。
  const presets = [
    ...(options.familyPresets ?? []),
    ...(options.includeBuiltinFamilies === false ? [] : FAMILY_PRESETS),
  ]
  const hit = matchFamilyPreset(modelId, presets)
  if (hit !== undefined) return hit.efforts
  return options.defaultEfforts ?? DEFAULT_EFFORTS_BY_API[api] ?? FALLBACK_EFFORTS
}

/**
 * 计算一个模型应当声明的输入模态。
 *
 * 与等级不同，模态没有协议级/全局兜底：只有系列（用户预设或内置知识库）
 * 显式给出 `input` 时才有值，否则返回 undefined = 不注入。这样"没配过"
 * 与"配成纯文本"是两回事，升级插件不会改变既有模型的能力声明。
 * @param modelId - 模型 id。
 * @param options - 注入选项。
 * @returns 模态表（text 在前）；系列未声明模态时返回 undefined。
 */
export function resolveModalitiesForModel(
  modelId: string,
  options: InjectionOptions,
): ModelModality[] | undefined {
  const presets = [
    ...(options.familyPresets ?? []),
    ...(options.includeBuiltinFamilies === false ? [] : FAMILY_PRESETS),
  ]
  const hit = matchFamilyPreset(modelId, presets)
  return normalizeModalities(hit?.input)
}

/**
 * 计算需要写入的 reasoningEfforts / input 合并 patch。
 *
 * 规则：
 *   - 只处理 api 在白名单内的 provider（默认 openai 系协议）；
 *   - 等级：只补 models 里缺失 reasoningEfforts 的条目（已声明——含 false——绝不
 *     覆盖，除非它是旧版注入的统一默认值且 upgradeLegacy 开启，此时升级为族预设）；
 *   - 模态：只补 models 里未声明 input 的条目，且系列必须显式给出模态；
 *   - 其余字段（name / contextWindow / maxTokens / apiKeyEnv / baseURL …）原样保留。
 * @param providers - `llm-pi-ai.providers` 原始用户段。
 * @param options - 注入选项。
 */
export function buildInjectionPatch(
  providers: Record<string, PiAiProviderSection>,
  options: InjectionOptions = {},
): InjectionResult {
  const { providers: only = [], injectableApis = INJECTABLE_APIS, upgradeLegacy = true } = options
  const patch: InjectionPatch = { providers: {} }
  let changed = 0

  for (const [route, provider] of Object.entries(providers)) {
    if (only.length > 0 && !only.includes(route)) continue

    const api = typeof provider?.api === 'string' ? provider.api : undefined
    if (api === undefined || !(injectableApis as readonly string[]).includes(api)) continue
    if (!Array.isArray(provider.models)) continue

    const models = provider.models as unknown[]
    let merged: unknown[] | undefined
    for (let index = 0; index < models.length; index++) {
      const model = models[index]
      if (model === null || typeof model !== 'object' || Array.isArray(model)) continue
      const entry = model as PiAiModelSection
      const modelId = typeof (entry as { id?: unknown }).id === 'string' ? (entry as { id: string }).id : ''

      const desired = resolveEffortsForModel(api, modelId, options)
      const existing = entry.reasoningEfforts
      const isLegacy = upgradeLegacy
        && typeof existing === 'object' && existing !== null && !Array.isArray(existing)
        && effortsEqual(existing as ReasoningEfforts, LEGACY_UNIFORM_EFFORTS)

      // 等级：已声明（含 false）不覆盖；仅旧版注入值在 upgradeLegacy 时升级。
      const writeEfforts = (existing === undefined || isLegacy)
        && !(isLegacy && effortsEqual(desired, LEGACY_UNIFORM_EFFORTS))

      // 模态：只在模型完全没声明 input 时补。schema 会把缺省物化成 `[]`，
      // 空表等价于未声明，因此这里连同空表一起视为"没配"。
      const desiredInput = resolveModalitiesForModel(modelId, options)
      const declaredInput = normalizeModalities(entry.input)
      const writeInput = desiredInput !== undefined && declaredInput === undefined

      if (!writeEfforts && !writeInput) continue

      if (merged === undefined) merged = structuredClone(models)
      const next: Record<string, unknown> = { ...(merged[index] as Record<string, unknown>) }
      if (writeEfforts) next.reasoningEfforts = desired
      if (writeInput) next.input = desiredInput
      merged[index] = next
      changed++
    }
    if (merged !== undefined) patch.providers[route] = { models: merged }
  }

  return { patch, changed }
}