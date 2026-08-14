/**
 * dsh-hello-plugin —— host 半区入口。
 *
 * 功能分配（每个功能一个独立模块，新增功能在此装配）：
 *   - features/model-reasoning/自定义 API 模型思考等级（自动注入 + 系列配置 + 自由配置）
 *
 * 插件配置示例（cordis.patch.yml 或 ~/.dsh/settings.yaml）：
 * ```yaml
 * - id: hello
 *   name: dsh-hello-plugin
 *   config:
 *     modelReasoning:
 *       enabled: true
 *       autoInject: true
 *       effortsByApi:
 *         'openai-responses':
 *           off: null
 *           low: low
 *           medium: medium
 *           high: high
 *       providers: []
 * ```
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyModelReasoning } from './features/model-reasoning/host.js'
import type { ModelReasoningConfig } from './features/model-reasoning/config.js'
import { DEFAULT_EFFORTS_BY_API, THINKING_LEVELS } from './features/model-reasoning/defaults.js'

// 工具导出（测试 / 高级用法）：
export { buildInjectionPatch } from './features/model-reasoning/ops.js'
export { MODEL_REASONING_NS, ModelReasoningSettingsSchema } from './features/model-reasoning/settings.js'
export { MR_RPC_CHANNEL, MR_RPC_GET, MR_RPC_WRITE, dispatchMrRpc } from './features/model-reasoning/remote.js'
export { DEFAULT_EFFORTS_BY_API, THINKING_LEVELS, FAMILY_PRESETS, BUILTIN_FAMILY_RULES, FALLBACK_EFFORTS } from './features/model-reasoning/defaults.js'
export type { ReasoningEfforts } from './features/model-reasoning/defaults.js'

/** 插件配置：每个功能一段。 */
export interface Config {
  /** 兼容旧配置：hello 示例已删除，未知字段不再读取。 */
  hello?: Record<string, unknown>
  /** model-reasoning 功能配置。 */
  modelReasoning?: ModelReasoningConfig
}

/**
 * 配置的运行时 schema（loader 校验 + 默认值）。
 * 注意：本 schemastery 版本没有 .optional()；可选段用对象级 .default(完整默认值) 表达，
 * 输出类型为全键必填（可赋值给全可选的接口类型）。
 */
export const Config = z.object({
  // hello 示例已删除；保留兼容段避免旧 patch 里的 hello 配置触发 schema 报错。
  hello: z.object({}).loose().default({}),
  modelReasoning: z.object({
    enabled: z.boolean(),
    autoInject: z.boolean(),
    effortsByApi: z.dict(
      z.dict(z.union([z.string(), z.const(null)]), z.union(THINKING_LEVELS)),
    ),
    familyPresets: z.dict(
      z.dict(z.union([z.string(), z.const(null)]), z.union(THINKING_LEVELS)),
      z.string(),
    ),
    providers: z.array(z.string()),
    upgradeLegacy: z.boolean(),
  }).default({
    enabled: true,
    autoInject: true,
    // schema 输出类型把 dict 键视为必填，运行时接受部分键；这里显式断言。
    effortsByApi: DEFAULT_EFFORTS_BY_API as never,
    familyPresets: {},
    providers: [],
    upgradeLegacy: true,
  }),
}) as unknown as z<Config>

/** 本插件需要的服务（各功能服务的并集）。 */
export const inject = ['settings'] as const

/** 插件名（日志与诊断用）。 */
export const name = 'dsh-hello-plugin'

/**
 * 插件主体：装配全部功能。
 * @param ctx - host 侧插件上下文。
 * @param config - 插件配置（按功能分段）。
 */
export function apply(ctx: Context, config: Config = {}): void {
  applyModelReasoning(ctx, config.modelReasoning)
}