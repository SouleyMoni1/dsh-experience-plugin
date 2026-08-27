/**
 * dsh-experience-plugin —— browser 半区入口。
 * 浏览器侧功能装配：每个 client 功能一个模块，在此按需挂载。
 *
 * 设置统一收拢：所有配置 UI（模型思考等级 / CLI 请求模拟 / 设置页背景不透明 /
 * 模块开关）都搬进设置页「日用优化」分区（features/daily-optimization），
 * 不再散落在官方插件配置页与通用设置区。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// 让官方包的 declare module 合并进 SlotMap：settings.section 槽位契约。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { applyModelReasoningClient } from '../features/model-reasoning/client/index.js'
import { applyOpenFolder } from '../features/open-folder/client/index.js'
import { applyTimelineRail } from '../features/timeline-rail/client/index.js'
import { applyMsgCollapse } from '../features/msg-collapse/client/index.js'
import { applyAutoLoadHistory } from '../features/auto-load-history/client/index.js'
import { applySettingsPage } from '../features/settings-page/client/index.js'
import { applyDailyOptimization } from '../features/daily-optimization/client/index.js'
import { applyMyRulesClient } from '../features/my-rules/client/index.js'
import { isModuleEnabled } from '../features/module-toggles/client/index.js'

/**
 * 本 client 插件需要的浏览器侧服务。
 * slots：注册 UI slot（设置页分区）；locale：双语文案；connection：wire API；
 * remote：接收 host 推送的失效事件；workspaces：侧边栏「打开文件夹」入口。
 */
export const inject: string[] = ['slots', 'locale', 'connection', 'remote', 'workspaces']

/** 插件名（client 运行时诊断用）。 */
export const name = 'dsh-experience-plugin-client'

/**
 * 插件主体：装配全部浏览器侧功能。
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
  // 自动加载更早的对话历史：独立模块，条数可在设置页「日用优化」分区配置。
  if (isModuleEnabled('auto-load-history')) applyAutoLoadHistory(ctx)
  // 官方设置弹窗 → 全屏设置页：几何覆盖，不改官方槽架构。
  if (isModuleEnabled('settings-page')) applySettingsPage(ctx)
  // 全局指令（My Rules）：注册文案，UI 挂载在「日用优化」分区。
  if (isModuleEnabled('my-rules')) applyMyRulesClient(ctx)

  // 设置页「日用优化」分区：集中承载全部配置 UI（插件设置 + 模块开关两个页签）。
  // 分区始终注册（即使某模块被关闭，开关页签仍要能重新打开它）。
  applyDailyOptimization(ctx)
}
