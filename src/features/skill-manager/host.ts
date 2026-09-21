/**
 * skill-manager —— host 半区：管理 $DSH_HOME/skills 下的技能。
 *
 * dsh 的技能由 @deepseek-ai/dsh-skill-filesystem 提供方发现并监听：
 *   - 发现 <dshHome>/skills/<name>/SKILL.md（目录 bundle）与 <dshHome>/skills/<name>.md（平铺）；
 *   - chokidar 监听目录成员新增/移除 → 热失效/热加载（watch 默认开启）。
 *
 * 因此本模块的「开启/关闭」就是对技能做物理移动：
 *   - 关闭：skills/<name> → skills/.disabled/<name>（嵌套层级不被发现 → 立即从模型目录消失）；
 *   - 开启：移回 skills/<name>（chokidar addDir → 重新发现）。
 *
 * 新增 = 在 skills/<name> 下创建最小 SKILL.md 模板（frontmatter 含 name/description）；
 * 导入 = 本地目录复制，或 SkillHub slug（走官方 skillhub CLI 装到 skills 目录）。
 *
 * 通信走官方通用 RPC 通道（connection.rpc），channel 独立：
 *   skill/manager/list · skill/manager/toggle · skill/manager/add · skill/manager/import
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcResult as RpcResult } from '@deepseek-ai/dsh-client-connection'
import { provideRpcChannel } from '../rpc-channel.js'
import { resolveDshHome } from '../my-rules/host.js'

/** 本模块 RPC 通道（绝对路径前缀，独立于其他模块）。 */
export const SKILL_MANAGER_RPC_CHANNEL = '/dsh-skill-manager'
/** 列出已安装/已关闭的技能。 */
export const SKILL_MANAGER_LIST = 'skill/manager/list'
/** 开启/关闭一个已安装技能。 */
export const SKILL_MANAGER_TOGGLE = 'skill/manager/toggle'
/** 新增一个技能（最小 SKILL.md 模板）。 */
export const SKILL_MANAGER_ADD = 'skill/manager/add'
/** 导入一个技能（本地目录 / SkillHub slug）。 */
export const SKILL_MANAGER_IMPORT = 'skill/manager/import'

/** 技能形态：目录 bundle 或平铺 Markdown。 */
export type SkillKind = 'bundle' | 'flat'

/** 一个技能条目（list 返回）。 */
export interface ManagedSkill {
  /** 技能名（目录名或 .md 文件名去掉扩展名）。 */
  name: string
  /** 来自 SKILL.md frontmatter 的 description（缺失时为空串）。 */
  description: string
  /** bundle = <name>/SKILL.md；flat = <name>.md。 */
  kind: SkillKind
  /** 是否启用（true = 在 skills 根下；false = 在 .disabled 下）。 */
  enabled: boolean
  /** 相对 skills 根的路径（如 excel-xlsx 或 foo.md），用于展示。 */
  relPath: string
}

/** list 返回值。 */
export interface SkillManagerView {
  /** 已启用技能。 */
  skills: ManagedSkill[]
  /** 已关闭（移入 .disabled）技能。 */
  disabled: ManagedSkill[]
  /** 展示用 skills 根路径（~/.dsh/skills 形态）。 */
  root: string
}

/** 技能名校验：kebab 风格，允许 字母/数字/._-，禁止以 . 开头。 */
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/

/** 校验技能名是否合法（同时天然防路径穿越）。 */
export function isValidSkillName(name: string): boolean {
  return NAME_RE.test(name)
}

/** 技能根目录。 */
export function skillsRoot(dshHome: string): string {
  return path.join(dshHome, 'skills')
}

/** 关闭技能停放目录（嵌套层级不被 discovery 发现）。 */
export function disabledSkillsRoot(dshHome: string): string {
  return path.join(skillsRoot(dshHome), '.disabled')
}

/** 展示用 home（~/.dsh 缩写）。 */
function displayHome(dshHome: string): string {
  const def = path.join(os.homedir(), '.dsh')
  return path.resolve(dshHome) === path.resolve(def) ? '~/.dsh' : '$DSH_HOME'
}

/** 读取目录下的直接子项（目录+文件），错误时返回空。 */
function readDirEntries(dir: string): { name: string; isDir: boolean }[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, isDir: e.isDirectory() }))
  } catch {
    return []
  }
}

/** 从 SKILL.md / .md 内容解析 frontmatter 的 name / description（轻量解析，够展示用）。 */
export function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (m === null) return {}
  const block = m[1]
  const nameLine = /(?:^|\n)name:\s*(.+?)\s*$/m.exec(block)
  const descLine = /(?:^|\n)description:\s*(.+?)\s*$/m.exec(block)
  const clean = (s: string | undefined): string | undefined => {
    if (s === undefined) return undefined
    return s.trim().replace(/^["']|["']$/g, '').trim()
  }
  return { name: clean(nameLine?.[1]), description: clean(descLine?.[1]) }
}

/** 读取单个技能条目：root 下的 name（bundle 目录或 flat 文件）。 */
function scanEntry(root: string, name: string, isDir: boolean, enabled: boolean): ManagedSkill | null {
  if (isDir) {
    const skillMd = path.join(root, name, 'SKILL.md')
    if (!fs.existsSync(skillMd)) return null
    let description = ''
    try {
      description = parseSkillFrontmatter(fs.readFileSync(skillMd, 'utf8')).description ?? ''
    } catch {
      // 读取失败按无描述处理
    }
    return { name, description, kind: 'bundle', enabled, relPath: name }
  }
  if (name.endsWith('.md')) {
    const file = path.join(root, name)
    if (!fs.existsSync(file)) return null
    let description = ''
    try {
      description = parseSkillFrontmatter(fs.readFileSync(file, 'utf8')).description ?? ''
    } catch {
      // 读取失败按无描述处理
    }
    return { name: name.slice(0, -3), description, kind: 'flat', enabled, relPath: name }
  }
  return null
}

/** 扫描一个根（enabled 根或 .disabled 根）下的全部技能。 */
function scanRoot(dshHome: string, root: string, enabled: boolean): ManagedSkill[] {
  const entries: ManagedSkill[] = []
  for (const e of readDirEntries(root)) {
    const skill = scanEntry(root, e.name, e.isDir, enabled)
    if (skill !== null) entries.push(skill)
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

/** 列出全部技能（启用 + 已关闭）。 */
function handleList(): RpcResult<SkillManagerView> {
  const dshHome = resolveDshHome()
  const root = skillsRoot(dshHome)
  const disabled = disabledSkillsRoot(dshHome)
  return {
    ok: true,
    value: {
      skills: scanRoot(dshHome, root, true),
      disabled: scanRoot(dshHome, disabled, false),
      root: `${displayHome(dshHome)}/skills`,
    },
  }
}

/** 开启/关闭一个已安装技能（物理移动目录/文件到 .disabled 或移回）。 */
function handleToggle(payload: unknown): RpcResult<ManagedSkill> {
  const body = payload as { name?: unknown; enabled?: unknown } | undefined
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const enabled = body?.enabled === true
  if (!isValidSkillName(name)) return rpcError('skill-manager toggle requires a valid skill name')
  const dshHome = resolveDshHome()
  const root = skillsRoot(dshHome)
  const disabled = disabledSkillsRoot(dshHome)
  // 定位当前条目：可能存在于启用根或 .disabled 根，形态可能是 bundle 目录或 flat 文件。
  const candidates: { from: string; to: string; entry: ManagedSkill | null }[] = []
  for (const [fromRoot, toRoot, isEnabled] of [[root, disabled, true], [disabled, root, false]] as const) {
    if (fs.existsSync(path.join(fromRoot, name)) && fs.statSync(path.join(fromRoot, name)).isDirectory()) {
      candidates.push({ from: path.join(fromRoot, name), to: path.join(toRoot, name), entry: scanEntry(fromRoot, name, true, isEnabled) })
    }
    if (fs.existsSync(path.join(fromRoot, name + '.md'))) {
      candidates.push({ from: path.join(fromRoot, name + '.md'), to: path.join(toRoot, name + '.md'), entry: scanEntry(fromRoot, name + '.md', false, isEnabled) })
    }
  }
  const match = candidates.find((c) => c.entry?.enabled !== enabled)
  if (match === undefined || match.entry === null) {
    // 没有需要切换的条目：若目标状态已经达成则视为成功，否则报未找到。
    const already = candidates.find((c) => c.entry?.enabled === enabled)
    if (already !== undefined && already.entry !== null) return { ok: true, value: already.entry }
    return rpcError('skill not found: ' + name)
  }
  try {
    fs.mkdirSync(path.dirname(match.to), { recursive: true })
    fs.renameSync(match.from, match.to)
  } catch (error) {
    return rpcError('toggle skill failed: ' + (error instanceof Error ? error.message : String(error)))
  }
  return { ok: true, value: { ...match.entry, enabled } }
}

/** 最小 SKILL.md 模板。 */
function skillTemplate(name: string, description: string): string {
  const safeDesc = description.replace(/"/g, '\\"').replace(/\r?\n/g, ' ')
  return `---
name: ${name}
description: "${safeDesc}"
---

# ${name}

## When to Use

使用该技能的场景：${description || '（待补充）'}

## Core Rules

- 在这里补充这个技能的核心规则。
`
}

/** 新增一个技能（创建 skills/<name>/SKILL.md）。 */
function handleAdd(payload: unknown): RpcResult<ManagedSkill> {
  const body = payload as { name?: unknown; description?: unknown } | undefined
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description : ''
  if (!isValidSkillName(name)) return rpcError('skill add requires a valid skill name (a-z0-9._-, max 64, not starting with .)')
  if (description.length > 2000) return rpcError('skill description too long')
  const dshHome = resolveDshHome()
  const root = skillsRoot(dshHome)
  const disabled = disabledSkillsRoot(dshHome)
  const dir = path.join(root, name)
  if (fs.existsSync(dir)) return rpcError('skill already exists: ' + name)
  if (fs.existsSync(path.join(root, name + '.md')) || fs.existsSync(path.join(disabled, name)) || fs.existsSync(path.join(disabled, name + '.md'))) {
    return rpcError('skill already exists (enabled or disabled): ' + name)
  }
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillTemplate(name, description), 'utf8')
  } catch (error) {
    return rpcError('create skill failed: ' + (error instanceof Error ? error.message : String(error)))
  }
  return { ok: true, value: { name, description, kind: 'bundle', enabled: true, relPath: name } }
}

/** 复制一个本地技能目录（含 SKILL.md 或平铺 .md）到 skills 根。 */
function handleImportLocal(localPath: string): RpcResult<ManagedSkill> {
  if (!path.isAbsolute(localPath)) return rpcError('skill import local requires an absolute directory path')
  if (!fs.existsSync(localPath) || !fs.statSync(localPath).isDirectory()) {
    return rpcError('import source directory not found: ' + localPath)
  }
  const name = path.basename(localPath)
  if (!isValidSkillName(name)) return rpcError('import source directory name is not a valid skill name: ' + name)
  const files = readDirEntries(localPath)
  const hasSkillMd = files.some((f) => f.isDir === false && f.name === 'SKILL.md')
  const hasFlatMd = files.some((f) => f.isDir === false && f.name.endsWith('.md'))
  if (!hasSkillMd && !hasFlatMd) return rpcError('import source must contain SKILL.md (bundle) or a .md file (flat)')
  const dshHome = resolveDshHome()
  const root = skillsRoot(dshHome)
  const target = path.join(root, name)
  if (fs.existsSync(target)) return rpcError('skill already exists: ' + name)
  try {
    fs.cpSync(localPath, target, { recursive: true })
  } catch (error) {
    return rpcError('import skill failed: ' + (error instanceof Error ? error.message : String(error)))
  }
  const entry = scanEntry(root, name, true, true) ?? { name, description: '', kind: 'bundle' as const, enabled: true, relPath: name }
  return { ok: true, value: entry }
}

/** 通过官方 skillhub CLI 从 SkillHub 导入技能到 skills 根。 */
function handleImportSkillHub(slug: string): RpcResult<ManagedSkill> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(slug)) return rpcError('invalid skillhub slug')
  const dshHome = resolveDshHome()
  const root = skillsRoot(dshHome)
  const probe = spawnSync('skillhub', ['--version'], { encoding: 'utf8', shell: true })
  if (probe.error !== undefined && (probe.error as NodeJS.ErrnoException).code === 'ENOENT') {
    return rpcError('skillhub CLI not installed; run: curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash -s -- --cli-only')
  }
  const run = spawnSync('skillhub', ['install', slug, '--dir', root], { encoding: 'utf8', shell: true, maxBuffer: 8 * 1024 * 1024 })
  if (run.status !== 0) {
    return rpcError('skillhub install failed: ' + (run.stderr || run.stdout || 'unknown error').trim().slice(0, 500))
  }
  // slug 可能不是最终目录名，重新 list 定位新增技能：用 slug 猜测或从根下扫（简单起见用 slug 直接当名字猜）。
  const entry = scanEntry(root, slug, true, true) ?? { name: slug, description: 'imported from SkillHub', kind: 'bundle', enabled: true, relPath: slug }
  return { ok: true, value: entry }
}

/** 导入技能。 */
function handleImport(payload: unknown): RpcResult<ManagedSkill> {
  const body = payload as { source?: unknown; path?: unknown; slug?: unknown } | undefined
  if (body?.source === 'local' && typeof body.path === 'string') return handleImportLocal(body.path)
  if (body?.source === 'skillhub' && typeof body.slug === 'string') return handleImportSkillHub(body.slug)
  return rpcError('skill import requires source "local" (with path) or "skillhub" (with slug)')
}

/** 构造 RPC 错误。 */
function rpcError(message: string): RpcResult<never> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/**
 * 通道端点分发（独立导出便于测试 harness 直接调用）。
 * @param endpoint - 通道内端点（skill/manager/*）。
 * @param payload - 请求体。
 */
export async function dispatchSkillManagerRpc(endpoint: string, payload: unknown): Promise<RpcResult<unknown>> {
  if (endpoint === SKILL_MANAGER_LIST) return handleList()
  if (endpoint === SKILL_MANAGER_TOGGLE) return handleToggle(payload)
  if (endpoint === SKILL_MANAGER_ADD) return handleAdd(payload)
  if (endpoint === SKILL_MANAGER_IMPORT) return handleImport(payload)
  return rpcError('unknown skill-manager endpoint: ' + endpoint)
}

/**
 * 装配 skill-manager host 半区。
 * @param ctx - host 插件上下文。
 */
export function applySkillManager(ctx: Context): void {
  ctx.effect(
    () => provideRpcChannel(SKILL_MANAGER_RPC_CHANNEL, (endpoint, payload) => dispatchSkillManagerRpc(endpoint, payload)),
    'skill-manager: rpc channel',
  )
}
