#!/usr/bin/env node
/**
 * verify-mcp-runtime —— 用假 ctx / 假服务验证「接官方 mcp-manager」这一层。
 *
 * 覆盖：
 *   1. normalizeRuntimeStatus：官方 6 种连接状态 + 管理器自有 disabled / failed 的压平；
 *   2. collectRuntimeStatuses：服务在 / 不在（DSH < 0.2.2）两种情形；
 *   3. mergeRuntimeServers：补齐「配置了但起不来」的服务器，已存在的不重复；
 *   4. restart / probe 两个新端点：正常、未归官方管、服务缺席三种分支；
 *   5. normalizeProbe：成功 / 失败 / 截断标记。
 * 只读：不碰真实 profile、不写任何文件。
 */
import {
  MCP_MANAGER_PROBE,
  MCP_MANAGER_RESTART,
  MCP_MANAGER_LIST,
  collectRuntimeStatuses,
  dispatchMcpManagerRpc,
  mergeRuntimeServers,
  normalizeProbe,
  normalizeRuntimeStatus,
} from '../lib/index.js'

/** 断言并累计失败数。 */
let failed = 0
function check(label, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  if (!ok) failed += 1
  console.log(`${ok ? '✔' : '✘'} ${label}${ok ? '' : `\n    期望 ${e}\n    实际 ${a}`}`)
}

// ── 1. 官方连接状态压平 ──────────────────────────────────────────────────────
check('connected', normalizeRuntimeStatus({ state: 'connected', toolCount: 7, connectedAt: 1700000000000 }), {
  state: 'connected', configured: false, toolCount: 7,
})
check('connecting', normalizeRuntimeStatus({ state: 'connecting', attempt: 0 }), {
  state: 'connecting', configured: false, attempt: 0,
})
check('reconnecting', normalizeRuntimeStatus({ state: 'reconnecting', attempt: 2, maxAttempts: 5, nextRetryAtMs: 1700000009000, lastError: 'ECONNREFUSED' }), {
  state: 'reconnecting', configured: false, attempt: 2, maxAttempts: 5, nextRetryAtMs: 1700000009000, lastError: 'ECONNREFUSED',
})
check('failed(gave-up)', normalizeRuntimeStatus({ state: 'failed', reason: 'gave-up', lastError: 'timeout' }), {
  state: 'failed', configured: false, lastError: 'timeout', reason: 'gave-up',
})
check('waiting-credentials', normalizeRuntimeStatus({ state: 'waiting-credentials', lastError: 'no token' }), {
  state: 'waiting-credentials', configured: false, lastError: 'no token',
})
check('disabled（管理器自有）', normalizeRuntimeStatus({ state: 'disabled' }), { state: 'disabled', configured: false })
check('failed(cleanup) 的诊断从 result 里取', normalizeRuntimeStatus({ state: 'failed', reason: 'cleanup', result: { closeConfirmed: false, cleanupError: 'pipe busy' } }), {
  state: 'failed', configured: false, reason: 'cleanup', lastError: 'pipe busy',
})
check('未知/脏值不炸', normalizeRuntimeStatus(null), { state: 'unknown', configured: false })

// ── 2. collectRuntimeStatuses：服务在 / 不在 ─────────────────────────────────
const runtimeCtx = {
  get(name) {
    if (name !== 'mcpManager') return undefined
    return {
      list: () => [
        { name: 'github', configured: true, status: { state: 'connected', toolCount: 12 } },
        { name: 'dead', configured: true, status: { state: 'failed', reason: 'load', lastError: 'spawn nope ENOENT' } },
        { name: 'ghost', configured: false, status: { state: 'closed', result: { closeConfirmed: true } } },
        { name: '', configured: true, status: { state: 'connected', toolCount: 1 } },
      ],
      restart: async () => undefined,
      probe: async () => undefined,
    }
  },
}
const statuses = collectRuntimeStatuses(runtimeCtx)
check('状态表键（空名被丢）', Object.keys(statuses).sort(), ['dead', 'ghost', 'github'])
check('connected 带工具数', statuses.github, { state: 'connected', configured: true, toolCount: 12 })
check('failed 带原因与诊断', statuses.dead, { state: 'failed', configured: true, lastError: 'spawn nope ENOENT', reason: 'load' })
check('configured 透传', statuses.ghost.configured, false)
check('老版本（无 mcpManager）', collectRuntimeStatuses({ get: () => undefined }), {})

// ── 3. mergeRuntimeServers：补齐只有官方知道的服务器 ────────────────────────
const installed = [
  { name: 'github', entryId: 'mcp-github', transport: 'stdio', summary: 'gh', enabled: true, tools: ['mcp__github__x'], editable: true },
]
const merged = mergeRuntimeServers(installed, statuses)
check('补齐后的名单', merged.map((s) => s.name), ['dead', 'github'])
check('原本已存在的条目原样保留', merged.find((s) => s.name === 'github').entryId, 'mcp-github')
check('补出来的条目不可编辑', merged.find((s) => s.name === 'dead').editable, false)
check('补出来的条目无 loader 信息', [merged.find((s) => s.name === 'dead').entryId, merged.find((s) => s.name === 'dead').transport], ['', ''])
check('只剩清理残留的不补（configured=false）', merged.some((s) => s.name === 'ghost'), false)
check('无状态表时不改动原清单', mergeRuntimeServers(installed, {}).map((s) => s.name), ['github'])

// ── 4. restart / probe 端点 ─────────────────────────────────────────────────
/** 组装一套 deps（runtime 可缺省，模拟老版本）。 */
function deps(runtime) {
  const calls = []
  const value = {
    servers: () => [],
    replace: async () => undefined,
    live: () => ['github'],
    installed: () => [],
    patch: () => ({ file: null, editable: () => [], toggle: async () => undefined, remove: async () => undefined }),
    calls,
  }
  if (runtime !== undefined) value.runtime = () => runtime
  return value
}

const probeService = {
  list: () => [{ name: 'github', configured: true, status: { state: 'connected', toolCount: 2 } }],
  restart: async (name) => { restartCalls.push(name) },
  probe: async (name) => ({ name, ...PROBE_RESULT }),
}
const restartCalls = []
const PROBE_RESULT = { ok: true, toolNames: ['a', 'b'], truncated: false, durationMs: 321, serverInfo: { name: 'gh', version: '1.0.0' }, closeConfirmed: true }

const restartOk = await dispatchMcpManagerRpc(MCP_MANAGER_RESTART, { name: 'github' }, deps(probeService))
check('restart 成功', restartOk, { ok: true, value: { name: 'github' } })
check('restart 真的调到了服务', restartCalls, ['github'])

const probeOk = await dispatchMcpManagerRpc(MCP_MANAGER_PROBE, { name: 'github' }, deps(probeService))
check('probe 返回压平结构', probeOk.value, {
  name: 'github', ok: true, durationMs: 321, truncated: false, closeConfirmed: true,
  toolNames: ['a', 'b'], serverInfo: { name: 'gh', version: '1.0.0' },
})

const notManaged = await dispatchMcpManagerRpc(MCP_MANAGER_RESTART, { name: 'patchonly' }, deps(probeService))
check('未归官方管的服务器给明确错误', notManaged.ok, false)
check('错误文本提示改用 profile 开关', notManaged.error.message.includes('not managed by the DSH MCP manager'), true)

const noService = await dispatchMcpManagerRpc(MCP_MANAGER_PROBE, { name: 'github' }, deps(undefined))
check('老版本没有该服务时明确报错', noService.ok, false)
check('老版本错误文本提到 0.2.2', noService.error.message.includes('0.2.2'), true)

const badName = await dispatchMcpManagerRpc(MCP_MANAGER_RESTART, { name: 'bad name!' }, deps(probeService))
check('非法名称被拒', badName.ok, false)

// list：老版本无 runtime 时给空表，客户端按旧逻辑渲染。
const listOld = await dispatchMcpManagerRpc(MCP_MANAGER_LIST, {}, deps(undefined))
check('老版本 list.runtime 为空表', listOld.value.runtime, {})
const listNew = await dispatchMcpManagerRpc(MCP_MANAGER_LIST, {}, deps(probeService))
check('新版本 list.runtime 带状态', listNew.value.runtime.github, { state: 'connected', configured: true, toolCount: 2 })

// ── 5. normalizeProbe ───────────────────────────────────────────────────────
check('probe 失败', normalizeProbe('x', { ok: false, stage: 'connect', message: 'ECONNREFUSED', durationMs: 12, closeConfirmed: true }), {
  name: 'x', ok: false, stage: 'connect', message: 'ECONNREFUSED', durationMs: 12, closeConfirmed: true,
})
check('probe 截断标记', normalizeProbe('x', { ok: true, toolNames: ['a'], truncated: true, durationMs: 5 }).truncated, true)
check('probe 脏值不炸', normalizeProbe('x', undefined), { name: 'x', ok: false })

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
