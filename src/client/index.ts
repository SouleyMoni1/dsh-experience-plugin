/**
 * dsh-hello-plugin —— browser 半区入口。
 * 浏览器侧功能装配：每个 client 功能一个模块，在此按需挂载。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { applyModelReasoningClient } from '../features/model-reasoning/client/index.js'

/**
 * 本 client 插件需要的浏览器侧服务。
 * slots：注册 UI slot（设置页）；locale：双语文案；connection：wire API；
 * remote：接收 host 推送的失效事件。
 */
export const inject: string[] = ['slots', 'locale', 'connection', 'remote']

/** 插件名（client 运行时诊断用）。 */
export const name = 'dsh-hello-plugin-client'

/**
 * 插件主体：装配全部浏览器侧功能。
 * @param ctx - 浏览器侧 client 上下文。
 */
export function apply(ctx: ClientContext): void {
  applyModelReasoningClient(ctx)
  // 未来的 client 侧功能在这里继续挂载：
  // applyXxxClient(ctx)
}