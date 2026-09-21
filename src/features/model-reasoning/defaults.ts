/**
 * model-reasoning 功能 —— 默认思考等级表 + 模型族知识库。
 *
 * pi-ai 的 ModelThinkingLevel 枚举：off / minimal / low / medium / high / xhigh / max。
 * 每个等级的 value 是发给网关的 wire 拼写：
 *   - null 仅允许 off（"支持但不发送任何参数" —— 对多数提供方，不思考 = 参数缺省）
 *   - 其它等级必须给出 wire 字符串
 *
 * openai-responses / openai-completions 协议的标准拼写就是 low / medium / high，
 * 网关（含 claude / codex / grok / glm 的 OpenAI 兼容中转）按此透传。
 */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** 一个可选的思考等级：key = 等级，value = wire 拼写（仅 off 可为 null）。 */
export type ReasoningEfforts = Partial<Record<(typeof THINKING_LEVELS)[number], string | null>>

/**
 * pi-ai 的 ModelModality 枚举：text / image。
 *
 * 背景：DSH 判断"这个模型能不能收图"只看模型目录的 `inputModalities`，
 * 而该值来自 pi-ai 模型条目的 `input` 字段。自定义网关（edenai 这类中转）
 * 的 /v1/models 只返回 id、不公布任何能力元数据，pi-ai 内置目录里也没有
 * 这些路由，于是 `input` 落到路由级 defaultInput（默认 ['text']）——模型
 * 明明能识图，DSH 却按纯文本处理，发图时报 "当前模型不支持图片"。
 *
 * 这里把 `input` 纳入本功能的可配置面：勾选"视觉"即写入 ['text','image']，
 * 让模型选择器与图片准入立刻认识该模型。缺省不注入（保持 pi-ai 原样），
 * 避免给纯文本模型误开图片能力。
 */
export const MODALITIES = ['text', 'image'] as const

/** 一种输入模态。 */
export type ModelModality = (typeof MODALITIES)[number]

/** 按协议（provider.api）划分的默认等级表；可在插件配置里整体替换。 */
export const DEFAULT_EFFORTS_BY_API: Record<string, ReasoningEfforts> = {
  'openai-responses': {
    off: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
  },
  'openai-completions': {
    off: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
  },
}

/** 插件会为哪些协议自动注入默认等级。 */
export const INJECTABLE_APIS = ['openai-responses', 'openai-completions'] as const

/**
 * 内置模型族知识库：按模型 id 模式匹配该模型的思考等级。
 *
 * 为什么需要它：自定义网关（如 custom-gateway）上的模型 id（deepseek-v4-flash、
 * gpt-5.6-luna、grok-4.6 …）在任何公开目录里都查不到，但模型的"族"决定
 * 了它所在提供方对思考等级的支持面 —— 这是协议知识，写死在插件里比任何
 * 网站都可靠（详见 README"关于外部数据源"一节）。
 *
 * 各族的依据（2026-08 调研）：
 *   - OpenAI gpt-5.6 系列：官方档位 none / minimal / low / medium / high /
 *     xhigh（custom-gateway 侧校验错误原文："Supported values are: 'none',
 *     'minimal', 'low', 'medium', 'high', and 'xhigh'"）；中转把 ultra 映射
 *     到 xhigh、max 会报 Invalid value —— 所以开放到 xhigh 为止，不开放 max
 *   - OpenAI o 系列 / gpt-5：官方支持 minimal / low / medium / high
 *   - DeepSeek v4：官方 reasoning_effort 支持 low / medium / high
 *   - xAI Grok 4：官方 reasoning_effort 支持 low / medium / high
 *   - Anthropic Claude、智谱 GLM、通义 Qwen、Google Gemini、Meta Llama、
 *     Mistral 经 OpenAI 兼容网关：网关统一映射 low / medium / high（保守面）
 *
 * 用户可在插件配置 `familyPresets` 中按正则覆盖或扩展；先命中先得。
 */
export interface FamilyPreset {
  /** 稳定 id（设置页系列配置的键；同 id 用户覆盖内置）。 */
  id: string
  /** 匹配模型 id 的正则。 */
  pattern: RegExp
  /** 族名（诊断/日志用）。 */
  label: string
  /** 该族模型的思考等级表。 */
  efforts: ReasoningEfforts
  /**
   * 该族模型的输入模态（text / image）。缺省 = 不注入，保持 pi-ai 目录原样；
   * 显式给出时只补写缺失 `input` 的模型，绝不覆盖用户已声明的值。
   */
  input?: readonly ModelModality[]
}

/** 可序列化的系列规则（settings 命名空间 / 设置页 UI 使用的形态）。 */
export interface FamilyRule {
  /** 稳定 id。 */
  id: string
  /** 显示名。 */
  label: string
  /** 匹配模型 id 的正则字符串（RegExp.source）。 */
  pattern: string
  /** 该系列的思考等级表。 */
  efforts: ReasoningEfforts
  /** 该系列的输入模态；缺省 = 不注入。 */
  input?: ModelModality[]
}

/** 内置模型族预设，按声明顺序匹配（先命中先得）。 */
export const FAMILY_PRESETS: readonly FamilyPreset[] = [
  {
    id: 'gpt-5.6',
    // gpt-5.6 起 OpenAI 开放 xhigh 档（none/minimal/low/medium/high/xhigh）
    pattern: /^gpt-5\.6/i,
    label: 'OpenAI GPT-5.6',
    efforts: { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' },
  },
  {
    id: 'gpt-5',
    pattern: /^(gpt-5|o[1-9]|chatgpt-)/i,
    label: 'OpenAI o-series / GPT-5',
    efforts: { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'grok',
    pattern: /^grok/i,
    label: 'xAI Grok',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'deepseek',
    pattern: /^deepseek/i,
    label: 'DeepSeek',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'claude',
    pattern: /^claude/i,
    label: 'Anthropic Claude (OpenAI-compat gateway)',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'glm',
    pattern: /^glm/i,
    label: 'Zhipu GLM',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'qwen',
    pattern: /^qwen/i,
    label: 'Alibaba Qwen',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'gemini',
    pattern: /^gemini/i,
    label: 'Google Gemini',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'llama',
    pattern: /^(llama|meta-)/i,
    label: 'Meta Llama',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'mistral',
    pattern: /^mistral/i,
    label: 'Mistral',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'gpt-4',
    pattern: /^(gpt-4|chatgpt-4)/i,
    label: 'OpenAI GPT-4',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'doubao',
    pattern: /^doubao/i,
    label: 'ByteDance Doubao',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'kimi',
    pattern: /^(kimi|moonshot)/i,
    label: 'Moonshot Kimi',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'ernie',
    pattern: /^(ernie|wenxin)/i,
    label: 'Baidu ERNIE',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'spark',
    pattern: /^spark/i,
    label: 'iFlytek Spark',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'baichuan',
    pattern: /^baichuan/i,
    label: 'Baichuan',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'yi',
    pattern: /^yi(-|$)/i,
    label: '01.AI Yi',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'minimax',
    pattern: /^(minimax|abab)/i,
    label: 'MiniMax',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'hunyuan',
    pattern: /^hunyuan/i,
    label: 'Tencent Hunyuan',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'step',
    pattern: /^step(-|_|$)/i,
    label: 'StepFun Step',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'internlm',
    pattern: /^internlm/i,
    label: 'Shanghai AI Lab InternLM',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'gemma',
    pattern: /^gemma/i,
    label: 'Google Gemma',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'phi',
    pattern: /^phi/i,
    label: 'Microsoft Phi',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'command',
    pattern: /^command/i,
    label: 'Cohere Command',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
  {
    id: 'nemotron',
    pattern: /^nemotron/i,
    label: 'NVIDIA Nemotron',
    efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  },
]

/**
 * 内置系列规则（= FAMILY_PRESETS 的可序列化形态，作为 settings 命名空间默认种子）。
 *
 * `input` 只在预设显式声明时带上：内置知识库不声明模态，因此默认零注入
 * （升级本插件不会给任何既有模型偷偷打开图片能力）。
 */
export const BUILTIN_FAMILY_RULES: readonly FamilyRule[] = FAMILY_PRESETS.map((preset) => ({
  id: preset.id,
  label: preset.label,
  pattern: preset.pattern.source,
  efforts: preset.efforts,
  ...(preset.input === undefined ? {} : { input: [...preset.input] }),
}))

/** 未命中任何族的兜底等级表。 */
export const FALLBACK_EFFORTS: ReasoningEfforts = {
  off: null,
  low: 'low',
  medium: 'medium',
  high: 'high',
}

/**
 * 旧版注入的统一默认表（v0.2.0 早期）——用于识别"插件注入的旧值"以便升级
 * 到模型族预设；用户手改过的值（不等于该形态）绝不覆盖。
 */
export const LEGACY_UNIFORM_EFFORTS: ReasoningEfforts = {
  off: null,
  low: 'low',
  medium: 'medium',
  high: 'high',
}

/**
 * 按模型 id 查找族预设。
 * @param modelId - 模型 id。
 * @param presets - 待匹配的预设表（用户配置在前，内置在后）。
 * @returns 命中的预设，未命中返回 undefined。
 */
export function matchFamilyPreset(modelId: string, presets: readonly FamilyPreset[]): FamilyPreset | undefined {
  return presets.find((preset) => preset.pattern.test(modelId))
}

/**
 * 把任意值收敛成合法的模态表：过滤未知项、去重、保持 text 在前。
 * @param value - 待收敛的值（来自 settings 用户段或内置表）。
 * @returns 合法模态表；不含任何合法项时返回 undefined（= 不注入）。
 */
export function normalizeModalities(value: unknown): ModelModality[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<ModelModality>()
  for (const item of value) {
    if (typeof item === 'string' && (MODALITIES as readonly string[]).includes(item)) seen.add(item as ModelModality)
  }
  if (seen.size === 0) return undefined
  // text 在前，与 pi-ai 目录里的书写顺序一致（便于肉眼比对与快照稳定）。
  return MODALITIES.filter((modality) => seen.has(modality))
}

/**
 * 深比较两张模态表（顺序无关；undefined 与空表视为相等）。
 * @param left - 左表。
 * @param right - 右表。
 * @returns 是否等价。
 */
export function modalitiesEqual(
  left: readonly ModelModality[] | undefined,
  right: readonly ModelModality[] | undefined,
): boolean {
  const a = normalizeModalities(left) ?? []
  const b = normalizeModalities(right) ?? []
  return a.length === b.length && a.every((modality, index) => modality === b[index])
}