/**
 * model-reasoning —— host 半区。
 *
 * 背景：官方模型选择器（ModelSelect）只有在模型目录条目带有
 * reasoning.efforts 元数据时才会渲染"思考等级"面板；该元数据来自 LLM
 * 适配器（dsh-llm-pi-ai）的模型目录，而 pi-ai 只有模型声明了
 * `reasoningEfforts` 才会暴露它。手声明的自定义 API 模型（claude /
 * codex / grok / glm 走 OpenAI 兼容网关）默认没有该声明，所以选择模型时
 * 看不到思考等级。
 *
 * 本功能做的：扫描 `llm-pi-ai` 用户设置段，为每个 openai 系协议的
 * provider 下未声明 reasoningEfforts 的模型，自动写入协议默认等级
 * （经 ctx.settings.update 深合并 patch，走 revision 校验 + 热更新）。注入后：
 *   1. pi-ai 目录暴露 reasoning.efforts → 官方 ModelSelect 自动出现等级面板
 *      （UI 零改动，与官方完全一致）；
 *   2. 选择回传 reasoningEffort → 适配器按 thinkingLevelMap 发送 wire 拼写。
 *
 * 幂等：只补缺失项；用户已声明（含 false）的模型绝不覆盖；settings.yaml
 * 可见可改，等于"自由配置"。每次文档变化（Models 页 / 手改 settings.yaml）
 * 都会重新扫描，删除 reasoningEfforts 的模型会被重新补上。
 */
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { ModelReasoningConfig } from './config.js'
import type { FamilyPreset } from './defaults.js'
import { buildInjectionPatch } from './ops.js'
import type { FamilyRule, ReasoningEfforts } from './defaults.js'
import type { ModelReasoningSettings } from './settings.js'
import { LEGACY_MODEL_REASONING_NS, MODEL_REASONING_NS, ModelReasoningSettingsSchema } from './settings.js'
import { applyModelReasoningRemote } from './remote.js'

export type { ModelReasoningConfig } from './config.js'
export { DEFAULT_EFFORTS_BY_API, THINKING_LEVELS } from './defaults.js'
export { MODEL_REASONING_NS, ModelReasoningSettingsSchema } from './settings.js'

/** dsh-llm-pi-ai 注册的用户设置命名空间。 */
const LLM_PI_AI_NS = settingsNamespace('llm-pi-ai')

/** 变更后重新扫描的防抖间隔。 */
const RESCAN_DEBOUNCE_MS = 500

/** 适配器命名空间尚未注册时的重试间隔（毫秒），依次尝试。 */
const REGISTRATION_RETRY_MS = [1000, 5000, 30000]

/**
 * 启动 model-reasoning 功能。
 * @param ctx - host 插件上下文（需要 settings 服务）。
 * @param config - 功能配置。
 */
export function applyModelReasoning(ctx: Context, config: ModelReasoningConfig = {}): void {
  if (config.enabled === false) {
    ctx.logger('model-reasoning').info('disabled by config')
    return
  }

  // 注册当前 + 旧版系列配置命名空间（schema 默认值 = 内置知识库）。
  // 旧命名空间只承载 0.2.0 改名前的用户配置迁移；注册是 fiber effect，
  // 热重载时旧 fiber 自动注销，同 fiber 重复注册会抛错，忽略即可。
  for (const ns of [MODEL_REASONING_NS, LEGACY_MODEL_REASONING_NS]) {
    try {
      ctx.settings.register(settingsNamespace(ns), ModelReasoningSettingsSchema, {})
    } catch (error) {
      ctx.logger('model-reasoning').debug('namespace %s already registered: %s', ns, (error as Error).message)
    }
  }

  // client 设置页的系列配置读写通道（connection 服务缺席时跳过，如测试环境）。
  const disposeRemote = applyModelReasoningRemote(ctx)
  if (disposeRemote !== undefined) {
    ctx.effect(() => () => { void disposeRemote() }, 'model-reasoning: rpc channel')
  }

  const logger = ctx.logger('model-reasoning')
  const timers = new Set<NodeJS.Timeout>()
  const schedule = (fn: () => void, ms: number): void => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, ms)
    timers.add(timer)
  }
  // 插件 fiber 卸载时清掉所有挂起的重试/防抖计时器。
  ctx.effect(() => () => {
    for (const timer of timers) clearTimeout(timer)
  }, 'model-reasoning: timers')

  /** 扫描一次；返回命名空间是否已注册（决定是否安排重试）。 */
  const scan = async (): Promise<boolean> => {
    try {
      await migrateLegacySettings(ctx)
      const registered = await injectMissingEfforts(ctx, config)
      if (!registered) {
        logger.debug('llm-pi-ai namespace not registered yet; will retry')
      }
      return registered
    } catch (error) {
      logger.warn('injection failed: %s', (error as Error).message)
      return true // 已尽力，不再按"未注册"重试
    }
  }

  // 启动：立即扫一次；命名空间未注册则按间隔重试（最多重试次数 = 间隔表长度）。
  let retry = 0
  const attempt = (): void => {
    void scan().then((registered) => {
      if (!registered && retry < REGISTRATION_RETRY_MS.length) {
        const delay = REGISTRATION_RETRY_MS[retry++]
        schedule(attempt, delay)
      }
    })
  }
  attempt()

  // 用户文档变化（Models 页 / 手改 settings.yaml）后再跑，防抖合并。
  let debounceTimer: NodeJS.Timeout | undefined
  ctx.on('settings/document-updated', () => {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      void scan()
    }, RESCAN_DEBOUNCE_MS)
  })
}

/**
 * 为缺失 reasoningEfforts 的自定义模型写入默认等级。
 * @param ctx - host 插件上下文。
 * @param config - 功能配置。
 * @returns 命名空间是否已注册（未注册 = 本次没有机会注入）。
 */
async function injectMissingEfforts(ctx: Context, config: ModelReasoningConfig): Promise<boolean> {
  if (config.autoInject === false) return true

  // 读取 llm-pi-ai 的用户段（raw user layer）。
  const descriptor = ctx.settings.describe().find((entry) => entry.ns === LLM_PI_AI_NS)
  if (descriptor === undefined) return false // 适配器还没注册该命名空间
  const user = descriptor.user as { providers?: Record<string, import('./ops.js').PiAiProviderSection> } | undefined
  if (user?.providers === undefined) return true // 还没有用户配置的自定义 provider

  // cordis 不自动应用 Config schema 的默认值：行配置为空时 config 就是 {}，
  // 所以这里对缺省字段回退到功能默认值，而不是静默跳过。
  // 写入走 update（深合并 patch）：数组整体作为 value，其余字段原样保留。
  //
  // 系列配置来源（优先级从高到低）：
  //   1. 插件行配置 familyPresets（改配置需重启）；
  //   2. 本插件 settings 命名空间（设置页 UI 可编辑，热生效；schema 默认值
  //      = 内置知识库，未保存前即为完整内置列表）；
  //   3. 内置 FAMILY_PRESETS（ops.ts 内兜底）。
  const mrSettings = readModelReasoningSettings(ctx)
  const familyPresets: FamilyPreset[] = [
    // 插件行配置（改配置需重启）——始终优先。
    ...Object.entries(config.familyPresets ?? {}).map(([source, efforts]) => ({
      id: 'config:' + source,
      pattern: new RegExp(source, 'i'),
      label: 'user:' + source,
      efforts,
    })),
    // settings 命名空间系列：用户一旦保存过 families（user 层接管），完全以
    // 用户配置为准（删掉的系列不再生效）；未接管时这里为空，由 ops 内置
    // 知识库兜底。
    ...(mrSettings.userOwnsFamilies ? mrSettings.families
      .filter((rule) => rule.pattern.trim().length > 0)
      .map((rule) => ({
        id: rule.id,
        pattern: new RegExp(rule.pattern, 'i'),
        label: rule.label,
        efforts: rule.efforts,
      })) : []),
  ]
  const { patch, changed } = buildInjectionPatch(user.providers, {
    // 仅当用户显式配置了 effortsByApi 才作为协议级覆盖；缺省走模型族匹配
    effortsByApi: config.effortsByApi,
    familyPresets,
    defaultEfforts: mrSettings.defaultEfforts,
    includeBuiltinFamilies: !mrSettings.userOwnsFamilies,
    providers: config.providers ?? [],
    upgradeLegacy: config.upgradeLegacy,
  })
  if (changed === 0) return true

  // revision 校验：若文档在我们读取后被改动，本次写入被拒，下次 document-updated 会重试。
  await ctx.settings.update(LLM_PI_AI_NS, patch, descriptor.revision)
  ctx.logger('model-reasoning').info('injected reasoningEfforts into %d model(s)', changed)
  return true
}

/**
 * 一次性迁移 0.2.0（包名 dsh-hello-plugin）已保存的系列配置到新命名空间。
 * 当前命名空间已有用户配置时跳过；旧命名空间没有用户配置时跳过。
 */
async function migrateLegacySettings(ctx: Context): Promise<void> {
  const current = ctx.settings.describe().find((entry) => entry.ns === MODEL_REASONING_NS)
  if (current === undefined) return
  const currentUser = current.user as { families?: unknown } | undefined
  if (Array.isArray(currentUser?.families)) return // 新命名空间已被用户接管

  const legacy = ctx.settings.describe().find((entry) => entry.ns === LEGACY_MODEL_REASONING_NS)
  const legacyUser = legacy?.user as { families?: FamilyRule[]; defaultEfforts?: ReasoningEfforts } | undefined
  if (!Array.isArray(legacyUser?.families) || legacyUser.families.length === 0) return

  await ctx.settings.update(
    settingsNamespace(MODEL_REASONING_NS),
    {
      defaultEfforts: legacyUser.defaultEfforts ?? { off: null, low: 'low', medium: 'medium', high: 'high' },
      families: legacyUser.families,
    },
    current.revision,
  )
  ctx.logger('model-reasoning').info('migrated legacy series config (%d families) to %s', legacyUser.families.length, MODEL_REASONING_NS)
}

/** 本插件命名空间的读取结果。 */
interface ModelReasoningSettingsRead extends ModelReasoningSettings {
  /** 用户层是否已保存过 families（接管系列配置）。 */
  userOwnsFamilies: boolean
}

/** 读取本插件命名空间的系列配置（默认→用户合并后的 value）。 */
function readModelReasoningSettings(ctx: Context): ModelReasoningSettingsRead {
  const descriptor = ctx.settings.describe().find((entry) => entry.ns === MODEL_REASONING_NS)
  const value = descriptor?.value as ModelReasoningSettings | undefined
  const user = descriptor?.user as { families?: unknown } | undefined
  if (value !== undefined && Array.isArray(value.families)) {
    return {
      ...value,
      userOwnsFamilies: Array.isArray(user?.families),
    }
  }
  // 命名空间未注册（settings 服务缺席等）：退化为内置默认，仅按插件行配置工作。
  return { defaultEfforts: undefined as never, families: [], userOwnsFamilies: false }
}