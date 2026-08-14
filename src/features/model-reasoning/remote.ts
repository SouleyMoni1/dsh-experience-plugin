/**
 * model-reasoning —— host 端 RPC 通道：设置页读写系列配置。
 *
 * 为什么不用 settings 命名空间直连：dsh-host-apiproxy 只把"模型 provider
 * 命名空间 + 官方白名单"暴露给配置客户端（WEB_SETTINGS_NAMESPACES 硬编码，
 * 官方注释明言插件自曝配置是 deferred work），第三方命名空间会被
 * `settings-not-exposed` 拒绝。所以走官方通用 RPC 通道（connection.rpc）：
 * client 经 `connection.rpc.call` 调用，host 端在此读写本插件的命名空间。
 */
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { FamilyRule, ReasoningEfforts } from './defaults.js'
import type { ModelReasoningSettings } from './settings.js'
import { MODEL_REASONING_NS } from './settings.js'

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

/** 读取当前系列配置。 */
async function handleGet(ctx: Context): Promise<RpcResult<FamilySettingsView>> {
  const descriptor = ctx.settings.describe().find((entry) => entry.ns === MODEL_REASONING_NS)
  if (descriptor === undefined) return rpcError('model-reasoning settings namespace is not registered')
  const value = descriptor.value as ModelReasoningSettings
  const user = descriptor.user as { families?: unknown } | undefined
  return {
    ok: true,
    value: {
      defaultEfforts: value.defaultEfforts,
      families: value.families,
      userOwns: Array.isArray(user?.families),
      revision: descriptor.revision,
    },
  }
}

/** 保存系列配置（settings.update 深合并 + revision 校验）。 */
async function handleWrite(ctx: Context, payload: unknown): Promise<RpcResult<{ revision: number }>> {
  const body = payload as FamilySettingsWrite | undefined
  if (body === undefined || body === null || typeof body !== 'object') {
    return rpcError('model-reasoning write requires an object payload')
  }
  if (!Array.isArray(body.families)) return rpcError('model-reasoning write requires families array')
  const descriptor = ctx.settings.describe().find((entry) => entry.ns === MODEL_REASONING_NS)
  if (descriptor === undefined) return rpcError('model-reasoning settings namespace is not registered')
  try {
    await ctx.settings.update(
      settingsNamespace(MODEL_REASONING_NS),
      { defaultEfforts: body.defaultEfforts ?? {}, families: body.families },
      descriptor.revision,
    )
    // host settings 服务的 update 返回 void；新 revision 从 describe 读。
    const next = ctx.settings.describe().find((entry) => entry.ns === MODEL_REASONING_NS)
    return { ok: true, value: { revision: next?.revision ?? descriptor.revision + 1 } }
  } catch (error) {
    return rpcError(error instanceof Error ? error.message : String(error))
  }
}

/**
 * 通道端点分发（独立导出便于测试 harness 直接调用）。
 * @param ctx - host 插件上下文（需要 settings 服务）。
 */
export async function dispatchMrRpc(ctx: Context, endpoint: string, payload: unknown): Promise<RpcResult<unknown>> {
  if (endpoint === MR_RPC_GET) return handleGet(ctx)
  if (endpoint === MR_RPC_WRITE) return handleWrite(ctx, payload)
  return rpcError('unknown model-reasoning endpoint: ' + endpoint)
}

/**
 * 注册系列配置 RPC 通道。
 * @param ctx - host 插件上下文（需要 settings + connection 服务）。
 * @returns 卸载函数；connection 服务缺席（如测试环境）返回 undefined。
 */
export function applyModelReasoningRemote(ctx: Context): (() => Promise<void>) | undefined {
  const connection = ctx.get('connection') as HostConnectionHandle | undefined
  if (connection === undefined) return undefined
  const dispose = connection.rpc.handle(MR_RPC_CHANNEL, (endpoint: string, payload: unknown) => {
    return dispatchMrRpc(ctx, endpoint, payload)
  }, { authority: 'loopback' })
  return dispose
}