/**
 * rpc-transport —— browser 半区 RPC 调用器。
 *
 * host 半区只在共享 `/api` 通道上挂一条精确 Fetch 路由（见
 * features/rpc-channel.ts），通道名与端点名走 JSON 请求体。这里保持
 * 与官方 `ClientConnectionRpc.call(channel, endpoint, payload)` 相同的调用形状，
 * 于是各功能组件里的 `rpc.call(CHANNEL, ENDPOINT, payload)` 一行都不用改。
 *
 * 鉴权与 Host/Origin 围栏由 Connection 挂在 `/api` 上的共享处理器统一负责，
 * 同源 fetch 自动带上浏览器会话 Cookie。
 */
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client'
import { EXPERIENCE_RPC_PATH } from '../features/rpc-channel.js'

/** 浏览器侧 RPC 调用器。 */
export interface ExperienceRpc {
  /**
   * 调用一条逻辑通道上的端点。
   * @param channel - 逻辑通道名（如 `/dsh-my-rules`）。
   * @param endpoint - 通道内端点（如 `my-rules/read`）。
   * @param payload - 端点请求体。
   * @returns 端点的成功 / 失败结果。
   */
  call(channel: string, endpoint: string, payload: unknown): Promise<ConnectionRpcResult<unknown>>
}

/** 构造浏览器侧 RPC 调用器。 */
export function createExperienceRpc(): ExperienceRpc {
  return {
    async call(channel, endpoint, payload) {
      const response = await fetch(EXPERIENCE_RPC_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, endpoint, payload }),
      })
      if (!response.ok) throw new Error(`transport failure for ${channel}/${endpoint}: HTTP ${response.status}`)
      return await response.json() as ConnectionRpcResult<unknown>
    },
  }
}
