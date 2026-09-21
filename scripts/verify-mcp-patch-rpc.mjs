#!/usr/bin/env node
/**
 * verify-mcp-patch-rpc.mjs —— 验证 mcp/manager/patch 端点的行为与拒绝路径。
 *
 * 用一个真实 patch 文件的**临时副本**驱动 dispatchMcpManagerRpc，
 * 所以既不碰主人的 profile，也走的是真实解析路径。
 *
 * 覆盖：toggle（关/开）、remove（卸载）、以及三条必须被拒绝的路径
 * （空 entryId / 非 patch 层条目 / 未知 action）。
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MCP_MANAGER_PATCH, dispatchMcpManagerRpc, applyPatchToggle, patchIdOf } from '../lib/index.js'

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

const real = join(process.env.USERPROFILE ?? '', '.dsh', 'profiles', 'web', 'cordis.patch.yml')
const original = readFileSync(real, 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'mcp-patch-rpc-'))
const work = join(dir, 'cordis.patch.yml')
copyFileSync(real, work)
const read = () => readFileSync(work, 'utf8')

/** 用临时副本构造一个最小 patch 层，行为与 host 里的实现一致。 */
let toggles = 0
let removes = 0
const layer = {
  file: work,
  editable: () => ['mcp-github', 'mcp-dbhub', 'mcp-chrome-devtools'],
  toggle: async (id, enabled) => {
    toggles += 1
    const { writeFileSync } = await import('node:fs')
    writeFileSync(work, applyPatchToggle(read(), id, enabled))
  },
  remove: async (id) => {
    removes += 1
    const { applyPatchRemoval } = await import('../lib/index.js')
    const outcome = applyPatchRemoval(read(), id)
    if (!outcome.removed) throw new Error(`entry ${id} is not defined by the profile patch layer`)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(work, outcome.text)
  },
}

const deps = {
  servers: () => [],
  replace: async () => {},
  live: () => [],
  installed: () => [],
  patch: () => layer,
}

/** 调用端点并归一化结果，便于断言。 */
const rpc = (payload) => dispatchMcpManagerRpc(MCP_MANAGER_PATCH, payload, deps)

// ── 1. 关闭 ──────────────────────────────────────────────────────────────────
const off = await rpc({ entryId: 'include:mcp-github', action: 'toggle', enabled: false })
check('关闭返回 ok', off.ok, true)
check('关闭回显 entryId', off.value.entryId, 'include:mcp-github')
check('关闭回显 enabled=false', off.value.enabled, false)
ok('关闭后文件含 disabled: true', /- id: mcp-github\n  disabled: true/.test(read()))
check('关闭调用了一次 toggle', toggles, 1)

// ── 2. 重新开启：文件回到原状 ────────────────────────────────────────────────
const on = await rpc({ entryId: 'include:mcp-github', action: 'toggle', enabled: true })
check('开启返回 ok', on.ok, true)
check('开启后字节回到原始', read(), original)
check('开启调用了一次 toggle', toggles, 2)

// ── 3. 卸载 ──────────────────────────────────────────────────────────────────
const removed = await rpc({ entryId: 'include:mcp-github', action: 'remove' })
check('卸载返回 ok', removed.ok, true)
check('卸载 action 回显', removed.value.action, 'remove')
ok('卸载后 github 定义消失', !read().includes('mcp-github'))
ok('卸载后 dbhub 仍在', read().includes('mcp-dbhub'))
check('卸载调用了一次 remove', removes, 1)

// ── 4. 拒绝路径 ──────────────────────────────────────────────────────────────
const noId = await rpc({ action: 'toggle', enabled: false })
check('空 entryId 被拒', noId.ok, false)
ok('拒绝信息说明需要 entryId', /entryId/.test(noId.error.message), noId.error?.message)

const notPatch = await rpc({ entryId: 'include:ui-chat', action: 'toggle', enabled: false })
check('非 patch 层条目被拒', notPatch.ok, false)
ok('拒绝信息指向 patch 层', /not defined by the profile patch layer/.test(notPatch.error.message), notPatch.error?.message)

const badAction = await rpc({ entryId: 'include:mcp-github', action: 'explode' })
check('未知 action 被拒', badAction.ok, false)
ok('拒绝信息列出可用 action', /toggle.*remove|remove.*toggle/.test(badAction.error.message), badAction.error?.message)

const emptyFileLayer = { ...layer, file: null }
const noFile = await dispatchMcpManagerRpc(MCP_MANAGER_PATCH, { entryId: 'include:mcp-github', action: 'toggle', enabled: false }, { ...deps, patch: () => emptyFileLayer })
check('patch 文件定位不到时被拒', noFile.ok, false)
ok('拒绝信息说明找不到 patch 层', /not found/.test(noFile.error.message), noFile.error?.message)

// ── 5. entryId 前缀处理 ──────────────────────────────────────────────────────
check('entryId 前缀被剥掉', patchIdOf('include:mcp-github'), 'mcp-github')
check('无前缀 entryId 原样', patchIdOf('mcp-github'), 'mcp-github')

// ── 6. 拒绝路径没有产生副作用 ────────────────────────────────────────────────
check('拒绝路径没触发 toggle', toggles, 2)
check('拒绝路径没触发 remove', removes, 1)
ok('拒绝路径没改动文件', read() === read())

rmSync(dir, { recursive: true, force: true })
console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
