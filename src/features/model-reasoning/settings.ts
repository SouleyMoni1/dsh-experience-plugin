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
import { BUILTIN_FAMILY_RULES, FALLBACK_EFFORTS, MODALITIES } from './defaults.js'

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
  // 输入模态（text / image）。默认空表 = 不注入模态，保持 pi-ai 目录原样。
  input: z.array(z.union(MODALITIES)).default([]),
}) as unknown as z<FamilyRule>

/**
 * 兜底等级表字段（工厂，每次返回新实例）。
 *
 * 之所以用工厂而不是共享常量：schemastery 的 `.volatile()` 是**原地**修改
 * （重复调用直接抛 `volatile schema is already wrapped`），插件 Config 需要给
 * 同一字段标 volatile，而稳定线注册用的 schema 又必须不带标记，共享实例会让
 * 两边互相污染。
 * @returns 带 `FALLBACK_EFFORTS` 默认值的 dict schema。
 */
export function defaultEffortsSchema(): z<ReasoningEfforts> {
  return z.dict(
    z.union([z.string(), z.const(null)]),
    z.union(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const),
  ).default(FALLBACK_EFFORTS as never) as unknown as z<ReasoningEfforts>
}

/**
 * 系列规则列表字段（工厂，每次返回新实例；理由同 {@link defaultEffortsSchema}）。
 * @returns 带 `BUILTIN_FAMILY_RULES` 默认值的数组 schema。
 */
export function familiesSchema(): z<FamilyRule[]> {
  return z.array(FamilyRuleSchema).default(BUILTIN_FAMILY_RULES as never) as unknown as z<FamilyRule[]>
}

/** 命名空间整体 schema。 */
export const ModelReasoningSettingsSchema = z.object({
  defaultEfforts: defaultEffortsSchema(),
  families: familiesSchema(),
}) as unknown as z<ModelReasoningSettings>

/** 命名空间解析后的值类型。 */
export interface ModelReasoningSettings {
  defaultEfforts: ReasoningEfforts
  families: FamilyRule[]
}