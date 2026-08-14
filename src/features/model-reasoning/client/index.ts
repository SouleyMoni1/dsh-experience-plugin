/**
 * model-reasoning —— browser 半区：注册"模型思考等级"设置页。
 *
 * 官方设置页是 slot 驱动的（settings.section），第三方插件注册自己的页面
 * 即可与官方 Models 页并列；UI 复用官方设计 token，观感一致。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, IApiClient } from '@deepseek-ai/dsh-client-connection/client'
// 这两个 type-only import 让官方包的 declare module 合并进 SlotMap / Context：
// 'settings.section' 槽位契约（dsh-client-ui-settings）与 ctx.locale（dsh-client-locale）。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, zh } from './locales.js'
import { ReasoningEditor } from './ReasoningEditor.js'

/** 本功能在设置面板里的页面 id（settings.section 的 entry id）。 */
export const SETTINGS_SECTION_ID = 'model-reasoning'

/** 文案命名空间。 */
const NS = 'model-reasoning'

/**
 * 挂载 model-reasoning 的浏览器侧 UI。
 * @param ctx - client 根上下文（需要 slots / locale / connection / remote）。
 */
export function applyModelReasoningClient(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'model-reasoning: locale dictionaries')

  // 同一编译单元里 host 端（dsh-client-connection 根）也声明了 ctx.connection，
  // 这里显式断言为 client 端 ConnectionHandle。
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const t = ctx.locale.bind(NS)

  const injected = () => ({
    api: connection?.api as Pick<IApiClient, 'settings'> | undefined,
    rpc: connection?.rpc,
    t,
  })

  // 等官方 settings.section 声明落账后注册本页（与官方 Models 页并列）。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SETTINGS_SECTION_ID,
    order: 30,
    label: () => t('nav'),
    inject: injected,
  }, ReasoningEditor))
}