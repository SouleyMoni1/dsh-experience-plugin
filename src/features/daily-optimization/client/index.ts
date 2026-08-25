/**
 * daily-optimization —— browser 半区：设置页「日用优化」分区。
 *
 * 把散落在各处的体验插件设置统一收拢到设置页一个分区：
 *   - 官方插件配置页的两个配置卡片（模型思考等级 / CLI 请求模拟）→ 本分区「插件设置」页签；
 *   - 官方通用设置区的「设置页背景不透明」开关 → 本分区「插件设置」页签；
 *   - 官方插件配置页的「模块开关」卡片 → 本分区「模块开关」页签。
 *
 * 装配：注册本分区文案字典 + 注册 settings.section 条目（id: daily-optimization）。
 * 分区组件从注入面拿到配置卡片所需的 wire API / RPC / 事件订阅 / 文案。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import { DailyOptimizationSection } from './DailyOptimizationSection.js'
import { en, zh } from './locales.js'
import type { ReasoningEditorInjected } from '../../model-reasoning/client/ReasoningEditor.js'

/** 本分区文案命名空间。 */
const NS = 'daily-optimization'

/** 分区在设置页左侧导航中的顺序（官方：通用 0 / 模型 10 / 插件 30 / Agent 预设 20）。 */
const SECTION_ORDER = 40

/**
 * 浏览器侧装配「日用优化」分区。
 * @param ctx - client 根上下文。
 */
export function applyDailyOptimization(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-experience-plugin: daily-optimization dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const api = connection?.api as Pick<IApiClient, 'settings'> | undefined
  const remote = ctx.remote as unknown as ReasoningEditorInjected['remote']
  const mrT = ctx.locale.bind('model-reasoning')

  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'daily-optimization',
    order: SECTION_ORDER,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    inject: () => ({ api, rpc: connection?.rpc, remote, mrT }),
  }, DailyOptimizationSection)), 'dsh-experience-plugin: daily-optimization section')
}
