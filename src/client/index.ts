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
import { applyAutoLoadHistory } from '../features/auto-load-history/client/index.js'
import { applySettingsPage } from '../features/settings-page/client/index.js'
import { applyDailyOptimization } from '../features/daily-optimization/client/index.js'
import { applyMyRulesClient } from '../features/my-rules/client/index.js'
import { isModuleEnabled } from '../features/module-toggles/client/index.js'
import { ensureDesignStyles } from './design/index.js'

/**
 * 本 client 插件需要的浏览器侧服务。
 *
 * slots：注册 UI slot（设置页分区）；locale：双语文案；connection：插件自有
 * RPC 通道；remote：转发事件订阅；remote.settings：settings 读写命名空间
 * （每个远程命名空间都是独立注册的 cordis 服务 `remote.<ns>`，官方
 * dsh-client-ui-settings 的 inject 也是 `['remote','remote.settings']`）；
 * workspaces：侧边栏「打开文件夹」入口。
 *
 * 注意**不要**注入 `settingsScope`：它是 0.1.5 稳定线的服务，0.1.7-alpha 起已被
 * 内核移除，注入它会让整个 client 插件停在
 * `pending (waiting for service: settingsScope)`，导致
 * `web boot: 1 entry did not activate`。settings 访问统一走 `remote.settings`
 * （两条线同名同形，见 client/settings-access.ts）。
 */
export const inject: string[] = ['slots', 'locale', 'connection', 'remote', 'remote.settings', 'workspaces']

/** 插件名（client 运行时诊断用）。 */
export const name = 'dsh-experience-plugin-client'

/**
 * 插件主体：装配全部浏览器侧功能。
 * @param ctx - 浏览器侧 client 上下文。
 */
export function apply(ctx: ClientContext): void {
  // 设计系统样式表（.dx-*）先注入：所有配置 UI 的静态外观都来自它（悬停/按压/焦点/动效）。
  // 幂等：重复装配只会注入一次；组件侧 import 设计系统时也会兜底注入。
  ensureDesignStyles()

  // 文案字典必须**无条件注册**，与模块开关解耦：
  // 「日用优化」分区里的配置卡片无论模块开没开都会渲染（关掉只是置灰），
  // 而 locale 查不到词条时会原样返回 key（dsh-client-locale translate 的 `?? key`），
  // 一旦字典没注册，卡片标题就会显示成字面的 "nav"。
  applyModelReasoningClient(ctx)
  applyMyRulesClient(ctx)

  // 各功能模块按「模块开关」独立启停（默认全部开启，与旧行为一致）。
  if (isModuleEnabled('open-folder')) applyOpenFolder(ctx, ctx.workspaces)
  // 自动加载更早的对话历史：独立模块，条数可在设置页「日用优化」分区配置。
  if (isModuleEnabled('auto-load-history')) applyAutoLoadHistory(ctx)
  // 官方设置弹窗 → 全屏设置页：几何覆盖，不改官方槽架构。
  if (isModuleEnabled('settings-page')) applySettingsPage(ctx)

  // 设置页「日用优化」分区：集中承载全部配置 UI（插件设置 + 模块开关两个页签）。
  // 分区始终注册（即使某模块被关闭，开关页签仍要能重新打开它）。
  applyDailyOptimization(ctx)
}
