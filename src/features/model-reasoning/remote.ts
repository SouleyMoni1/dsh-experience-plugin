/**
 * model-reasoning —— host 端 RPC 通道：设置页读写系列配置。
 *
 * 为什么不用 settings 直连：dsh 的 settings 远程控制器只把「命名的模型
 * provider 命名空间 + 官方白名单」暴露给配置客户端（官方注释明言插件自曝
 * 配置是 deferred work），第三方命名空间会被拒绝。所以走本插件自有的通用
 * RPC 入口（`/api/dsh-experience-plugin`，features/rpc-channel.ts）：
 * client 经 `ExperienceRpc.call` 调用，host 端在此读写本条目的配置段。
 *
 * 双线说明：读写都指向**本条目**（`EXPERIENCE_NS`，两线同名），所以 0.1.5
 * 稳定线与 0.1.7-alpha 线的代码完全一致。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcResult as RpcResult } from '@deepseek-ai/dsh-client-connection'
import type { FamilyRule, ReasoningEfforts } from './defaults.js'
import { readNamespace, userOwnsSection, writeNamespace } from '../settings-compat.js'

/** RPC 通道（绝对路径前缀）。 */
export const MR_RPC_CHANNEL = '/dsh-experience-plugin'
/** 读取系列配置。 */
export const MR_RPC_GET = 'model-reasoning/get'
/** 写入系列配置。 */
export const MR_RPC_WRITE = 'model-reasoning/write'

/** GET 返回值。 */
export interface FamilySettingsView {
  defaultEfforts: ReasoningEfforts
  families: FamilyRule[]
  /** 用户层是否已保存过系列配置（接管）。 */
  userOwns: boolean
  revision: number
}

/** WRITE 请求体。 */
export interface FamilySettingsWrite {
  defaultEfforts: ReasoningEfforts
  families: FamilyRule[]
}

/** 构造 RPC 错误。 */
function rpcError(message: string): RpcResult<never> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/**
 * 读取当前系列配置。
 * @param ctx - host 插件上下文。
 * @returns 系列配置视图（含 revision 栅栏）。
 */
async function handleGet(ctx: Context): Promise<RpcResult<FamilySettingsView>> {
  const descriptor = readNamespace(ctx)
  if (descriptor === undefined) return rpcError('dsh-experience-plugin settings are not available')
  const value = descriptor.value as { defaultEfforts?: ReasoningEfforts; families?: FamilyRule[] } | undefined
  return {
    ok: true,
    value: {
      defaultEfforts: (value?.defaultEfforts ?? {}) as ReasoningEfforts,
      families: Array.isArray(value?.families) ? value.families : [],
      userOwns: userOwnsSection(ctx, 'families'),
      revision: descriptor.revision,
    },
  }
}

/**
 * 保存系列配置（顶层补丁深合并 + revision 校验）。
 * @param ctx - host 插件上下文。
 * @param payload - `{ defaultEfforts, families }`。
 * @returns 新 revision。
 */
async function handleWrite(ctx: Context, payload: unknown): Promise<RpcResult<{ revision: number }>> {
  const body = payload as FamilySettingsWrite | undefined
  if (body === undefined || body === null || typeof body !== 'object') {
    return rpcError('model-reasoning write requires an object payload')
  }
  if (!Array.isArray(body.families)) return rpcError('model-reasoning write requires families array')
  const descriptor = readNamespace(ctx)
  if (descriptor === undefined) return rpcError('dsh-experience-plugin settings are not available')
  try {
    await writeNamespace(
      ctx,
      { defaultEfforts: body.defaultEfforts ?? {}, families: body.families },
      descriptor.revision,
    )
    // host settings 的 update 返回 void；新 revision 从 describe 读回。
    const next = readNamespace(ctx)
    return { ok: true, value: { revision: next?.revision ?? descriptor.revision + 1 } }
  } catch (error) {
    return rpcError(error instanceof Error ? error.message : String(error))
  }
}

/**
 * 通道端点分发（独立导出便于测试 harness 直接调用）。
 * @param ctx - host 插件上下文（需要 settings 服务）。
 * @param endpoint - 端点名。
 * @param payload - 请求体。
 * @returns RPC 结果。
 */
export async function dispatchMrRpc(ctx: Context, endpoint: string, payload: unknown): Promise<RpcResult<unknown>> {
  if (endpoint === MR_RPC_GET) return handleGet(ctx)
  if (endpoint === MR_RPC_WRITE) return handleWrite(ctx, payload)
  return rpcError('unknown model-reasoning endpoint: ' + endpoint)
}
