/**
 * dsh-experience-plugin —— browser 半区入口。
 * 浏览器侧功能装配：每个 client 功能一个模块，在此按需挂载。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, IApiClient } from '@deepseek-ai/dsh-client-connection/client'
// 让官方包的 declare module 合并进 SlotMap：settings.plugin.item 槽位契约。
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
// 让官方包的 declare module 合并进 SlotMap：settings.general.item 槽位契约。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { applyModelReasoningClient } from '../features/model-reasoning/client/index.js'
import type { ReasoningEditorInjected } from '../features/model-reasoning/client/ReasoningEditor.js'
import { CliMimicCard, ModelReasoningCard } from '../features/settings/client/ExperienceSettingsCard.js'
import { applyOpenFolder } from '../features/open-folder/client/index.js'
import { applyTimelineRail } from '../features/timeline-rail/client/index.js'
import { applyMsgCollapse } from '../features/msg-collapse/client/index.js'
import { applySettingsPage } from '../features/settings-page/client/index.js'
import { OpaqueBgRow } from '../features/settings-page/client/OpaqueBgRow.js'
import { isModuleEnabled } from '../features/module-toggles/client/index.js'
import { ModuleTogglesCard } from '../features/module-toggles/client/ModuleTogglesCard.js'

/**
 * 本 client 插件需要的浏览器侧服务。
 * slots：注册 UI slot（插件配置页）；locale：双语文案；connection：wire API；
 * remote：接收 host 推送的失效事件；workspaces：侧边栏「打开文件夹」入口。
 */
export const inject: string[] = ['slots', 'locale', 'connection', 'remote', 'workspaces']

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
  // 各功能模块按「模块开关」独立启停（默认全部开启，与旧行为一致）。
  if (isModuleEnabled('model-reasoning')) applyModelReasoningClient(ctx)
  if (isModuleEnabled('open-folder')) applyOpenFolder(ctx, ctx.workspaces)
  // 对话页左侧「消息时间轴标记条」：纯 DOM 浮层，只依赖官方滚动容器与消息行。
  if (isModuleEnabled('timeline-rail')) applyTimelineRail(ctx)
  // 会话消息回合折叠：用户消息 + AI 工作过程可收起，只留 AI 最终回复。
  if (isModuleEnabled('msg-collapse')) applyMsgCollapse(ctx)
  // 官方设置弹窗 → 全屏设置页：几何覆盖，不改官方槽架构。
  if (isModuleEnabled('settings-page')) applySettingsPage(ctx)

  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const t = ctx.locale.bind('model-reasoning')
  const api = connection?.api as Pick<IApiClient, 'settings'> | undefined
  const remote = ctx.remote as unknown as ReasoningEditorInjected['remote']

  ctx.effect(() => ctx.slots.inject('settings.plugin.item', function* () {
    if (isModuleEnabled('model-reasoning')) {
      yield ctx.slots.register({
        name: 'settings.plugin.item',
        key: MODEL_REASONING_NS,
        inject: () => ({ api, rpc: connection?.rpc, remote, t }),
      }, ModelReasoningCard)
    }
    if (isModuleEnabled('cli-mimic')) {
      yield ctx.slots.register({
        name: 'settings.plugin.item',
        key: CLI_MIMIC_NS,
        inject: () => ({ api }),
      }, CliMimicCard)
    }
    // 模块开关卡片：挂到真实 NS key（dsh-experience-plugin）下，keyed 槽才 dispatch。
    // 官方 tab 只渲染 Host 真实 serve 的 settings 命名空间；module-toggles 不是
    // 真实 NS，注册在它下面永远不会被渲染。与 ModelReasoningCard 同 key 时
    // keyed 槽按 order 排序渲染多个 entry。
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: MODEL_REASONING_NS,
      priority: -1,
      inject: () => ({}),
    }, ModuleTogglesCard)
  }), 'dsh-experience-plugin: plugin config cards')

  // 通用设置区一行：设置页背景不透明开关（开启时强制覆盖皮肤/主题的透明效果）。
  if (isModuleEnabled('settings-page')) {
    ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
      name: 'settings.general.item',
      id: 'settings-page-opaque-bg',
      order: 20,
    }, OpaqueBgRow)), 'dsh-experience-plugin: settings page opaque bg row')
  }

}
