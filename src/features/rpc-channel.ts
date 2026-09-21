/**
 * rpc-channel —— host 侧 RPC 入口（DSH 0.1.5 版扩展点）。
 *
 * 为什么不用 `connection.rpc.handle()`：它内部是
 * `owner.effect(() => owner.webServer.register(route))`，而 `owner` 由
 * `HostConnectionService` 的 `get rpc()` 取 `this.ctx`——那是 connection
 * 服务**自己的**上下文（inject 只有 `credentials`），任何外部调用者都会
 * 撞上 `cannot get property "webServer" without inject`（连注入 webServer
 * 也救不了，因为 owner 不是调用者的 fiber）。官方 api-gateway 因此只走
 * `rpc.intercept('/api', …)`，而 `/api` 拦截器全局唯一，第三方插件无法共用。
 *
 * 0.1.5 里第三方插件可用的官方扩展点是 `connection.fetch.register()`：
 * 在共享 `/api` 通道上注册**精确 Fetch 路由**，自动继承 Connection 的
 * Host/Origin 围栏与浏览器会话鉴权（官方 dsh-client-file-upload 就这么挂上传路由）。
 * 精确路由按 pathname 精确匹配，所以本插件只用**一条** POST 路由承载全部逻辑通道，
 * 通道名与端点名走 JSON 请求体：
 *
 * ```jsonc
 * // POST /api/dsh-experience-plugin
 * { "channel": "/dsh-my-rules", "endpoint": "my-rules/read", "payload": {} }
 * ```
 *
 * 返回体即 `ConnectionRpcResult`（`{ok:true,value}` / `{ok:false,error}`）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcResult as RpcResult } from '@deepseek-ai/dsh-client-connection'

/** 共享 API 通道上的本插件 RPC 路由（绝对 pathname）。 */
export const EXPERIENCE_RPC_PATH = '/api/dsh-experience-plugin'

/** 通道端点分发：把一条逻辑通道的 (endpoint, payload) 落到具体实现。 */
export type ExperienceRpcDispatcher = (endpoint: string, payload: unknown) => Promise<RpcResult<unknown>>

/** 请求体信封。 */
interface RpcEnvelope {
  channel: string
  endpoint: string
  payload: unknown
}

/**
 * 各功能在装配时登记的「通道 → 分发」表。
 * 登记的是本插件自己的通道，重复登记即装配 bug，直接覆盖没有意义，
 * 所以这里用 Map 而不是 Set，并让 dispose 精确撤销自己的那一项。
 */
const channels = new Map<string, ExperienceRpcDispatcher>()

/**
 * 登记一条逻辑通道的分发函数。
 * @param channel - 绝对通道名（如 `/dsh-my-rules`）。
 * @param dispatch - 该通道的端点分发。
 * @returns 注销函数（撤销本条登记）。
 */
export function provideRpcChannel(channel: string, dispatch: ExperienceRpcDispatcher): () => void {
  channels.set(channel, dispatch)
  return () => {
    if (channels.get(channel) === dispatch) channels.delete(channel)
  }
}

/** 单次请求处理：解信封 → 找通道 → 分发 → JSON 回应。 */
async function handleRequest(request: Request): Promise<Response> {
  const envelope = await request.json() as RpcEnvelope
  const dispatch = channels.get(envelope.channel)
  if (dispatch === undefined) throw new Error(`dsh-experience-plugin: unknown rpc channel ${envelope.channel}`)
  const result = await dispatch(envelope.endpoint, envelope.payload)
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * 装配 host 侧 RPC 入口（整个插件只调用一次）。
 * @param ctx - host 插件上下文。
 * @returns 卸载函数；connection 服务缺席（纯单测 / e2e）时返回 undefined。
 */
export function applyExperienceRpc(ctx: Context): (() => void) | undefined {
  // 纯单测 / e2e 环境没有 connection 服务：不注册路由，直接跳过。
  if (ctx.get('connection') === undefined) return undefined

  const fiber = ctx.inject(['connection'], (rpcCtx) => {
    rpcCtx.effect(() => rpcCtx.connection.fetch.register({
      path: EXPERIENCE_RPC_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: handleRequest,
    }), `dsh-experience-plugin: rpc route ${EXPERIENCE_RPC_PATH}`)
  })
  return () => { void fiber.dispose() }
}
