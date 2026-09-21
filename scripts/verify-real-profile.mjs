#!/usr/bin/env node
/**
 * verify-real-profile.mjs —— 用「主人真实的 profile 配置」端到端验证修复。
 *
 * 与 verify-mcp-installed.mjs（假数据单测）互补：这里读取真实的
 *   ~/.dsh/profiles/web/cordis.patch.yml
 * 把其中的 mcp-client 条目解析成 loader 形状，再喂给 collectInstalledMcpServers，
 * 确认修复在真实配置上能认出已安装的 MCP 服务器。
 *
 * 只读：不写任何文件、不启动子进程。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { parse } from 'yaml'
import { collectInstalledMcpServers, mcpServerOfToolName, patchIdOf } from '../lib/index.js'

const profileDir = process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'web')
const patchPath = join(profileDir, 'cordis.patch.yml')
const raw = readFileSync(patchPath, 'utf8')
const patch = parse(raw)

let failed = 0
function check(label, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  if (!ok) failed += 1
  console.log(`${ok ? '✔' : '✘'} ${label}${ok ? '' : `\n    期望 ${e}\n    实际 ${a}`}`)
}

// ── 从真实 patch 里抽出 mcp-client 条目，转成 loader 条目形状 ──────────────────
const MCP_MODULE = '@deepseek-ai/dsh-mcp-client'
const entries = []
for (const row of patch) {
  for (const item of row?.insert ?? []) {
    if (item?.name !== MCP_MODULE) continue
    entries.push({ id: item.id, disabled: item.disabled === true, options: { name: item.name, config: item.config } })
  }
}
console.log(`从 ${patchPath} 读到 ${entries.length} 个 mcp-client 条目`)
for (const e of entries) console.log(`  · ${e.id} -> serverName=${e.options.config?.serverName}`)

// ── 构造真实形状的假 ctx（loader 条目真实，工具面用三个服务器各一个工具模拟）──
const serverNames = entries.map((e) => e.options.config?.serverName).filter(Boolean)
const fakeCtx = {
  get(name) {
    if (name === 'loader') return { entries: () => entries }
    if (name === 'tools') {
      return { schemas: () => serverNames.map((n) => ({ name: `mcp__${n}__probe_tool` })) }
    }
    return undefined
  },
}

const installed = collectInstalledMcpServers(fakeCtx)
check('已安装服务器 = patch 里的 serverName', installed.map((s) => s.name), [...serverNames].sort())
check('每个都归属到工具', installed.every((s) => s.tools.length === 1), true)
check('entryId 保留（可回溯到 patch 行）', installed.map((s) => s.entryId).sort(), entries.map((e) => e.id).sort())

// ── 工具名最长前缀匹配（真实 serverName 含连字符，确认不被切错）───────────────
if (serverNames.includes('chrome-devtools')) {
  check('chrome-devtools 工具名解析', mcpServerOfToolName('mcp__chrome-devtools__click', new Set(serverNames)), 'chrome-devtools')
}

// ── 真实 patch 文件里的条目必须全部标记为可编辑（关 / 卸载按钮的前提）─────────
const editableIds = new Set(entries.map((e) => patchIdOf(e.id)))
const withEdit = collectInstalledMcpServers(fakeCtx, new Set(), editableIds)
check('真实条目全部可编辑', withEdit.map((s) => [s.name, s.editable]), [...serverNames].sort().map((n) => [n, true]))

// ── 每个真实条目都能被编辑器定位并切出定义（不写文件，只在内存里试算）────────
const { applyPatchToggle, applyPatchRemoval, patchFileDefinesEntry } = await import('../lib/index.js')
for (const entry of entries) {
  const id = patchIdOf(entry.id)
  check(`${id} 定义可被定位`, patchFileDefinesEntry(raw, id), true)

  const closed = applyPatchToggle(raw, id, false)
  check(`${id} 关闭是纯追加`, closed.startsWith(raw), true)
  check(`${id} 关 → 开 幂等`, applyPatchToggle(closed, id, true), raw)

  const cut = applyPatchRemoval(raw, id)
  check(`${id} 卸载报告 removed`, cut.removed, true)
  check(`${id} 卸载后自身定义消失`, patchFileDefinesEntry(cut.text, id), false)
  const others = entries.filter((e) => e.id !== entry.id).map((e) => patchIdOf(e.id))
  check(`${id} 卸载不牵连其他条目`, others.every((o) => patchFileDefinesEntry(cut.text, o)), true)
  // 卸载后必须仍是合法 YAML（结构没被切坏）
  const reparsed = parse(cut.text)
  check(`${id} 卸载后仍是合法 YAML 数组`, Array.isArray(reparsed), true)
}

// ── 真实文件里非 MCP 的顶层条目一条都不能被误改 ─────────────────────────────
const topIds = patch.filter((r) => r?.id !== undefined).map((r) => r.id)
check('顶层 id 条目数量（主人的已卸载插件列表）', topIds.length > 0, true)
for (const entry of entries) {
  const cut = applyPatchRemoval(raw, patchIdOf(entry.id))
  const keptTop = topIds.filter((t) => cut.text.includes(`- id: ${t}`))
  check(`${entry.id} 卸载后 ${topIds.length} 条顶层 id 条目全在`, keptTop.length, topIds.length)
}

console.log(failed === 0 ? '\n真实配置验证通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
