/**
 * config-sections —— 插件 Config 各功能段的类型契约与常量。
 *
 * DSH 0.1.7-alpha 起，可写设置必须是 Config 上标了 `.volatile()` 的节点，且设置
 * 命名空间 = Loader 条目 id；稳定线（0.1.5-rc.x）则是插件自选命名空间并把 schema
 * 注册进去。两条线的**命名空间 key 都取 {@link EXPERIENCE_NS}**，所以数据结构
 * 完全一致，差异全部收在 settings-compat.ts。
 */
import type { ModelReasoningConfig } from './model-reasoning/config.js'

/** 本插件唯一 Loader 条目 id：既是插件名，也是两线的设置命名空间 key。 */
export const EXPERIENCE_NS = 'dsh-experience-plugin'

/** 可写配置段的键（Config 上标了 `.volatile()` 的顶层节点）。 */
export const CONFIG_SECTIONS = [
  'defaultEfforts',
  'families',
  'cliMimic',
  'mcpManager',
  'modelParams',
] as const
export type ConfigSectionKey = (typeof CONFIG_SECTIONS)[number]

/** 插件的全部配置段。 */
export interface ConfigSections {
  /** 兼容旧 patch 的空段（hello 示例已删除，保留以免未知字段触发 schema 报错）。 */
  hello?: Record<string, unknown>
  /** 思考等级注入的功能开关（行配置，改动走插件重启）。 */
  modelReasoning?: ModelReasoningConfig
  /** 侧边栏「在文件夹中显示」开关（行配置）。 */
  openFolder?: { enabled: boolean }
  /** 系列配置：兜底等级表（volatile，设置页可编辑）。 */
  defaultEfforts?: unknown
  /** 系列配置：系列规则列表（volatile，设置页可编辑）。 */
  families?: unknown
  /** CLI 请求模拟段（volatile）。 */
  cliMimic?: unknown
  /** MCP 服务器注册表段（volatile）。 */
  mcpManager?: unknown
  /** 模型参数覆盖规则段（volatile）。 */
  modelParams?: unknown
}

/** 一个配置段的读取句柄。 */
export interface SectionRef<T> {
  /**
   * 读取本段最新值。
   * @returns 当前值；段缺省时为空对象。
   */
  get(): T
}
