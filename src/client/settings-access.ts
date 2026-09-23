/**
 * settings-access —— 浏览器侧 settings 访问层（双线统一）。
 *
 * 历史包袱：≤0.1.4 走 `ctx.connection.api.settings`（`IApiClient`）；0.1.5 起
 * `ConnectionHandle` 上不再有 `api`，改为 `ctx.settingsScope` 服务；0.1.7-alpha
 * 又把 `settingsScope` 整个移除。三条线的版本专属服务名各不相同，唯一**逐字节
 * 稳定**的是 `ctx.remote.settings` 的 wire 形状：
 *
 *   describe()                                   → RemoteResult<{ namespaces, writable, hasDocument }>
 *   update(ns, patch, expectedRevision)          → RemoteResult<SettingsNamespaceView>
 *   mutate(ns, ops, expectedRevision)            → RemoteResult<SettingsNamespaceView>
 *   replace(ns, section, expectedRevision)       → RemoteResult<SettingsNamespaceView>
 *
 * 已对比 0.1.5-rc.2 与 0.1.7-alpha.2 的 `typert.remote-client.d.ts`：四条签名
 * 完全一致（0.1.5 自身的 `dsh-client-ui-settings` 也正是 `inject: ['remote',
 * 'remote.settings']`）。所以本模块直接走 `remote.settings`，不再依赖任何
 * 版本专属服务。
 *
 * 命名空间收拢：DSH 只认「插件条目 id」作为命名空间，因此原先四个独立命名空间
 * 统一落到本条目 `dsh-experience-plugin` 的四个同名子段。这里把单条目描述符
 * **投影**成四个合成视图（沿用旧命名空间名），卡片里 `namespaces.find(entry =>
 * entry.ns === X)` 与 `api.settings.update({ ns: X })` 的写法一行都不用改；
 * 其余真实命名空间（如 `llm-pi-ai`）原样透传。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-settings/types'
import { EXPERIENCE_NS } from '../features/config-sections.js'

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
  /** 命名空间视图：本条目投影出的四个合成视图 + 其余真实命名空间。 */
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
  /**
   * 读取全部命名空间视图。
   * @param payload - 未使用（保留旧签名）。
   */
  describe(payload?: object): Promise<SettingsEnvelope<SettingsDescribeValue>>
  /**
   * 顶层字段深合并补丁。
   *
   * host 的 `update` 本身即深合并，但路径级 `set` 是整体替换；为兼容卡片"只补
   * 几个字段"的写法并保留兄弟字段，这里先深合并再整体写入（同旧语义）。
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

/**
 * 历史命名空间 → 本条目子段的映射。
 *
 * `dsh-experience-plugin` 是历史同名命名空间（现在就是本条目本身），段在根
 * （空串）。其余三个是本插件早期自建的独立命名空间，现已并入同名子段。
 */
export const NAMESPACE_SECTIONS: Record<string, string> = {
  [EXPERIENCE_NS]: '',
  'cli-mimic': 'cliMimic',
  'dsh-experience-mcp-manager': 'mcpManager',
  'dsh-experience-model-params': 'modelParams',
}

/** 远程 settings 面的最小形状（两线同形）。 */
interface RemoteSettings {
  describe(): Promise<{ ok: boolean; value?: SettingsDescribeValue; error?: { message?: string } }>
  update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<{ ok: boolean; value?: SettingsNamespaceView; error?: { message?: string } }>
  mutate(ns: string, ops: SettingsPathOpView[], expectedRevision?: number): Promise<{ ok: boolean; value?: SettingsNamespaceView; error?: { message?: string } }>
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
 * 与旧 api.settings.update 的语义一致；数组按整体替换，因为 settings 的路径寻址
 * 无法表达数组内元素（官方 Models 页同样把 models 数组整体作为 value）。
 */
function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    out[key] = key in out ? deepMerge(out[key], value) : value
  }
  return out
}

/** 取某段的字段值（非对象段退化为 undefined）。 */
function sectionValue(source: unknown, section: string): unknown {
  if (section === '') return source
  return isPlainObject(source) ? source[section] : undefined
}

/**
 * 把条目描述符投影成某个历史命名空间名的视图。
 * @param raw - 条目的真实描述符。
 * @param ns - 目标（历史）命名空间名。
 * @param section - 对应子段名；空串 = 根。
 * @returns 合成视图（沿用目标命名空间名，revision 与条目一致）。
 */
function projectNamespace(raw: SettingsNamespaceView, ns: string, section: string): SettingsNamespaceView {
  if (section === '') return { ...raw, ns }
  return {
    ...raw,
    ns,
    value: sectionValue(raw.value, section) ?? {},
    user: sectionValue(raw.user, section) ?? {},
  } as SettingsNamespaceView
}

/** 把段内路径还原成条目内的完整路径。 */
function toFullPath(section: string, path: readonly string[]): string[] {
  return section === '' ? [...path] : [section, ...path]
}

/**
 * 在给定的 client 上下文上构造 settings 访问面。
 * @param ctx - 浏览器侧插件上下文（需已注入 remote）。
 * @returns 本插件配置卡片使用的 settings 访问面。
 */
export function createSettingsAccess(ctx: Context): SettingsAccess {
  const remote = (): RemoteSettings => (ctx.remote as unknown as { settings: RemoteSettings }).settings

  /** 读条目原始描述符（失败时返回 null）。 */
  const readRaw = async (): Promise<{ raw: SettingsNamespaceView; value: SettingsDescribeValue } | string> => {
    const response = await remote().describe()
    if (!response.ok || response.value === undefined) {
      return response.error?.message ?? 'settings unavailable'
    }
    const raw = response.value.namespaces.find((entry) => entry.ns === EXPERIENCE_NS)
    if (raw === undefined) return `settings namespace "${EXPERIENCE_NS}" is not registered`
    return { raw, value: response.value }
  }

  /** 非本插件命名空间的写入直通（路径不加段前缀）。 */
  const passthroughWrite = async (
    _kind: 'update',
    ns: string,
    patch: object,
    expectedRevision?: number,
  ): Promise<SettingsEnvelope<SettingsWriteValue>> => {
    try {
      const response = await remote().update(ns, patch as Record<string, unknown>, expectedRevision)
      if (!response.ok || response.value === undefined) {
        return fail(response.error?.message ?? `settings write to "${ns}" was rejected by the host`)
      }
      return { result: { ok: true, value: { revision: response.value.revision } } }
    } catch (cause) {
      return fail(cause instanceof Error ? cause.message : String(cause))
    }
  }

  /** 非本插件命名空间的路径操作直通。 */
  const passthroughMutate = async (
    ns: string,
    ops: SettingsPathOpView[],
    expectedRevision?: number,
  ): Promise<SettingsEnvelope<SettingsWriteValue>> => {
    try {
      const response = await remote().mutate(ns, ops, expectedRevision)
      if (!response.ok || response.value === undefined) {
        return fail(response.error?.message ?? `settings mutate to "${ns}" was rejected by the host`)
      }
      return { result: { ok: true, value: { revision: response.value.revision } } }
    } catch (cause) {
      return fail(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return {
    settings: {
      async describe(): Promise<SettingsEnvelope<SettingsDescribeValue>> {
        try {
          const result = await readRaw()
          if (typeof result === 'string') return fail(result)
          // 本条目 → 四个合成视图（沿用历史命名空间名）；其余真实命名空间透传。
          const synthetic = Object.entries(NAMESPACE_SECTIONS)
            .map(([ns, section]) => projectNamespace(result.raw, ns, section))
          const others = result.value.namespaces.filter((entry) => entry.ns !== EXPERIENCE_NS)
          return {
            result: {
              ok: true,
              value: {
                namespaces: [...synthetic, ...others],
                writable: result.value.writable,
                hasDocument: result.value.hasDocument,
              },
            },
          }
        } catch (cause) {
          return fail(cause instanceof Error ? cause.message : String(cause))
        }
      },

      async update({ ns, patch, expectedRevision }): Promise<SettingsEnvelope<SettingsWriteValue>> {
        const section = NAMESPACE_SECTIONS[ns]
        // 非本插件命名空间（如 llm-pi-ai）：直通，路径不加前缀。
        if (section === undefined) return passthroughWrite('update', ns, patch, expectedRevision)
        try {
          const result = await readRaw()
          if (typeof result === 'string') return fail(result)
          const currentUser = sectionValue(result.raw.user, section)
          const merged = deepMerge(currentUser ?? {}, patch)
          const response = await remote().update(
            EXPERIENCE_NS,
            (section === '' ? merged : { [section]: merged }) as Record<string, unknown>,
            expectedRevision,
          )
          if (!response.ok || response.value === undefined) {
            return fail(response.error?.message ?? `settings write to "${ns}" was rejected by the host`)
          }
          const projected = projectNamespace(response.value, ns, section)
          return { result: { ok: true, value: { revision: projected.revision } } }
        } catch (cause) {
          return fail(cause instanceof Error ? cause.message : String(cause))
        }
      },

      async mutate({ ns, ops, expectedRevision }): Promise<SettingsEnvelope<SettingsWriteValue>> {
        const section = NAMESPACE_SECTIONS[ns]
        if (section === undefined) return passthroughMutate(ns, ops, expectedRevision)
        try {
          const response = await remote().mutate(
            EXPERIENCE_NS,
            ops.map((op) => ({ ...op, path: toFullPath(section, op.path) })) as SettingsPathOpView[],
            expectedRevision,
          )
          if (!response.ok || response.value === undefined) {
            return fail(response.error?.message ?? `settings mutate to "${ns}" was rejected by the host`)
          }
          return { result: { ok: true, value: { revision: response.value.revision } } }
        } catch (cause) {
          return fail(cause instanceof Error ? cause.message : String(cause))
        }
      },
    },
  }
}
