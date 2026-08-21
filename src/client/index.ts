/**
 * dsh-experience-plugin —— browser 半区入口。
 * 浏览器侧功能装配：每个 client 功能一个模块，在此按需挂载。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, IApiClient } from '@deepseek-ai/dsh-client-connection/client'
// 让官方包的 declare module 合并进 SlotMap：settings.plugin.item 槽位契约。
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { applyModelReasoningClient } from '../features/model-reasoning/client/index.js'
import { CliMimicCard, ModelReasoningCard } from '../features/settings/client/ExperienceSettingsCard.js'

/**
 * 本 client 插件需要的浏览器侧服务。
 * slots：注册 UI slot（插件配置页）；locale：双语文案；connection：wire API；
 * remote：接收 host 推送的失效事件。
 */
export const inject: string[] = ['slots', 'locale', 'connection', 'remote']

/** 插件名（client 运行时诊断用）。 */
export const name = 'dsh-experience-plugin-client'

/** 每个功能模块在 settings.plugin.item 里的 key（对应 host 端 settings 命名空间）。 */
const MODEL_REASONING_NS = 'dsh-experience-plugin'
const CLI_MIMIC_NS = 'cli-mimic'

/**
 * 插件主体：装配全部浏览器侧功能。
 * 在官方插件配置页注册两个可收缩模块卡片，不用下拉框切换。
 * @param ctx - 浏览器侧 client 上下文。
 */
export function apply(ctx: ClientContext): void {
  applyModelReasoningClient(ctx)

  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const t = ctx.locale.bind('model-reasoning')
  const api = connection?.api as Pick<IApiClient, 'settings'> | undefined

  ctx.effect(() => ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: MODEL_REASONING_NS,
      inject: () => ({ api, rpc: connection?.rpc, t }),
    }, ModelReasoningCard)
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: CLI_MIMIC_NS,
      inject: () => ({ api }),
    }, CliMimicCard)
  }), 'dsh-experience-plugin: plugin config cards')
}
