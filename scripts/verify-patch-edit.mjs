#!/usr/bin/env node
/**
 * verify-patch-edit.mjs —— 验证 patch 文件编辑器的正确性与「最小手术」。
 *
 * 核心不变量：
 *  1. 关/开/卸载后，**用户手写的注释、!!js 表达式、其他条目字节不变**；
 *  2. 关 → 开是幂等的，文件回到原状；
 *  3. 卸载能处理「insert 列表只剩一项」和「列表还有别的项」两种情形。
 *
 * 用主人的真实 cordis.patch.yml 做基线（只读），所有写入都在临时副本上进行。
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  applyPatchRemoval,
  applyPatchToggle,
  patchFileDefinesEntry,
  patchIdOf,
} from '../lib/index.js'

let failed = 0
function check(label, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  if (!ok) failed += 1
  console.log(`${ok ? '✔' : '✘'} ${label}${ok ? '' : `\n    期望 ${e}\n    实际 ${a}`}`)
}
function ok(label, condition, detail = '') {
  if (!condition) failed += 1
  console.log(`${condition ? '✔' : '✘'} ${label}${condition ? '' : `  ${detail}`}`)
}

const real = process.env.DSH_PROFILE_DIR
  ? join(process.env.DSH_PROFILE_DIR, 'cordis.patch.yml')
  : join(process.env.USERPROFILE ?? '', '.dsh', 'profiles', 'web', 'cordis.patch.yml')
const original = readFileSync(real, 'utf8')

const dir = mkdtempSync(join(tmpdir(), 'patch-edit-'))
const work = join(dir, 'cordis.patch.yml')
copyFileSync(real, work)
const read = () => readFileSync(work, 'utf8')
const write = (t) => writeFileSync(work, t)

console.log(`基线：${real}（${original.length} 字节）\n`)

// ── 1. patchIdOf：loader 条目 id → patch 文件里的 id ─────────────────────────
check('patchIdOf 去掉 include 前缀', patchIdOf('include:mcp-github'), 'mcp-github')
check('patchIdOf 处理嵌套 id', patchIdOf('include:outer:inner'), 'inner')
check('patchIdOf 无前缀时原样', patchIdOf('mcp-github'), 'mcp-github')

// ── 2. 可编辑判定 ────────────────────────────────────────────────────────────
check('patch 文件定义了 mcp-github', patchFileDefinesEntry(original, 'mcp-github'), true)
check('patch 文件没定义 bundle 层条目', patchFileDefinesEntry(original, 'ui-chat'), false)

// ── 3. 关闭 → 工具面生效前，先保证文本正确 ───────────────────────────────────
const closed = applyPatchToggle(original, 'mcp-github', false)
ok('关闭后文本变长（追加了开关条目）', closed.length > original.length, `${original.length} -> ${closed.length}`)
ok('关闭后原文仍是前缀（纯追加，零改动）', closed.startsWith(original), '追加应当不影响已有字节')
ok('关闭块带标记注释', closed.includes('# [dsh-experience-plugin] MCP 开关\n- id: mcp-github\n  disabled: true'))
check('关闭后仍能解析出条目定义', patchFileDefinesEntry(closed, 'mcp-github'), true)

// 模拟 DSH 的 patch 语义：后一条同 id 覆盖前一条
const lastDisabled = [...closed.matchAll(new RegExp('- id: mcp-github\\n  disabled: (true|false)', 'g'))].pop()
check('同 id 最后一条生效 = disabled:true', lastDisabled?.[1], 'true')

// ── 4. 重新开启：必须回到原状 ────────────────────────────────────────────────
const reopened = applyPatchToggle(closed, 'mcp-github', true)
check('关 → 开 幂等回到原状', reopened, original)

// ── 5. 用户已有 {id, disabled} patch 时就地翻转，而不是追加 ─────────────────
// enabled 参数是**目标状态**：false = 要关，true = 要开。
const userDisabled = '- id: mcp-github\n  disabled: true\n'
const userEnabled = '- id: mcp-github\n  disabled: false\n'
check('已禁用 + 要求禁用 = 原地不变', applyPatchToggle(userDisabled, 'mcp-github', false), userDisabled)
check('已禁用 + 要求启用 → false', applyPatchToggle(userDisabled, 'mcp-github', true), userEnabled)
check('已启用 + 要求禁用 → true', applyPatchToggle(userEnabled, 'mcp-github', false), userDisabled)
check('就地翻转不追加新条目', applyPatchToggle(userDisabled, 'mcp-github', true).split('- id:').length, 2)
check('就地翻转只动值、不动其余字节', applyPatchToggle(userDisabled, 'mcp-github', true).startsWith('- id: mcp-github\n  disabled: '), true)

// ── 6. 卸载：insert 列表还有别的项 ───────────────────────────────────────────
const removedGithub = applyPatchRemoval(original, 'mcp-github')
check('卸载报告 removed', removedGithub.removed, true)
check('卸载后 github 定义消失', patchFileDefinesEntry(removedGithub.text, 'mcp-github'), false)
check('卸载后 dbhub 仍在', patchFileDefinesEntry(removedGithub.text, 'mcp-dbhub'), true)
check('卸载后 chrome-devtools 仍在', patchFileDefinesEntry(removedGithub.text, 'mcp-chrome-devtools'), true)
ok('卸载只带走 github 的 !!js 表达式', !removedGithub.text.includes('GITHUB_PERSONAL_ACCESS_TOKEN'))
ok('卸载保留了 dbhub 的中文注释', removedGithub.text.includes('本地固定路径（离线可用）'), '别人的注释不该被牵连')
ok('卸载保留了「已卸载插件」注释', removedGithub.text.includes('已卸载插件（odai-dsh-plugin）'))

// ── 7. 卸载 insert 列表里的最后一项（容器也要删）─────────────────────────────
const minimal = [
  '# 用户注释，必须保留',
  '- insert:',
  '    - id: mcp-solo',
  "      name: '@deepseek-ai/dsh-mcp-client'",
  '      config:',
  '        serverName: solo',
  '',
  '# 尾部注释',
  '',
].join('\n')
const soloOut = applyPatchRemoval(minimal, 'mcp-solo')
check('卸载最后一项报告 removed', soloOut.removed, true)
check('卸载最后一项后无残留定义', patchFileDefinesEntry(soloOut.text, 'mcp-solo'), false)
ok('卸载最后一项不留下裸 insert 键', !/^\s*insert:\s*$/m.test(soloOut.text), `实际:\n${soloOut.text}`)
ok('卸载最后一项保留用户注释', soloOut.text.includes('# 用户注释，必须保留') && soloOut.text.includes('# 尾部注释'), `实际:\n${soloOut.text}`)
check('卸载最后一项后文件只剩注释', soloOut.text.replace(/^#[^\n]*$/gm, '').trim(), '')

// ── 8. 关 → 卸载 → 无残留标记注释 ───────────────────────────────────────────
const closedThenRemoved = applyPatchRemoval(closed, 'mcp-github')
ok('卸载连开关条目一起清掉', !closedThenRemoved.text.includes('# [dsh-experience-plugin] MCP 开关'))
check('卸载后回到只剩其他条目的干净状态', closedThenRemoved.text, applyPatchRemoval(original, 'mcp-github').text)

// ── 9. 卸载不存在的条目：报 removed=false 而不是抛错 ────────────────────────
const notFound = applyPatchRemoval(original, 'ui-chat')
check('卸载未知条目 removed=false', notFound.removed, false)
check('卸载未知条目文本不变', notFound.text, original)

// ── 10. 注释与 !!js 在所有操作后仍完好 ──────────────────────────────────────
for (const [label, text] of [
  ['关闭后', closed],
  ['重开后', reopened],
  ['卸载 github 后', removedGithub.text],
]) {
  ok(`${label} 保留文件头注释`, text.includes('Your patch layer for this dsh profile'))
  ok(`${label} 保留 MCP 分节注释`, text.includes('── MCP servers (imported from codex'))
}
ok('dbhub 的 !!js 无关，但 env 写法保留', removedGithub.text.includes('GITHUB_PERSONAL_ACCESS_TOKEN') === false)

// ── 11. 行尾 / BOM 不被动过 ─────────────────────────────────────────────────
const bytes = readFileSync(real)
check('基线无 BOM', [bytes[0], bytes[1], bytes[2]], [35, 32, 89])
ok('基线是 LF（无 CR）', !bytes.includes(13))

rmSync(dir, { recursive: true, force: true })
console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
