/**
 * model-params 的 settings 命名空间 —— 模型请求参数手动覆盖的持久化位置。
 *
 * 用户在设置页「日用优化」的「模型参数」卡片里维护：
 *   - enabled：全局开关（host 是否在 llm/stream 时应用覆盖）；
 *   - rules：按顺序匹配的规则列表（provider 路由 + 模型 id 正则 + 参数覆盖）。
 *
 * 当前 DSH 的 llm-pi-ai 适配器只会把 GenerateOptions 里的 temperature、
 * maxTokens、reasoningEffort 真正带到上游请求；所以规则里也只开放这三个
 * 已生效字段，避免出现「看起来能配、实际不生效」的假参数。
 */
import z from '@deepseek-ai/schemastery'

/** model-params 配置命名空间（kebab-case，符合 settingsNamespace 命名规则）。 */
export const MODEL_PARAMS_NS = 'dsh-experience-model-params'

/** 一条模型参数覆盖规则。 */
export interface ModelParamRule {
  /** 稳定 id（新增规则时用时间戳/随机串生成）。 */
  id: string
  /** 显示名（设置页列表用）。 */
  label: string
  /** 是否启用该规则。 */
  enabled: boolean
  /** provider 路由名；留空 = 匹配所有 provider。 */
  provider: string
  /** 匹配模型 id 的正则字符串；留空 = 匹配该 provider 下所有模型。 */
  modelPattern: string
  /** 温度覆盖：0..2；null = 继承会话/适配器默认。 */
  temperature: number | null
  /** 最大输出 token 覆盖：正整数；null = 继承。 */
  maxTokens: number | null
  /** 思考等级覆盖：off/minimal/low/medium/high/xhigh/max；null = 继承。 */
  reasoningEffort: string | null
}

/** 命名空间解析后的值类型。 */
export interface ModelParamsSettings {
  enabled: boolean
  rules: ModelParamRule[]
}

/** 规则 schema。 */
export const ModelParamRuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  enabled: z.boolean(),
  provider: z.string(),
  modelPattern: z.string(),
  temperature: z.union([z.number().min(0).max(2), z.const(null)]),
  maxTokens: z.union([z.number().step(1).min(1), z.const(null)]),
  reasoningEffort: z.union([z.string(), z.const(null)]),
}) as unknown as z<ModelParamRule>

/** 命名空间整体 schema。 */
export const ModelParamsSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  rules: z.array(ModelParamRuleSchema).default([]),
}) as unknown as z<ModelParamsSettings>

/** 思考等级可选项（与 model-reasoning 的档位对齐）。 */
export const REASONING_EFFORT_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
