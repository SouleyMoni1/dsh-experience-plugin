/**
 * model-params —— host 半区：按规则在每次 LLM 请求里手动覆盖模型参数。
 *
 * 背景：DSH 的 dsh-llm-pi-ai 适配器只会把 GenerateOptions 中的 temperature、
 * maxTokens、reasoningEffort 映射到上游请求；模型本身的 profile 只能声明
 * 能力/默认 maxTokens，没有「每个模型一套采样参数」的官方入口。本模块在
 * llm/stream waterfull 上读用户规则，匹配到 provider + 模型正则后重开一次
 * 带覆盖值的流，实现真正生效的手动参数配置。
 *
 * 实现说明：
 *   - llm/stream 的 next() 不接受新参数（waterfall 用闭包持有原 options），
 *     而循环构建的请求又会被 deepFreeze，不能原地改。因此命中规则时复制一份
 *     options、打上非枚举标记，再调 ctx.llm.stream(clone)；第二次进入本监听
 *     看到标记后直接 next() 放行，避免无限递归。
 *   - 配置存在插件条目 `dsh-experience-plugin` 的 `modelParams` 段（两条线
 *     同为该段名），设置页保存后 host 监听命名空间变更热更新，无需重启。
 *   - 规则按数组顺序匹配，先命中先得；provider 留空匹配所有路由，
 *     modelPattern 留空匹配该路由下所有模型（正则不自动加 ^$，按子串匹配）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ModelParamRule, ModelParamsSettings } from './settings.js'
import { onNamespaceChanged, readSection } from '../settings-compat.js'

/** 标记本模块复制出来的请求对象，防止二次进入监听时再次递归。 */
const PARAM_MARK = Symbol('dsh-experience-model-params')

/** 将规则里的非空字段转换为 GenerateOptions 覆盖 patch。 */
function buildPatch(rule: ModelParamRule): Partial<GenerateOptions> {
  const patch: Partial<GenerateOptions> = {}
  if (rule.temperature !== null && rule.temperature !== undefined) {
    patch.temperature = rule.temperature
  }
  if (rule.maxTokens !== null && rule.maxTokens !== undefined) {
    patch.maxTokens = Math.max(1, Math.floor(rule.maxTokens))
  }
  if (rule.reasoningEffort !== null && rule.reasoningEffort !== undefined && rule.reasoningEffort.trim().length > 0) {
    patch.reasoningEffort = rule.reasoningEffort as GenerateOptions['reasoningEffort']
  }
  return patch
}

/** 编译模型正则；空串/非法正则返回 undefined（匹配时分别按全部/不命中处理）。 */
function compilePattern(pattern: string): RegExp | undefined {
  const source = pattern.trim()
  if (source.length === 0) return undefined
  try {
    return new RegExp(source, 'i')
  } catch {
    return undefined
  }
}

/** 判断一条规则是否命中当前 provider + model。 */
function matchesRule(rule: ModelParamRule, provider: string, model: string): boolean {
  if (!rule.enabled) return false
  const route = rule.provider.trim()
  if (route.length > 0 && route !== provider) return false
  const source = rule.modelPattern.trim()
  if (source.length === 0) return true
  const regex = compilePattern(source)
  if (regex === undefined) return false
  return regex.test(model)
}

/** 按数组顺序找第一条命中规则。 */
function findRule(rules: readonly ModelParamRule[], provider: string, model: string): ModelParamRule | undefined {
  return rules.find((rule) => matchesRule(rule, provider, model))
}

/**
 * 装配 model-params host 半区。
 * @param ctx - host 插件上下文（需要 settings + llm 服务）。
 */
export function applyModelParamsHost(ctx: Context): void {
  // 运行时状态：从插件条目 `modelParams` 段读取，设置页保存后热更新。
  let state: ModelParamsSettings = { enabled: true, rules: [] }
  const readSettings = (): void => {
    const value = readSection<ModelParamsSettings>(ctx, 'modelParams')
    state = {
      enabled: value.enabled !== false,
      rules: Array.isArray(value.rules) ? value.rules : [],
    }
  }
  readSettings()

  ctx.effect(
    () => onNamespaceChanged(ctx, readSettings),
    'model-params: settings watch',
  )

  const logger = ctx.logger('model-params')

  // llm/stream 监听：命中规则且未标记时，复制 options 后重开一次流。
  ctx.on('llm/stream', (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => {
    const llm = ctx.get('llm') as { stream(options: GenerateOptions): AsyncIterable<StreamChunk> } | undefined
    if (llm === undefined) return next()
    if (!state.enabled) return next()
    const rule = findRule(state.rules, options.provider, options.model)
    if (rule === undefined) return next()
    const patch = buildPatch(rule)
    if (Object.keys(patch).length === 0) return next()

    // 第二次进入（我们刚重开的流）：已经带上覆盖值，直接放行。
    if ((options as { [PARAM_MARK]?: boolean })[PARAM_MARK] === true) return next()

    const nextOptions = { ...options, ...patch } as GenerateOptions
    Object.defineProperty(nextOptions, PARAM_MARK, { value: true })
    logger.debug('override %s/%s: %s', options.provider, options.model, JSON.stringify(patch))
    return llm.stream(nextOptions)
  }, { prepend: true })
}
