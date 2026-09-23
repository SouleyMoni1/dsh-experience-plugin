/**
 * dsh-experience-plugin —— host 半区入口。
 *
 * 功能分配（每个功能一个模块，新增功能在此装配）：
 *   - features/model-reasoning/大模型思考等级（自动注入 + 系列配置 + 自由配置）
 *   - features/cli-mimic/CLI 请求模拟（本地代理 + fetch 拦截 + 配置工具）
 *   - features/open-folder/侧边栏项目行「在文件夹中显示」
 *   - features/my-rules/全局指令（读写 $DSH_HOME/AGENTS.md 的 RPC 通道）
 *   - features/mcp-manager/MCP 服务器托管注册表
 *   - features/skill-manager/Skill 开关与导入
 *
 * DSH 双线兼容（详见 features/settings-compat.ts）：
 *   - 稳定线（npm tag `latest` = 0.1.5-rc.x）：插件自选命名空间，启动时
 *     `ctx.settings.register(EXPERIENCE_NS, schema)` 注册；本文件通过
 *     `ensureNamespace` 完成，其余代码两线共用。
 *   - alpha 线（npm tag `alpha` = 0.1.7-alpha.x 起）：`register` 已删除，
 *     命名空间 = **Loader 条目 id**，可写字段须标 `.volatile()`。
 *
 * 两条线的命名空间 key 都是 `EXPERIENCE_NS`，wire 形状逐字节一致，所以设置页
 * 与 RPC 通道对本差异无感知。
 *
 * 插件配置示例（cordis.patch.yml 或 profile patch）：
 * ```yaml
 * - id: dsh-experience-plugin
 *   name: dsh-experience-plugin
 *   config:
 *     modelReasoning:
 *       enabled: true
 *       autoInject: true
 *       providers: []
 * ```
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyModelReasoning } from './features/model-reasoning/host.js'
import { THINKING_LEVELS } from './features/model-reasoning/defaults.js'
import { defaultEffortsSchema, familiesSchema } from './features/model-reasoning/settings.js'
import { applyCliMimic, cliMimicConfigSchema } from './features/cli-mimic/host.js'
import { applyOpenFolderHost } from './features/open-folder/host.js'
import { applyMyRules } from './features/my-rules/host.js'
import { applyMcpManager } from './features/mcp-manager/host.js'
import { McpManagerSettingsSchema } from './features/mcp-manager/settings.js'
import { applySkillManager } from './features/skill-manager/host.js'
import { applyModelParamsHost } from './features/model-params/host.js'
import { ModelParamsSettingsSchema } from './features/model-params/settings.js'
import { applyExperienceRpc } from './features/rpc-channel.js'
import { CONFIG_SECTIONS, EXPERIENCE_NS, type ConfigSections } from './features/config-sections.js'
import { ensureNamespace } from './features/settings-compat.js'

// 工具导出（测试 / 高级用法）：
export { buildInjectionPatch, resolveEffortsForModel, resolveModalitiesForModel } from './features/model-reasoning/ops.js'
export { MODEL_REASONING_NS, ModelReasoningSettingsSchema, defaultEffortsSchema, familiesSchema } from './features/model-reasoning/settings.js'
export { MR_RPC_CHANNEL, MR_RPC_GET, MR_RPC_WRITE, dispatchMrRpc } from './features/model-reasoning/remote.js'
export { DEFAULT_EFFORTS_BY_API, THINKING_LEVELS, FAMILY_PRESETS, BUILTIN_FAMILY_RULES, FALLBACK_EFFORTS, MODALITIES, normalizeModalities, modalitiesEqual } from './features/model-reasoning/defaults.js'
export type { ReasoningEfforts, ModelModality } from './features/model-reasoning/defaults.js'
export { CLI_MIMIC_NS, CliMimicConfigSchema, cliMimicConfigSchema, cliMimicSection, type Config as CliMimicConfig } from './features/cli-mimic/host.js'
export { applyOpenFolderHost, type OpenFolderConfig } from './features/open-folder/host.js'
export {
  MY_RULES_RPC_CHANNEL, MY_RULES_RPC_READ, MY_RULES_RPC_WRITE,
  dispatchMyRulesRpc, resolveDshHome, globalInstructionsPath,
} from './features/my-rules/host.js'
export {
  MCP_MANAGER_RPC_CHANNEL, MCP_MANAGER_LIST, MCP_MANAGER_ADD, MCP_MANAGER_IMPORT, MCP_MANAGER_TOGGLE, MCP_MANAGER_PATCH,
  applyMcpManager, dispatchMcpManagerRpc, validateServerInput, parseServerJson, isValidServerName,
  collectInstalledMcpServers, mcpServerOfToolName,
} from './features/mcp-manager/host.js'
export {
  applyPatchRemoval, applyPatchToggle, patchFileDefinesEntry, patchIdOf, resolveProfilePatchFile,
} from './features/mcp-manager/patch-file.js'
export { MCP_MANAGER_NS, McpManagerSettingsSchema } from './features/mcp-manager/settings.js'
export type { ManagedMcpServer, McpManagerSettings } from './features/mcp-manager/settings.js'
export type { InstalledMcpServer, McpManagerView } from './features/mcp-manager/host.js'
export {
  SKILL_MANAGER_RPC_CHANNEL, SKILL_MANAGER_LIST, SKILL_MANAGER_TOGGLE, SKILL_MANAGER_ADD, SKILL_MANAGER_IMPORT,
  applySkillManager, dispatchSkillManagerRpc, isValidSkillName, skillsRoot,
} from './features/skill-manager/host.js'
export { CONFIG_SECTIONS, EXPERIENCE_NS } from './features/config-sections.js'
export type { ConfigSectionKey, ConfigSections, SectionRef } from './features/config-sections.js'
export {
  describeNamespace, ensureNamespace, onNamespaceChanged, readNamespace, readRawSection, readSection,
  settingsLine, updateNamespace, userOwnsSection, writeNamespace, writeSection,
} from './features/settings-compat.js'
export type { NamespaceDescriptor } from './features/settings-compat.js'

/** 插件配置：功能开关走行配置，可写数据段标 volatile（设置页可编辑）。 */
export interface Config extends ConfigSections {}

/**
 * 配置的运行时 schema（loader 校验 + 默认值 + 设置页表单）。
 *
 * volatile 标记：schemastery 的 `validateVolatileSchema` 只允许「固定对象路径上、
 * 且不嵌套在 dict/array/lazy 之下」的节点标 volatile——根对象的直接子节点合法。
 * 所以每个可写数据段整体标 volatile（其子字段是普通节点）。
 *
 * 用工厂而非共享常量：`.volatile()` 是**原地**修改，重复调用会抛
 * `volatile schema is already wrapped`；稳定线注册用的 schema 又必须不带标记，
 * 两线各拿独立实例才不互相污染。
 * @param volatile - true = alpha 线用的带标记版本；false = 稳定线注册用的纯净版。
 * @returns 配置 schema 实例。
 */
export function configSchema(volatile: boolean): z<Config> {
  // 必须在构造 z.object **之前**打好标记：z.object() 会把子节点复制进内部引用表，
  // 构造完成后再对原节点调 .volatile() 不会影响已建好的 schema。
  const v = <T>(schema: T): T => (volatile ? (schema as { volatile(): T }).volatile() : schema)
  const sections = {
    // hello 示例已删除；保留空段以免旧 patch 里的 hello 配置触发 schema 报错。
    hello: z.object({}).loose().default({}),
    // 思考等级注入的功能开关（行配置：改这些走插件重启，不标 volatile）。
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
    // 侧边栏「在文件夹中显示」开关（行配置）。
    openFolder: z.object({
      enabled: z.boolean(),
    }).default({ enabled: true }),

    // ── 以下为设置页可编辑的数据段 ──────────────────────────────────────
    // 系列配置：兜底等级表 + 系列规则列表（原 `dsh-experience-plugin` 命名空间的
    // 顶层字段；命名空间与 entry id 相同，故保持顶层不变以兼容已有数据）。
    defaultEfforts: v(defaultEffortsSchema()),
    families: v(familiesSchema()),
    // CLI 请求模拟（原 `cli-mimic` 独立命名空间，现并入本条目子段）。
    cliMimic: v(cliMimicConfigSchema()),
    // MCP 服务器注册表（原 `dsh-experience-mcp-manager` 命名空间）。
    mcpManager: v(McpManagerSettingsSchema),
    // 模型参数覆盖规则（原 `dsh-experience-model-params` 命名空间）。
    modelParams: v(ModelParamsSettingsSchema),
  }
  return z.object(sections) as unknown as z<Config>
}

/** 条目 schema：alpha 线由 loader 读取（命名空间 = 条目 id）。 */
export const Config = configSchema(true)

/** 稳定线注册用的纯净 schema（无 volatile 标记）。 */
export const PlainConfig = configSchema(false)

/** 本插件需要的服务（各功能服务的并集；settings 缺席时降级运行）。 */
export const inject = ['settings', 'tools', 'credentials', 'llm', 'webServer', 'workspaceRegistry', 'connection'] as const

/** 插件名（日志与诊断用）。同时也是 alpha 线的设置命名空间。 */
export const name = EXPERIENCE_NS

/**
 * 插件主体：装配全部功能。
 * @param ctx - host 侧插件上下文。
 * @param config - 插件配置（功能开关 + 可写数据段的 volatile 引用）。
 */
export function apply(ctx: Context, config: Config = {} as Config): void {
  // 稳定线：注册命名空间（alpha 线由 loader 按条目 id 提供，此处 no-op）。
  // 注册用不带 volatile 标记的那份 schema——那条线的 schemastery 会把标记节点
  // 解析成 `{ get() }` 包装，直接注册 Config 会让设置值与官方 UI 读到空对象。
  ensureNamespace(ctx, PlainConfig as unknown as z<unknown>)

  // 唯一的浏览器 ↔ host RPC 入口（各功能把自己的逻辑通道登记进来）。
  applyExperienceRpc(ctx)

  // alpha 线：本插件自带「日用优化」设置页，不需要内核再按 schema 自动生成一份。
  // 稳定线没有这个方法（设置页由官方插件配置页承载），探测后再调用。
  const settings = ctx.get('settings') as { configure?: (policy: { auto: boolean }, owner: unknown) => () => void } | undefined
  if (settings !== undefined && typeof settings.configure === 'function') {
    ctx.effect(
      () => settings.configure!({ auto: false }, ctx.fiber),
      'dsh-experience-plugin: settings presentation',
    )
  }

  applyModelReasoning(ctx, config.modelReasoning)
  applyModelParamsHost(ctx)
  applyCliMimic(ctx)
  applyOpenFolderHost(ctx, config.openFolder ?? { enabled: true })
  applyMyRules(ctx)
  applyMcpManager(ctx)
  applySkillManager(ctx)
}
