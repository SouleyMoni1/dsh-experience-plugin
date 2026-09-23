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
 * 幂等：只补缺失项；用户已声明（含 false）的模型绝不覆盖；settings 文档可见
 * 可改，等于"自由配置"。每次文档变化（Models 页 / 手改配置文件）都会重新扫描，
 * 删除 reasoningEfforts 的模型会被重新补上。
 *
 * 双线说明：
 *   - `llm-pi-ai` 是**另一个插件**声明的命名空间。在稳定线（0.1.5-rc.x）它就是
 *     该插件的注册名；在 alpha 线（0.1.7-alpha.x）它是 Loader 条目 id。
 *     两种情况都出现在 `describe()` 里，key 相同，所以读写代码两线共用。
 *   - 本插件自己的系列配置存在**本条目**的 `defaultEfforts` / `families` 段
 *     （命名空间 key = 条目 id，与迁移前的 `dsh-experience-plugin` 命名空间同名，
 *     因此已保存的用户数据无缝衔接）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ModelReasoningConfig } from './config.js'
import type { FamilyPreset } from './defaults.js'
import { buildInjectionPatch } from './ops.js'
import type { FamilyRule, ReasoningEfforts } from './defaults.js'
import type { ModelReasoningSettings } from './settings.js'
import { describeNamespace, readNamespace, readRawSection, readSection, updateNamespace, userOwnsSection } from '../settings-compat.js'
import { provideRpcChannel } from '../rpc-channel.js'
import { dispatchMrRpc, MR_RPC_CHANNEL } from './remote.js'

export type { ModelReasoningConfig } from './config.js'
export { DEFAULT_EFFORTS_BY_API, THINKING_LEVELS, MODALITIES } from './defaults.js'

/** dsh-llm-pi-ai 声明的设置命名空间（= 稳定线的注册名 / alpha 线的条目 id）。 */
const LLM_PI_AI_NS = 'llm-pi-ai'

/** 旧版系列配置命名空间（0.2.0 包名 dsh-hello-plugin），仅用于一次性迁移。 */
const LEGACY_MODEL_REASONING_NS = 'dsh-hello-plugin'

/** 变更后重新扫描的防抖间隔。 */
const RESCAN_DEBOUNCE_MS = 500

/** 适配器命名空间尚未出现时的重试间隔（毫秒），依次尝试。 */
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

  // client 设置页的系列配置读写通道（登记到本插件唯一的 RPC 入口路由）。
  ctx.effect(
    () => provideRpcChannel(MR_RPC_CHANNEL, (endpoint, payload) => dispatchMrRpc(ctx, endpoint, payload)),
    'model-reasoning: rpc channel',
  )

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

  /** 扫描一次；返回适配器命名空间是否已就绪（决定是否安排重试）。 */
  const scan = async (): Promise<boolean> => {
    try {
      await migrateLegacySettings(ctx)
      const ready = await injectMissingEfforts(ctx, config)
      if (!ready) {
        logger.debug('llm-pi-ai namespace not present yet; will retry')
      }
      return ready
    } catch (error) {
      logger.warn('injection failed: %s', (error as Error).message)
      return true // 已尽力，不再按"未就绪"重试
    }
  }

  // 启动：立即扫一次；适配器命名空间未出现则按间隔重试（次数 = 间隔表长度）。
  let retry = 0
  const attempt = (): void => {
    void scan().then((ready) => {
      if (!ready && retry < REGISTRATION_RETRY_MS.length) {
        const delay = REGISTRATION_RETRY_MS[retry++]
        schedule(attempt, delay)
      }
    })
  }
  attempt()

  // 文档变化（Models 页 / 手改配置文件）后再跑，防抖合并。
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
 * @returns 适配器命名空间是否已就绪（false = 本次没有机会注入）。
 */
async function injectMissingEfforts(ctx: Context, config: ModelReasoningConfig): Promise<boolean> {
  if (config.autoInject === false) return true

  // 读取 llm-pi-ai 的用户段（raw user layer）。
  const descriptor = describeNamespace(ctx, LLM_PI_AI_NS)
  if (descriptor === undefined) return false // 适配器条目还没上线
  const user = descriptor.user as { providers?: Record<string, import('./ops.js').PiAiProviderSection> } | undefined
  if (user?.providers === undefined) return true // 还没有用户配置的自定义 provider

  // cordis 不自动应用 Config schema 的默认值：行配置为空时 config 就是 {}，
  // 所以这里对缺省字段回退到功能默认值，而不是静默跳过。
  // 写入走 update（深合并 patch）：数组整体作为 value，其余字段原样保留。
  //
  // 系列配置来源（优先级从高到低）：
  //   1. 插件行配置 familyPresets（改配置需重启）；
  //   2. 本条目的 families 段（设置页 UI 可编辑，热生效；schema 默认值
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
    // 条目系列段：用户一旦保存过 families（user 层接管），完全以用户配置为准
    // （删掉的系列不再生效）；未接管时这里为空，由 ops 内置知识库兜底。
    ...(mrSettings.userOwnsFamilies ? mrSettings.families
      .filter((rule) => rule.pattern.trim().length > 0)
      .map((rule) => ({
        id: rule.id,
        pattern: new RegExp(rule.pattern, 'i'),
        label: rule.label,
        efforts: rule.efforts,
        input: rule.input,
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
  try {
    await updateNamespace(ctx, LLM_PI_AI_NS, patch, descriptor.revision)
  } catch (error) {
    // settings 服务在写入期间被替换（热重载）时按"文档已变"处理，留待下次扫描。
    ctx.logger('model-reasoning').debug('injection write refused: %s', (error as Error).message)
    return true
  }
  ctx.logger('model-reasoning').info('injected reasoningEfforts into %d model(s)', changed)
  return true
}

/**
 * 一次性迁移 0.2.0（包名 dsh-hello-plugin）已保存的系列配置到本条目。
 *
 * 旧版本把系列配置存在独立命名空间 `dsh-hello-plugin`；本条目名
 * `dsh-experience-plugin` 与迁移后的命名空间同名，所以只需把旧命名空间的
 * user 段搬进本条目的 `defaultEfforts` / `families` 段。
 * 本条目已被用户接管（families 已在 user 层）时跳过；旧命名空间无配置时跳过。
 * @param ctx - host 插件上下文。
 */
async function migrateLegacySettings(ctx: Context): Promise<void> {
  if (userOwnsSection(ctx, 'families')) return // 本条目已被用户接管
  const current = readNamespace(ctx)
  if (current === undefined) return

  const legacyUser = readRawSection(ctx, LEGACY_MODEL_REASONING_NS) as
    | { families?: FamilyRule[]; defaultEfforts?: ReasoningEfforts }
    | undefined
  if (!Array.isArray(legacyUser?.families) || legacyUser.families.length === 0) return

  await updateNamespace(
    ctx,
    current.ns,
    {
      defaultEfforts: legacyUser.defaultEfforts ?? { off: null, low: 'low', medium: 'medium', high: 'high' },
      families: legacyUser.families,
    },
    current.revision,
  )
  ctx.logger('model-reasoning').info('migrated legacy series config (%d families) into %s', legacyUser.families.length, current.ns)
}

/** 本条目系列配置的读取结果。 */
interface ModelReasoningSettingsRead extends ModelReasoningSettings {
  /** 用户层是否已保存过 families（接管系列配置）。 */
  userOwnsFamilies: boolean
}

/**
 * 读取本条目 `defaultEfforts` / `families` 段（默认→用户合并后的 value）。
 * @param ctx - host 插件上下文。
 * @returns 系列配置；条目尚未上线时退化为内置默认。
 */
function readModelReasoningSettings(ctx: Context): ModelReasoningSettingsRead {
  const descriptor = readNamespace(ctx)
  const value = descriptor?.value as ModelReasoningSettings | undefined
  if (value !== undefined && Array.isArray(value.families)) {
    return { ...value, userOwnsFamilies: userOwnsSection(ctx, 'families') }
  }
  // 条目尚未出现在 describe（服务缺席 / fiber 未激活）：退化为内置默认，
  // 仅按插件行配置工作。
  return { defaultEfforts: undefined as never, families: [], userOwnsFamilies: false }
}
