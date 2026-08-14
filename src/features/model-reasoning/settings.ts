/**
 * model-reasoning 的 settings 命名空间 —— 系列配置的持久化位置。
 *
 * 用户（和设置页 UI）在这里维护：
 *   - defaultEfforts：兜底等级表（关键词匹配不到任何系列时使用）；
 *   - families：系列规则列表（id / 显示名 / 关键词正则 / 等级表）。
 *
 * schema 默认值 = 内置知识库（BUILTIN_FAMILY_RULES + FALLBACK_EFFORTS），
 * 所以首次打开设置页即可见可编辑；用户保存后 user 层整体替换（数组语义），
 * 之后以用户配置为准。host 注入逻辑与设置页都读 `value`（默认→user 合并）。
 */
import z from '@deepseek-ai/schemastery'
import type { ReasoningEfforts, FamilyRule } from './defaults.js'
import { BUILTIN_FAMILY_RULES, FALLBACK_EFFORTS } from './defaults.js'

/** 当前系列配置命名空间（对外包名 dsh-experience-plugin）。 */
export const MODEL_REASONING_NS = 'dsh-experience-plugin'

/**
 * 旧版命名空间（0.2.0 包名 dsh-hello-plugin）。
 * 只用于 host 端一次性迁移用户已保存的系列配置，迁移完成后不再读写。
 */
export const LEGACY_MODEL_REASONING_NS = 'dsh-hello-plugin'

/** 系列规则 schema。 */
export const FamilyRuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  pattern: z.string(),
  // key 限定在 THINKING_LEVELS 内；value 为 wire 字符串或 null（仅 off）
  efforts: z.dict(z.union([z.string(), z.const(null)]), z.union(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const)),
}) as unknown as z<FamilyRule>

/** 命名空间整体 schema。 */
export const ModelReasoningSettingsSchema = z.object({
  // schema 输出类型把 dict 键视为必填；运行时接受部分键，这里显式断言。
  defaultEfforts: z.dict(z.union([z.string(), z.const(null)]), z.union(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const))
    .default(FALLBACK_EFFORTS as never),
  families: z.array(FamilyRuleSchema).default(BUILTIN_FAMILY_RULES as never),
}) as unknown as z<ModelReasoningSettings>

/** 命名空间解析后的值类型。 */
export interface ModelReasoningSettings {
  defaultEfforts: ReasoningEfforts
  families: FamilyRule[]
}