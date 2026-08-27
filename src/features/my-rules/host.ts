/**
 * my-rules —— host 半区：读写「用户全局指令」($DSH_HOME/AGENTS.md)。
 *
 * 这个文件会被 DSH 内置的 dsh-agent-instructions 注入到本主机上的每一个会话
 * 作为持久指令块——所以编辑它等于给所有聊天设定「我的规则」。空内容保存 =
 * 删除文件（清除全局指令）；超过 64 KiB 指令预算时照常写入但标记警告。
 *
 * 通信：走官方通用 RPC 通道（connection.rpc），channel 独立于 model-reasoning
 * 的 /dsh-experience-plugin，避免路径冲突。浏览器侧经 rpc.call 读写。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

/** dsh-base 为 dsh-agent-instructions 配置的指令预算（maxBytes: 65536）。 */
const INSTRUCTION_BUDGET_BYTES = 65536

/** 本模块 RPC 通道（绝对路径前缀，独立于其他模块）。 */
export const MY_RULES_RPC_CHANNEL = '/dsh-my-rules'
/** 读取全局指令。 */
export const MY_RULES_RPC_READ = 'my-rules/read'
/** 写入全局指令。 */
export const MY_RULES_RPC_WRITE = 'my-rules/write'

/** readGlobalRules 返回值。 */
export interface MyRulesView {
  /** 文件当前是否存在。 */
  exists: boolean
  /** 当前内容（文件不存在时为空串）。 */
  content: string
  /** 内容字节数（UTF-8）。 */
  bytes: number
  /** 文件绝对路径。 */
  path: string
  /** 展示用路径（~/.dsh 或 $DSH_HOME 形态）。 */
  displayPath: string
  /** 指令预算（字节）。 */
  budget: number
}

/** writeGlobalRules 返回值。 */
export interface MyRulesWriteResult {
  /** 本次保存是否删除了文件（空内容保存）。 */
  removed: boolean
  /** 写入内容的字节数。 */
  bytes: number
  /** 是否超过 64 KiB 预算（写入成功但渲染可能截断）。 */
  warning: boolean
  /** 展示用路径。 */
  displayPath: string
}

/** 解析 $DSH_HOME：显式配置 → DSH_HOME 环境变量 → ~/.dsh。 */
export function resolveDshHome(configured?: string, env: Record<string, string | undefined> = process.env): string {
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  const fromEnv = env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return path.join(os.homedir(), '.dsh')
}

/** 全局指令文件路径。 */
export function globalInstructionsPath(dshHome: string): string {
  return path.join(dshHome, 'AGENTS.md')
}

/** 展示用 home（~/.dsh 缩写，便于 UI 提示）。 */
function displayHome(dshHome: string): string {
  const def = path.join(os.homedir(), '.dsh')
  return path.resolve(dshHome) === path.resolve(def) ? '~/.dsh' : '$DSH_HOME'
}

/** 读取文件内容，不存在 / 不可读时返回 null。 */
function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/** 构造 RPC 错误。 */
function rpcError(message: string): RpcResult<never> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/** 读取当前全局指令文件。 */
function handleRead(): RpcResult<MyRulesView> {
  const dshHome = resolveDshHome()
  const file = globalInstructionsPath(dshHome)
  const content = readText(file)
  return {
    ok: true,
    value: {
      exists: content !== null,
      content: content ?? '',
      bytes: content === null ? 0 : Buffer.byteLength(content, 'utf8'),
      path: file,
      displayPath: `${displayHome(dshHome)}/AGENTS.md`,
      budget: INSTRUCTION_BUDGET_BYTES,
    },
  }
}

/** 保存全局指令文件；空内容删除文件，非空覆盖写。 */
function handleWrite(payload: unknown): RpcResult<MyRulesWriteResult> {
  const body = payload as { content?: unknown } | undefined
  if (body === undefined || body === null || typeof body !== 'object' || typeof body.content !== 'string') {
    return rpcError('my-rules write requires a content string')
  }
  const content = body.content
  if (Buffer.byteLength(content, 'utf8') > 64 * 1024 * 1024) {
    return rpcError('content too large')
  }
  const dshHome = resolveDshHome()
  const file = globalInstructionsPath(dshHome)
  let removed = false
  try {
    if (content.trim() === '') {
      if (fs.existsSync(file)) fs.rmSync(file)
      removed = true
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content, 'utf8')
    }
  } catch (error) {
    return rpcError(error instanceof Error ? error.message : String(error))
  }
  const bytes = Buffer.byteLength(content, 'utf8')
  return {
    ok: true,
    value: {
      removed,
      bytes,
      warning: bytes > INSTRUCTION_BUDGET_BYTES,
      displayPath: `${displayHome(dshHome)}/AGENTS.md`,
    },
  }
}

/**
 * 通道端点分发（独立导出便于测试 harness 直接调用）。
 * @param endpoint - 通道内端点（my-rules/read / my-rules/write）。
 * @param payload - 请求体。
 */
export async function dispatchMyRulesRpc(endpoint: string, payload: unknown): Promise<RpcResult<unknown>> {
  if (endpoint === MY_RULES_RPC_READ) return handleRead()
  if (endpoint === MY_RULES_RPC_WRITE) return handleWrite(payload)
  return rpcError('unknown my-rules endpoint: ' + endpoint)
}

/**
 * 注册全局指令 RPC 通道。
 * @param ctx - host 插件上下文（需要 connection 服务）。
 * @returns 卸载函数；connection 服务缺席（如测试环境）返回 undefined。
 */
export function applyMyRulesRemote(ctx: Context): (() => Promise<void>) | undefined {
  const connection = ctx.get('connection') as HostConnectionHandle | undefined
  if (connection === undefined) return undefined
  return connection.rpc.handle(MY_RULES_RPC_CHANNEL, (endpoint: string, payload: unknown) => {
    return dispatchMyRulesRpc(endpoint, payload)
  }, { authority: 'loopback' })
}

/**
 * 装配 my-rules host 半区。
 * @param ctx - host 插件上下文。
 */
export function applyMyRules(ctx: Context): void {
  const dispose = applyMyRulesRemote(ctx)
  if (dispose !== undefined) {
    ctx.effect(() => () => { void dispose() }, 'my-rules: rpc channel')
  }
}
