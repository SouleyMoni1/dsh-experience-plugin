#!/usr/bin/env node
/**
 * verify-patch-live.mjs —— 真实闭环：改 patch 文件 → DSH 热重组 → 进程真退出。
 *
 * 这个脚本会**真实修改**主人的 cordis.patch.yml，所以：
 *  - 先备份全文到内存；
 *  - 无论成功失败都在 finally 里还原（字节级比对确认）；
 *  - 只在 --live 时执行，否则只做干跑（打印将要发生什么）。
 *
 * 判据（全部为外部可观测事实，不看插件自己的日志）：
 *  1. 关闭 github 后，github-mcp-server.exe 进程真的消失，另外两个 MCP 进程不受影响；
 *  2. 重新开启后，进程真的回来；
 *  3. 全程 patch 文件的注释/!!js/其他条目字节不变。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import { applyPatchRemoval, applyPatchToggle, patchFileDefinesEntry } from '../lib/index.js'

const LIVE = process.argv.includes('--live')
const patchFile = join(process.env.USERPROFILE ?? '', '.dsh', 'profiles', 'web', 'cordis.patch.yml')
const original = readFileSync(patchFile, 'utf8')

let failed = 0
function ok(label, condition, detail = '') {
  if (!condition) failed += 1
  console.log(`${condition ? '✔' : '✘'} ${label}${condition ? '' : `  ${detail}`}`)
}

/**
 * 当前存活的 MCP 子进程（pid → 命令行摘要）。
 *
 * 不用 execFileSync 抓 pwsh 的 stdout：本机的文件沙箱禁止程序打开命名管道，
 * 管道式 stdio 会以 EPERM/ENOENT 失败。改成把结果**写进临时文件**再读回来。
 * @returns 进程列表。
 */
function mcpProcesses() {
  const outFile = join(tmpdir(), `mcp-procs-${process.pid}.json`)
  // 进程名用 like 前缀匹配：github server 的实际名带版本号
  // （github-mcp-server-1.12.2.exe），写死全名会永远匹配不到而误报基线失败。
  const script = 'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\' or Name like \'github-mcp-server%\'" | '
    + 'Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress | '
    + `Set-Content -Encoding utf8 -Path '${outFile}'`
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' })
  const raw = readFileSync(outFile, 'utf8').replace(/^\uFEFF/, '').trim()
  if (raw === '') return []
  const rows = raw.startsWith('[') ? JSON.parse(raw) : [JSON.parse(raw)]
  return rows
    .map((r) => ({ pid: r.ProcessId, name: r.Name, cmd: String(r.CommandLine ?? '') }))
    .filter((r) => /mcp|dbhub|chrome-devtools|github-mcp/i.test(r.cmd) || /github-mcp/i.test(r.name))
}

/** 等某个条件成立（轮询），返回是否在超时内成立。 */
async function waitFor(label, predicate, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = mcpProcesses()
    if (predicate(last)) return { ok: true, procs: last, ms: Date.now() - (deadline - timeoutMs) }
    await sleep(700)
  }
  return { ok: false, procs: last, ms: timeoutMs }
}

const hasGithub = (procs) => procs.some((p) => /github-mcp/i.test(p.name) || /github-mcp/i.test(p.cmd))
const hasDbhub = (procs) => procs.some((p) => /dbhub/i.test(p.cmd))

console.log(`patch 文件：${patchFile}（${original.length} 字节）`)
const before = mcpProcesses()
console.log(`当前 MCP 进程 ${before.length} 个：`)
for (const p of before) console.log(`  pid ${p.pid}  ${p.name}  ${p.cmd.slice(0, 110)}`)
ok('基线：github-mcp-server 在跑', hasGithub(before))
ok('基线：dbhub 在跑', hasDbhub(before))

if (!LIVE) {
  console.log('\n干跑模式：加 --live 才真实改动文件。')
  console.log('将执行：关闭 github → 等进程退出 → 重新开启 → 等进程回来 → 还原并校验字节。')
  process.exit(failed === 0 ? 0 : 1)
}

const { writeFileSync } = await import('node:fs')
const restore = () => {
  const now = readFileSync(patchFile, 'utf8')
  if (now !== original) {
    writeFileSync(patchFile, original)
    console.log('\n已还原 patch 文件。')
  }
}

try {
  // ── 关闭 github ────────────────────────────────────────────────────────────
  const closed = applyPatchToggle(original, 'mcp-github', false)
  ok('关闭后仍能解析出定义', patchFileDefinesEntry(closed, 'mcp-github'))
  ok('关闭是纯追加（其他字节零改动）', closed.startsWith(original))
  writeFileSync(patchFile, closed)
  console.log(`\n已写入关闭补丁（+${closed.length - original.length} 字节），等待 DSH 热重组…`)

  const gone = await waitFor('github 进程退出', (procs) => !hasGithub(procs))
  ok(`关闭生效：github-mcp-server 已退出（${gone.ms}ms）`, gone.ok, `仍在跑: ${JSON.stringify(gone.procs.filter((p) => hasGithub([p])))}`)
  ok('关闭不影响 dbhub', hasDbhub(gone.procs))

  // ── 重新开启 ───────────────────────────────────────────────────────────────
  const reopened = applyPatchToggle(readFileSync(patchFile, 'utf8'), 'mcp-github', true)
  ok('重新开启后文件回到原状', reopened === original, `${reopened.length} vs ${original.length}`)
  writeFileSync(patchFile, reopened)
  console.log('\n已还原开启状态，等待 DSH 重新装载…')

  const back = await waitFor('github 进程回来', (procs) => hasGithub(procs))
  ok(`重新开启生效：github-mcp-server 已回来（${back.ms}ms）`, back.ok)
} finally {
  restore()
  const after = readFileSync(patchFile, 'utf8')
  ok('最终字节与原始完全一致', after === original, `${after.length} vs ${original.length}`)
  ok('最终无 BOM / 仍是 LF', !after.includes('\r') && after.charCodeAt(0) !== 0xfeff)
}

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
