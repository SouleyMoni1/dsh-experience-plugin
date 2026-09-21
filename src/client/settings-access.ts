/**
 * settings-access —— DSH 0.1.5 起浏览器侧 settings 访问兼容层。
 *
 * 旧版（≤0.1.4）浏览器侧读写设置走 `ctx.connection.api.settings`（`IApiClient`）。
 * 0.1.5 起 `ConnectionHandle` 上不再有 `api`，`IApiClient` 也已从
 * `@deepseek-ai/dsh-client-connection/client` 移除；设置改为 `ctx.settingsScope` 服务：
 *   - 读：`ctx.settingsScope.describe()` 返回浏览器侧共享的 describe 镜像；
 *   - 写：`ctx.settingsScope.bind({ namespace }).mutate(ops, expectedRevision)`。
 *
 * 本模块把新服务包成本插件内部各配置卡片一直在用的旧信封
 * （`{ result: { ok, value | error } }`），这样卡片里的读写逻辑一行都不用改。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-settings/types'
import type { SettingsScope, SettingsScopeBinder } from '@deepseek-ai/dsh-client-ui-settings/client'

/** 失败的形状（与旧 IApiClient 的 RpcResult 失败臂一致）。 */
export interface SettingsRpcFailure {
  code: string
  message: string
  details: object
}

/** 旧信封的操作结果。 */
export type SettingsRpcResult<T> = { ok: true; value: T } | { ok: false; error: SettingsRpcFailure }

/** 旧信封：wire 调用统一返回 `{ result }`。 */
export interface SettingsEnvelope<T> {
  result: SettingsRpcResult<T>
}

/** `describe` 的值（旧 IApiClient 的 settings.describe 返回值）。 */
export interface SettingsDescribeValue {
  /** 全部已注册命名空间的视图。 */
  namespaces: SettingsNamespaceView[]
  /** 提供方是否接受写入。 */
  writable: boolean
  /** 宿主是否存在本机设置文档。 */
  hasDocument: boolean
}

/** 写入返回值：新 revision（卡片用它更新下一次写入的冲突栅栏）。 */
export interface SettingsWriteValue {
  revision: number
}

/** settings wire 面（与旧 IApiClient['settings'] 同名同形）。 */
export interface SettingsWire {
  /** 读取全部命名空间视图（等价旧 api.settings.describe）。 */
  describe(payload?: object): Promise<SettingsEnvelope<SettingsDescribeValue>>
  /**
   * 顶层字段深合并补丁（等价旧 api.settings.update）。
   *
   * 注意：新 API 的 `set` 对路径端点是**整体替换**（dsh-settings 的 applyPathOp），
   * 不是深合并。所以这里在客户端先读当前 user 段、把 patch 深合并进去，
   * 再把合并结果整体 set 回去——否则 `{providers:{edenai:{models:[…]}}}` 会把
   * `api` / `baseURL` / `apiKeyEnv` / `displayName` 一并抹掉，被 pi-ai 校验拒绝。
   */
  update(payload: { ns: string; patch: object; expectedRevision?: number }): Promise<SettingsEnvelope<SettingsWriteValue>>
  /** 路径级原子操作（等价旧 api.settings.mutate）。 */
  mutate(payload: { ns: string; ops: SettingsPathOpView[]; expectedRevision?: number }): Promise<SettingsEnvelope<SettingsWriteValue>>
}

/** settings 访问面：本插件配置卡片消费的 API（`api.settings.*`）。 */
export interface SettingsAccess {
  /** wire 方法组（保留旧 IApiClient 的 settings 命名层级，卡片代码无需改动）。 */
  settings: SettingsWire
}

/** 构造失败信封。 */
function fail<T>(message: string): SettingsEnvelope<T> {
  return { result: { ok: false, error: { code: 'internal', message, details: {} } } }
}

/** 纯对象判定（数组 / null / 类实例不算）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * 深合并补丁到基线：对象递归合并，其余（数组 / 标量 / null）整体替换。
 * 与旧 api.settings.update 的语义一致；数组按整体替换，因为 settings 的路径
 * 寻址无法表达数组内元素（官方 Models 页同样把 models 数组整体作为 value）。
 */
function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    out[key] = key in out ? deepMerge(out[key], value) : value
  }
  return out
}

/**
 * 在给定的 client 上下文上构造 settings 访问面。
 * @param ctx - 浏览器侧插件上下文（需已注入 settingsScope）。
 * @returns 本插件配置卡片使用的 settings 访问面。
 */
export function createSettingsAccess(ctx: Context): SettingsAccess {
  const binder = ctx.settingsScope as SettingsScopeBinder
  /** 命名空间 → 已绑定的 scope（避免每次写入都重新绑定）。 */
  const scopes = new Map<string, SettingsScope<unknown>>()

  /** 取（或首次绑定）某命名空间的 scope。 */
  const scopeOf = (ns: string): SettingsScope<unknown> => {
    const cached = scopes.get(ns)
    if (cached !== undefined) return cached
    const scope = binder.bind<unknown>({ namespace: ns })
    scopes.set(ns, scope)
    return scope
  }

  /** 写入序列化栅栏用的 revision：优先用共享镜像折进来的最新视图。 */
  const revisionOf = (ns: string, scope: SettingsScope<unknown>): number => {
    const view = binder.describe().getSnapshot().view?.namespaces.find((entry) => entry.ns === ns)
    return view?.revision ?? scope.getSnapshot().revision ?? 0
  }

  /** update / mutate 共用的写入路径。 */
  const write = async (
    ns: string,
    ops: SettingsPathOpView[],
    expectedRevision?: number,
  ): Promise<SettingsEnvelope<SettingsWriteValue>> => {
    try {
      const scope = scopeOf(ns)
      const before = revisionOf(ns, scope)
      await scope.mutate(ops, expectedRevision)
      const after = revisionOf(ns, scope)
      // SettingsScope.mutate 在服务端拒绝时只做一次恢复读取、**不抛错**
      // （见 dsh-client-ui-settings 的 mutate：!response.ok → recover() → return）。
      // 若不在这里核对 revision，写入失败会被静默吞掉，UI 假显示"已保存"。
      // revision 未推进 = 本次写入没有落地。
      if (after === before) return fail(`settings write to "${ns}" was rejected by the host`)
      return { result: { ok: true, value: { revision: after } } }
    } catch (cause) {
      return fail(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return {
    settings: {
      async describe(): Promise<SettingsEnvelope<SettingsDescribeValue>> {
        const face = binder.describe()
        await face.ensure()
        const snapshot = face.getSnapshot()
        const view = snapshot.view
        if (view === undefined) return fail(snapshot.error ?? 'settings unavailable')
        return {
          result: {
            ok: true,
            value: {
              namespaces: [...view.namespaces],
              writable: view.writable,
              hasDocument: view.hasDocument,
            },
          },
        }
      },

      async update({ ns, patch, expectedRevision }): Promise<SettingsEnvelope<SettingsWriteValue>> {
        // 旧 update 是深合并补丁；新的路径级 API 只认 set/unset，且 set 是整体替换。
        // 所以先在客户端把 patch 深合并进当前 user 段，再逐顶层字段整体 set：
        // 既保留未在 patch 里出现的兄弟字段（providers.<route>.api 等），
        // 又让"数组整体替换"的语义与旧 API 一致。
        const descriptor = binder.describe().getSnapshot().view?.namespaces.find((entry) => entry.ns === ns)
        const base = isPlainObject(descriptor?.user) ? descriptor.user : {}
        const merged = deepMerge(base, patch)
        const ops: SettingsPathOpView[] = Object.entries(merged as Record<string, unknown>).map(([key, value]) => ({
          op: 'set',
          path: [key],
          value: value as never,
        }))
        return write(ns, ops, expectedRevision)
      },

      async mutate({ ns, ops, expectedRevision }): Promise<SettingsEnvelope<SettingsWriteValue>> {
        return write(ns, ops, expectedRevision)
      },
    },
  }
}
