/**
 * settings-compat —— settings 契约的双线适配层（稳定线 / alpha 线）。
 *
 * 已逐字节验证：两条线的契约差异**只有一处**——命名空间从哪来。
 *
 *   稳定线（npm tag `latest` = 0.1.5-rc.x）
 *     插件自选命名空间，必须先 `ctx.settings.register(ns, schema, opts)`；
 *     未注册的命名空间不出现在 `describe()` 里，因而也无法被读写。
 *
 *   alpha 线（npm tag `alpha` = 0.1.7-alpha.x 起）
 *     `register` 已删除；命名空间 = **Loader 条目 id**，schema 即条目 `Config`，
 *     且可写字段必须是 Config 上标了 `.volatile()` 的节点。
 *
 * 其余全部一致，所以本层只在启动时做一件事（稳定线上注册），读 / 写 / 订阅
 * 直接调用 `ctx.settings` 上两线同名同形的 API：
 *   - 读：`describe()` → `{ ns, value, user, revision }`
 *   - 写：`update(ns, patch, expectedRevision)`
 *   - 订阅：`settings/document-updated` 事件
 *
 * 浏览器侧同样无需适配：`remote.settings` 的 wire 形状（`describe` / `update` /
 * `replace` / `mutate`，返回 `{ ok, value }`）两线逐字节一致。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { EXPERIENCE_NS, type ConfigSectionKey } from './config-sections.js'

/** 一条命名空间描述符（只声明本项目用到的字段）。 */
export interface NamespaceDescriptor {
  /** 命名空间 key。 */
  ns: string
  /** 当前解析值（schema 默认 → base → user）。 */
  value: unknown
  /** 用户层原始段；存在即代表该字段被用户显式保存过。 */
  user?: unknown
  /** 单调递增的 revision，写回时作为冲突栅栏。 */
  revision: number
}

/** 两线共用的 settings 面（`describe` / `update` 同名同形）。 */
interface SettingsProvider {
  describe(options?: { redactSecrets?: boolean }): NamespaceDescriptor[]
  update(ns: string, patch: object, expectedRevision?: number): Promise<void>
}

/** 稳定线额外的注册入口（alpha 线已删除该方法）。 */
interface LegacySettingsProvider extends SettingsProvider {
  register<T>(ns: string, schema: z<unknown>, options?: { base?: Partial<T>; applies?: 'live' | 'restart' }): { get(): T }
}

/** 稳定线额外的原始段读取入口（alpha 线无此方法）。 */
interface RawSectionReader {
  /** 读文档里某命名空间的原始段，**不要求该命名空间已注册**。 */
  section?(ns: string): unknown
}

/** 取 settings 服务。 */
function providerOf(ctx: Context): SettingsProvider | undefined {
  return ctx.get('settings') as SettingsProvider | undefined
}

/** 探测 settings 服务属于哪条线。 */
export function settingsLine(settings: unknown): 'legacy' | 'config' {
  return typeof (settings as { register?: unknown } | undefined)?.register === 'function' ? 'legacy' : 'config'
}

/**
 * 确保本插件的设置命名空间在两条线上都可用。
 *
 * 稳定线：把 `schema`（**不带 volatile 标记**的那份）注册到 {@link EXPERIENCE_NS}。
 * 那条线的 schemastery 同样认识 `volatile`，会把已标节点解析成 `{ get() }`
 * 包装，直接注册带标记的 schema 会让设置值与官方 UI 都读到空对象；所以调用方
 * 传入的是不带标记的 `PlainConfig`。
 *
 * alpha 线：什么都不做，loader 已按条目 id 提供命名空间。
 *
 * 热重载边界上重复注册会抛 `settings namespace "…" is already registered`，
 * 捕获后降级为 debug 日志（与迁移前的容错行为一致）。
 * @param ctx - host 插件上下文。
 * @param schema - 稳定线注册用的 schema（无 volatile 标记）。
 * @param options - 注册选项（applies 默认 live）。
 */
export function ensureNamespace(
  ctx: Context,
  schema: z<unknown>,
  options: { applies?: 'live' | 'restart' } = {},
): void {
  const settings = ctx.get('settings') as LegacySettingsProvider | undefined
  if (settings === undefined || settingsLine(settings) !== 'legacy') return
  try {
    settings.register(EXPERIENCE_NS, schema, { applies: options.applies ?? 'live' })
  } catch (error) {
    ctx.logger('settings-compat').debug(
      'namespace %s already registered: %s',
      EXPERIENCE_NS,
      (error as Error).message,
    )
  }
}

/**
 * 读某个命名空间的**原始文档段**（不需要该命名空间已注册）。
 *
 * 用途只有一个：一次性迁移历史命名空间（`dsh-hello-plugin`）。
 * 那类命名空间已无任何插件注册，因而 `describe()` 里根本看不到它——这正是
 * 「迁移写了却永远不触发」的根因。稳定线的 provider 有 `section(ns)` 可直接读
 * 原始段；alpha 线没有该方法（且该线的命名空间由条目 id 提供，旧条目已不存在），
 * 于是退化为 undefined，迁移自然跳过。
 * @param ctx - host 插件上下文。
 * @param ns - 命名空间 key。
 * @returns 原始段；不可读时为 undefined。
 */
export function readRawSection(ctx: Context, ns: string): unknown {
  const settings = ctx.get('settings') as (SettingsProvider & RawSectionReader) | undefined
  if (settings === undefined) return undefined
  if (typeof settings.section === 'function') {
    try {
      return settings.section(ns)
    } catch (error) {
      ctx.logger('settings-compat').debug('raw section %s unreadable: %s', ns, (error as Error).message)
      return undefined
    }
  }
  return describeNamespace(ctx, ns)?.user
}

/**
 * 读任意命名空间的当前视图。
 *
 * 用于访问**别的插件**声明的命名空间（如 `llm-pi-ai`）：稳定线上它是对方的
 * 注册名，alpha 线上是对方的条目 id，两种情况都出现在 `describe()` 里且 key 相同。
 * @param ctx - host 插件上下文。
 * @param ns - 命名空间 key。
 * @returns 描述符；未出现时为 undefined。
 */
export function describeNamespace(ctx: Context, ns: string): NamespaceDescriptor | undefined {
  return providerOf(ctx)?.describe().find((entry) => entry.ns === ns)
}

/**
 * 读本插件命名空间的当前视图。
 * @param ctx - host 插件上下文。
 * @returns 描述符；命名空间尚未出现时（服务缺席 / fiber 未激活）为 undefined。
 */
export function readNamespace(ctx: Context): NamespaceDescriptor | undefined {
  return describeNamespace(ctx, EXPERIENCE_NS)
}

/**
 * 读某个配置段的值（默认值已由各自来源合并）。
 * @param ctx - host 插件上下文。
 * @param key - 段名。
 * @returns 该段当前值；不可用时为空对象。
 */
export function readSection<T>(ctx: Context, key: ConfigSectionKey): T {
  const value = readNamespace(ctx)?.value
  const section = value === null || typeof value !== 'object' ? undefined : (value as Record<string, unknown>)[key]
  return (section ?? {}) as T
}

/**
 * 判断某段是否已被用户显式保存过（决定「内置知识库是否退场」之类语义）。
 * @param ctx - host 插件上下文。
 * @param key - 段名。
 * @returns 用户层是否存在该段。
 */
export function userOwnsSection(ctx: Context, key: ConfigSectionKey): boolean {
  const user = readNamespace(ctx)?.user
  const section = user === null || typeof user !== 'object' ? undefined : (user as Record<string, unknown>)[key]
  return section !== undefined && section !== null
}

/**
 * 写入任意命名空间（用于**别的插件**声明的命名空间，如 `llm-pi-ai`）。
 *
 * 稳定线上它是对方的注册名，alpha 线上是对方的条目 id；`update` 两线同形，
 * 所以调用点不分线。
 * @param ctx - host 插件上下文。
 * @param ns - 命名空间 key。
 * @param patch - 顶层键补丁（深合并）。
 * @param expectedRevision - 冲突栅栏；省略则无条件写。
 */
export async function updateNamespace(
  ctx: Context,
  ns: string,
  patch: object,
  expectedRevision?: number,
): Promise<void> {
  const settings = providerOf(ctx)
  if (settings === undefined) throw new Error('settings service is unavailable')
  await settings.update(ns, patch, expectedRevision)
}

/**
 * 写入本插件命名空间（顶层键补丁，深合并语义）。
 *
 * 两线同名同形：稳定线合并进设置文档该命名空间的 user 段；alpha 线合并进条目的
 * profile patch config（顶层可写键已标 volatile，`validatePaths` 放行）。
 * @param ctx - host 插件上下文。
 * @param patch - 顶层键补丁。
 * @param expectedRevision - 冲突栅栏；省略则无条件写。
 */
export async function writeNamespace(
  ctx: Context,
  patch: object,
  expectedRevision?: number,
): Promise<void> {
  const settings = providerOf(ctx)
  if (settings === undefined) throw new Error('settings service is unavailable')
  await settings.update(EXPERIENCE_NS, patch, expectedRevision)
}

/**
 * 写入某个配置段。
 * @param ctx - host 插件上下文。
 * @param key - 段名。
 * @param patch - 该段的字段补丁。
 * @param expectedRevision - 冲突栅栏；省略则无条件写。
 */
export async function writeSection(
  ctx: Context,
  key: ConfigSectionKey,
  patch: object,
  expectedRevision?: number,
): Promise<void> {
  await writeNamespace(ctx, { [key]: patch }, expectedRevision)
}

/**
 * 订阅本插件命名空间的变更。
 *
 * 两线同名事件 `settings/document-updated`（`ns, revision`）；alpha 线的
 * `loader/volatile-update` 只派发给本 fiber，用于热替换，不是持久化提交信号，
 * 所以这里统一听前者。
 * @param ctx - host 插件上下文。
 * @param listener - 变更已提交后的回调。
 * @returns 取消订阅的 disposer。
 */
export function onNamespaceChanged(ctx: Context, listener: () => void): () => void {
  return ctx.on('settings/document-updated', (ns: string) => {
    if (String(ns) !== EXPERIENCE_NS) return
    listener()
  })
}
