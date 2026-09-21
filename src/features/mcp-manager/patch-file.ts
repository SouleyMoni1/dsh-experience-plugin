/**
 * cordis.patch.yml 的文本级编辑器：读写用户 patch 层里的 MCP 条目。
 *
 * 为什么不用官方 `loader.update()` / `entry.update()`：那条路最终走
 * `EntryTree.write()`，而 `Include.write()` 会把**整棵合成树**（bundles + 所有 patch 层）
 * dump 回 patch 文件——用户手写的注释、`!!js` 表达式、分组结构全部丢失。
 * 所以这里只做最小文本手术：只改必要的字符，其余字节原样保留。
 *
 * 生效路径靠官方 HMR：`watchUserPatches` 监视本文件，改动后事务性重组 patch 层，
 * 无需重启（profile 的 `patchReload` 默认 `live`）。
 */
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isMap, isSeq, parseDocument } from 'yaml'

/** DSH patch 允许 `!!js` 表达式；不声明该标签解析会报 unresolved tag。 */
const JS_TAG = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value: string): string => value,
  stringify: (value: unknown): string => String(value),
}

/** 插件自己写入的开关条目上方必有的标记注释（连同其下两行一起删除即恢复原状）。 */
export const TOGGLE_MARKER = '# [dsh-experience-plugin] MCP 开关'

/** profile 的用户 patch 层文件名。 */
const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'

/** loader 条目 id 在 patch 文件里的对应写法（`include:mcp-github` → `mcp-github`）。 */
export function patchIdOf(entryId: string): string {
  return entryId.slice(entryId.lastIndexOf(':') + 1)
}

/**
 * 定位 profile 的用户 patch 层。
 *
 * 两条路按优先级尝试：
 *   1. 运行时的配置基址 `ctx.baseUrl`——DSH boot 时把它设为配置文件的所在目录
 *      （profile 根），与插件自身装在哪无关，所以 `link:` 安装也成立；
 *   2. 从 `pluginUrl` 上溯三层——插件位于 `<profile>/node_modules/dsh-experience-plugin/lib/`
 *      时的传统布局，作为兜底（老版本运行时没有 baseUrl）。
 *
 * 只认第一处存在的文件：两个候选同名同义，取先命中的即可，不做内容比对。
 * @param pluginUrl - host 半区的 `import.meta.url`。
 * @param baseUrl - `ctx.baseUrl`（配置目录），可选。
 * @returns patch 文件的绝对路径，或 null。
 */
export function resolveProfilePatchFile(pluginUrl: string, baseUrl?: string): string | null {
  const candidates: string[] = []
  if (baseUrl !== undefined) {
    try {
      candidates.push(fileURLToPath(new URL(PROFILE_PATCH_FILENAME, baseUrl)))
    } catch {
      // baseUrl 不是合法 URL 时跳过，继续走回溯兜底。
    }
  }
  candidates.push(fileURLToPath(new URL(`../../../${PROFILE_PATCH_FILENAME}`, pluginUrl)))
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

/** 读取 patch 文件全文（UTF-8）。 */
export function readPatchText(file: string): string {
  return readFileSync(file, 'utf8')
}

/** 解析 patch 文件，返回文档；解析失败直接抛错，绝不带着坏文档往下写。 */
function parsePatchDoc(text: string) {
  const doc = parseDocument(text, { customTags: [JS_TAG] })
  if (doc.errors.length > 0) throw new Error(`patch file parse failed: ${doc.errors[0].message}`)
  return doc
}

/** 取节点在原文中的字符区间。 */
function nodeRange(node: unknown): [number, number] | null {
  const range = (node as { range?: [number, number, number] } | null)?.range
  return range === undefined ? null : [range[0], range[1]]
}

/** 含 `pos` 的那一行（或 `pos` 落在换行符上时，该换行符所在行）的起始偏移。 */
function lineStartOf(text: string, pos: number): number {
  const at = text.lastIndexOf('\n', pos)
  return at === -1 ? 0 : at + 1
}

/** 从 `pos` 起该行的结束偏移（不含换行符）。 */
function lineEndOf(text: string, pos: number): number {
  const at = text.indexOf('\n', pos)
  return at === -1 ? text.length : at
}

/**
 * 取「节点最后一行」的行尾。
 *
 * 关键：yaml 的 `range[1]` 会落在**下一行的前导缩进里**（实测 `mcp-github` 的
 * range[1]=669 正是下一行 `    - id: mcp-dbhub` 的第 2 个空格）。直接拿它去
 * `lineEndOf` 会把下一个条目的整行一起吃掉，所以必须先回退到最后一个非空白字符。
 * @param text - 原文。
 * @param end - 节点的 range[1]。
 * @returns 节点内容最后一行的行尾偏移。
 */
function contentEndOf(text: string, end: number): number {
  let at = end
  while (at > 0 && /\s/.test(text[at - 1] as string)) at -= 1
  return lineEndOf(text, at)
}

/** 转义正则元字符，用于把 id / 标记注释拼进正则。 */
const escapeRe = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 顶层条目列表；空文件（只有注释）视为空数组，而不是错误。 */
function topItems(doc: ReturnType<typeof parsePatchDoc>): unknown[] {
  if (doc.contents === null) return []
  if (!isSeq(doc.contents)) throw new Error('patch file must be a top-level YAML array')
  return doc.contents.items as unknown[]
}

/** 顶层 patch 条目（形如 `- id: X` 且不是 `insert` 容器）的定位结果。 */
interface IdPatch {
  node: unknown
  start: number
  end: number
}

/** 在顶层找一条针对 `id` 的 patch 条目（`{id: X, ...}`，排除 `insert` 容器）。 */
function findIdPatch(doc: ReturnType<typeof parsePatchDoc>, id: string): IdPatch | null {
  for (const item of topItems(doc)) {
    if (!isMap(item)) continue
    if (item.get('insert') !== undefined) continue
    if (String(item.get('id') ?? '') !== id) continue
    const range = nodeRange(item)
    if (range === null) continue
    return { node: item, start: range[0], end: range[1] }
  }
  return null
}

/** 在顶层 `insert` 列表里找 id 为 `id` 的条目定义。 */
function findInsertedEntry(doc: ReturnType<typeof parsePatchDoc>, id: string): { parent: unknown; node: unknown; parentRange: [number, number]; only: boolean } | null {
  for (const item of topItems(doc)) {
    if (!isMap(item)) continue
    const insert = item.get('insert', true)
    if (!isSeq(insert)) continue
    for (const child of insert.items) {
      if (!isMap(child)) continue
      if (String(child.get('id') ?? '') !== id) continue
      const parentRange = nodeRange(item)
      if (parentRange === null) continue
      return { parent: item, node: child, parentRange, only: insert.items.length === 1 }
    }
  }
  return null
}

/** 这个 id 是否由用户 patch 文件定义（`insert` 列表里存在），决定能否「卸载」。 */
export function patchFileDefinesEntry(text: string, patchId: string): boolean {
  return findInsertedEntry(parsePatchDoc(text), patchId) !== null
}

/** 插件自己写的开关条目文本（标记注释 + 两行）。 */
function toggleBlock(id: string, disabled: boolean): string {
  return `${TOGGLE_MARKER}\n- id: ${id}\n  disabled: ${disabled ? 'true' : 'false'}\n`
}

/** 追加插件自己的开关条目（始终在文件末尾，保证 patch 顺序在 insert 之后生效）。 */
function appendToggle(text: string, id: string, disabled: boolean): string {
  const block = toggleBlock(id, disabled)
  return text === '' ? block : `${text.endsWith('\n') ? `${text}\n` : `${text}\n\n`}${block}`
}

/** 摘掉插件自己写的开关条目（连同其前导换行），返回新文本。 */
function stripToggle(text: string, id: string): string {
  const re = new RegExp(`(?:\\n)?${escapeRe(TOGGLE_MARKER)}\\n- id: ${escapeRe(id)}\\n  disabled: (?:true|false)\\n`, 'g')
  return text.replace(re, '')
}

/**
 * 关/开一个已安装条目。
 *
 * 优先级：插件自己的开关条目（开启时直接摘掉，保持文件干净）→ 用户已有的
 * `{id, disabled}` patch（就地翻转值）→ 追加插件自己的开关条目。
 * @param text - patch 文件原文。
 * @param id - patch 文件里的条目 id。
 * @param enabled - 目标状态。
 * @returns 新文本（可能与原文相同）。
 */
export function applyPatchToggle(text: string, id: string, enabled: boolean): string {
  if (enabled) {
    const stripped = stripToggle(text, id)
    if (stripped !== text) return stripped
  }
  const doc = parsePatchDoc(text)
  const patch = findIdPatch(doc, id)
  if (patch !== null) {
    const disabledNode = (patch.node as { get(key: string, keepScalar: true): unknown }).get('disabled', true)
    const range = nodeRange(disabledNode)
    if (range !== null) return `${text.slice(0, range[0])}${enabled ? 'false' : 'true'}${text.slice(range[1])}`
    const at = lineEndOf(text, patch.end)
    return `${text.slice(0, at)}\n  disabled: ${enabled ? 'false' : 'true'}${text.slice(at)}`
  }
  return appendToggle(text, id, !enabled)
}

/**
 * 扩展删除区间：只吞掉**插件自己写的**标记注释与其上方空行。
 *
 * 刻意不吞用户注释——删掉 insert 列表最后一项时会连 `- insert:` 一起删，
 * 而它上方往往是用户的分节注释（`# ── MCP servers …`），那条注释描述的是
 * 用户的文件结构，不该被插件的操作牵连。
 * @param text - 原文。
 * @param from - 区间起（行首）。
 * @param to - 区间止（行尾，不含换行）。
 * @returns 实际应删除的区间。
 */
function removalSpan(text: string, from: number, to: number): [number, number] {
  let start = from
  const prevNewline = from - 1
  if (prevNewline >= 0) {
    const prevStart = lineStartOf(text, prevNewline)
    if (text.slice(prevStart, prevNewline).trim() === TOGGLE_MARKER) {
      start = prevStart
      const beforeNewline = prevStart - 1
      if (beforeNewline >= 0) {
        const beforeStart = lineStartOf(text, beforeNewline)
        if (text.slice(beforeStart, beforeNewline).trim() === '') start = beforeStart
      }
    }
  }
  let end = to
  if (text[end] === '\n') end += 1
  return [start, end]
}

/**
 * 从用户 patch 文件里卸载一个条目定义。
 *
 * 只处理顶层 `insert` 列表（用户 patch 层定义条目的唯一形式）；若该条目是
 * insert 列表里的最后一项，连 `insert` 容器一起删掉，避免留下 `insert: null`
 * 让 `applyEntryPatches` 走进 `id is required` 警告分支。
 * @param text - patch 文件原文。
 * @param id - patch 文件里的条目 id。
 * @returns 新文本与是否真的删掉了定义。
 */
export function applyPatchRemoval(text: string, id: string): { text: string; removed: boolean } {
  const doc = parsePatchDoc(text)
  const found = findInsertedEntry(doc, id)
  if (found === null) {
    const stripped = stripToggle(text, id)
    return { text: stripped, removed: false }
  }
  const target = found.only ? found.parentRange : (nodeRange(found.node) as [number, number])
  const from = lineStartOf(text, target[0])
  const [start, end] = removalSpan(text, from, contentEndOf(text, target[1]))
  const without = stripToggle(`${text.slice(0, start)}${text.slice(end)}`, id)
  return { text: without, removed: true }
}

/** 备份后原子写入（tmp + rename），保持 LF 与无 BOM。 */
export function writePatchText(file: string, text: string): void {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
  copyFileSync(file, `${file}.bak-mcp-${stamp}`)
  const tmp = `${file}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
}
