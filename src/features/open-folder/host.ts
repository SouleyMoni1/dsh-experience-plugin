/**
 * open-folder —— host 半区：POST /api/open-folder，在系统文件管理器中打开目录。
 *
 * 为什么需要 host 半区：
 *  - 官方 host.openPath 在 Web 载体下被重定向到内置 Files 面板，不弹系统
 *    文件管理器（Windows explorer / macOS open / Linux xdg-open）。
 *  - Web 模式下 tool-bash / tool-pwsh 被官方 patch 禁用，AI 无法跑命令，
 *    只能由插件在 host 侧调用系统命令。
 *
 * 安全模型：
 *  - 只允许打开「已注册 workspace 的路径」（workspaceRegistry.list() 的 path）。
 *  - 目录存在性二次校验（fs.stat 必须存在且为目录）。
 *  - spawn 直接传参（不走 shell），避免注入；子进程 detached + unref。
 *  - Windows 下 explorer 的退出码不可靠，不把非 0 当失败。
 */
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

/** WebServer 的最小类型面（不依赖 dsh-host-webserver 的编译类型）。 */
interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** workspaceRegistry 的最小类型面（不依赖 dsh-workspace 的编译类型）。 */
interface WorkspaceRegistryLike {
  list(): Array<{ path: string }>
}

/** open-folder host 配置。 */
export interface OpenFolderConfig {
  enabled: boolean
}

/** 平台命令（Windows explorer 等）。 */
function openerFor(platform: NodeJS.Platform): { cmd: string; args: (path: string) => string[] } {
  switch (platform) {
    case 'win32':
      return { cmd: 'explorer', args: (path) => [path] }
    case 'darwin':
      return { cmd: 'open', args: (path) => [path] }
    default:
      return { cmd: 'xdg-open', args: (path) => [path] }
  }
}

/** 读取 JSON body（上限 64 KiB，防滥用）。 */
async function readJsonBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) throw new Error('payload too large')
    chunks.push(buf)
  }
  if (total === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** 写一个 JSON 响应。 */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** 在系统文件管理器里打开一个已存在的目录。 */
function openInFileManager(path: string, platform: NodeJS.Platform = process.platform): void {
  const { cmd, args } = openerFor(platform)
  // spawn 直接传参，不经 shell，避免注入；detach + unref 让子进程脱离
  // dsh 进程生命周期（否则 dsh 退出时资源管理器窗口会被带掉）。
  const child = spawn(cmd, args(path), { detached: true, stdio: 'ignore' })
  child.unref()
}

/**
 * 装配 open-folder host 半区。
 * @param ctx - host 侧插件上下文。
 * @param config - 功能配置。
 */
export function applyOpenFolderHost(ctx: Context, config: OpenFolderConfig): void {
  if (!config.enabled) return
  const webServer = (ctx as unknown as { webServer?: WebServerLike }).webServer
  if (webServer === undefined) return

  ctx.effect(() =>
    webServer.register({
      kind: 'prefix',
      path: '/api/open-folder',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        try {
          if (req.method !== 'POST') {
            json(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          const body = (await readJsonBody(req)) as { path?: unknown } | undefined
          const raw = body?.path
          if (typeof raw !== 'string' || raw.trim() === '') {
            json(res, 400, { ok: false, error: 'missing path' })
            return
          }
          const path = raw.trim()

          // 安全校验：只允许已注册 workspace 的路径。
          const registry = (ctx as unknown as { workspaceRegistry?: WorkspaceRegistryLike }).workspaceRegistry
          const allowed = new Set(registry?.list().map((ws) => ws.path) ?? [])
          if (!allowed.has(path)) {
            json(res, 403, { ok: false, error: 'path not registered as a workspace' })
            return
          }

          // 目录存在性校验。
          try {
            const info = await stat(path)
            if (!info.isDirectory()) {
              json(res, 400, { ok: false, error: 'path is not a directory' })
              return
            }
          } catch {
            json(res, 404, { ok: false, error: 'path not found' })
            return
          }

          openInFileManager(path)
          json(res, 200, { ok: true })
        } catch (err) {
          console.error('[open-folder] handler failed:', err)
          json(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) })
        }
      }
    }),
  'open-folder: /api/open-folder route')
}
