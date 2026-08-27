/**
 * my-rules —— browser 半区：注册文案，UI 由统一插件配置卡片挂载。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, zh } from './locales.js'
import { MyRulesEditor } from './MyRulesEditor.js'

/** 文案命名空间。 */
const NS = 'my-rules'

export { MyRulesEditor }

/**
 * 注册 my-rules 的浏览器侧文案。
 * @param ctx - client 根上下文（需要 locale）。
 */
export function applyMyRulesClient(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'my-rules: locale dictionaries')
}
