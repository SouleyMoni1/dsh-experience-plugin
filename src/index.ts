/**
 * dsh-experience-plugin —— host 半区入口。
 *
 * 功能分配（每个功能一个独立模块，新增功能在此装配）：
 *   - features/model-reasoning/大模型思考等级（自动注入 + 系列配置 + 自由配置）
 *   - features/cli-mimic/CLI 请求模拟（本地代理 + fetch 拦截 + 配置工具）
 *   - features/open-folder/侧边栏项目行「在文件夹中显示」（host 调系统文件管理器）
 *
 * 插件配置示例（cordis.patch.yml 或 ~/.dsh/settings.yaml）：
 * ```yaml
 * - id: hello
 *   name: dsh-experience-plugin
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
import { applyCliMimic } from './features/cli-mimic/host.js'
import { applyOpenFolderHost, type OpenFolderConfig } from './features/open-folder/host.js'

// 工具导出（测试 / 高级用法）：
export { buildInjectionPatch } from './features/model-reasoning/ops.js'
export { MODEL_REASONING_NS, ModelReasoningSettingsSchema } from './features/model-reasoning/settings.js'
export { MR_RPC_CHANNEL, MR_RPC_GET, MR_RPC_WRITE, dispatchMrRpc } from './features/model-reasoning/remote.js'
export { DEFAULT_EFFORTS_BY_API, THINKING_LEVELS, FAMILY_PRESETS, BUILTIN_FAMILY_RULES, FALLBACK_EFFORTS } from './features/model-reasoning/defaults.js'
export type { ReasoningEfforts } from './features/model-reasoning/defaults.js'
export { CLI_MIMIC_NS, Config as CliMimicConfig } from './features/cli-mimic/host.js'
export { applyOpenFolderHost, type OpenFolderConfig } from './features/open-folder/host.js'

/** 插件配置：每个功能一段。 */
export interface Config {
  /** 兼容旧配置：hello 示例已删除，未知字段不再读取。 */
  hello?: Record<string, unknown>
  /** model-reasoning 功能配置。 */
  modelReasoning?: ModelReasoningConfig
  /** open-folder 功能配置（默认开启）。 */
  openFolder?: OpenFolderConfig
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
    // 协议级 effortsByApi 默认留空：只有用户显式配置才作为"协议级覆盖"。
    // 若默认填 DEFAULT_EFFORTS_BY_API，会短路模型族匹配（用户 grok 6 档
    // 永远被内置 4 档压掉）——这是"新模型思考等级与预设不一致"的根因。
    effortsByApi: {} as never,
    familyPresets: {},
    providers: [],
    upgradeLegacy: true,
  }),
  openFolder: z.object({
    enabled: z.boolean(),
  }).default({ enabled: true }),
}) as unknown as z<Config>

/** 本插件需要的服务（各功能服务的并集）。 */
export const inject = ['settings', 'tools', 'credentials', 'llm', 'webServer', 'workspaceRegistry'] as const

/** 插件名（日志与诊断用）。 */
export const name = 'dsh-experience-plugin'

/**
 * 插件主体：装配全部功能。
 * @param ctx - host 侧插件上下文。
 * @param config - 插件配置（按功能分段）。
 */
export function apply(ctx: Context, config: Config = {}): void {
  applyModelReasoning(ctx, config.modelReasoning)
  applyCliMimic(ctx as Parameters<typeof applyCliMimic>[0])
  applyOpenFolderHost(ctx, config.openFolder ?? { enabled: true })
}