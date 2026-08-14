/**
 * model-reasoning 功能的配置（挂在插件 Config 的 modelReasoning 段下）。
 */
import type { ReasoningEfforts } from './defaults.js'

/** model-reasoning 功能配置。 */
export interface ModelReasoningConfig {
  /** 总开关。 */
  enabled?: boolean
  /**
   * 自动注入：为 llm-pi-ai 自定义 provider 里未声明 reasoningEfforts 的模型
   * 写入思考等级（经 ctx.settings.update 持久化到 settings.yaml）。
   * 已声明的模型（含 reasoningEfforts: false）绝不覆盖。
   */
  autoInject?: boolean
  /** 协议级显式等级表；key 为 provider.api 的值。存在时该协议全部模型用它（最高优先级）。 */
  effortsByApi?: Record<string, ReasoningEfforts>
  /**
   * 用户自定义模型族预设：key 为匹配模型 id 的正则字符串，value 为等级表。
   * 排在内置模型族知识库（deepseek / gpt-5 / grok / claude / glm / qwen /
   * gemini / llama / mistral …）之前，先命中先得。
   */
  familyPresets?: Record<string, ReasoningEfforts>
  /** 只处理列出的 provider 路由；空数组/缺省 = 全部。 */
  providers?: string[]
  /** 旧版注入的统一默认值（off/low/medium/high）是否升级为模型族预设；默认 true。 */
  upgradeLegacy?: boolean
}
