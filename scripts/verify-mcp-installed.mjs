#!/usr/bin/env node
/**
 * verify-mcp-installed —— 用假 ctx 验证 collectInstalledMcpServers 的三源合并逻辑。
 *
 * 覆盖：
 *   1. loader 条目识别（cordis.patch.yml 里的 mcp-client 条目）；
 *   2. 工具面归属（mcp__<server>__<tool> 按最长前缀切分，含带下划线的 serverName）；
 *   3. 只活在工具面、loader 查不到的动态装配者。
 * 只读：不碰真实 profile、不写任何文件。
 */
import { collectInstalledMcpServers, mcpServerOfToolName } from '../lib/index.js'

/** 断言并累计失败数。 */
let failed = 0
function check(label, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  if (!ok) failed += 1
  console.log(`${ok ? '✔' : '✘'} ${label}${ok ? '' : `\n    期望 ${e}\n    实际 ${a}`}`)
}

// ── 1. mcpServerOfToolName 切分 ──────────────────────────────────────────────
check('普通工具名', mcpServerOfToolName('mcp__github__search_code'), 'github')
check('非 MCP 工具', mcpServerOfToolName('read_file'), undefined)
check('只有前缀', mcpServerOfToolName('mcp__github'), undefined)
check('带下划线的 serverName（无名单时退回首切）', mcpServerOfToolName('mcp__a__b__tool'), 'a')
check('带下划线的 serverName（有名单时最长前缀）', mcpServerOfToolName('mcp__a__b__tool', new Set(['a', 'a__b'])), 'a__b')

// ── 2. 三源合并 ──────────────────────────────────────────────────────────────
const fakeCtx = {
  get(name) {
    if (name === 'loader') {
      return {
        entries: () => [
          {
            id: 'mcp-github',
            disabled: false,
            options: {
              name: '@deepseek-ai/dsh-mcp-client',
              config: { serverName: 'github', transport: 'stdio', command: 'github-mcp-server.exe' },
            },
          },
          {
            id: 'mcp-dbhub',
            disabled: false,
            options: {
              name: '@deepseek-ai/dsh-mcp-client',
              config: { serverName: 'dbhub', transport: 'stdio', command: 'node' },
            },
          },
          {
            id: 'mcp-dead',
            disabled: false,
            options: {
              name: '@deepseek-ai/dsh-mcp-client',
              config: { serverName: 'deadserver', transport: 'stdio', command: 'nope' },
            },
          },
          { id: 'not-mcp', disabled: false, options: { name: 'some-other-plugin' } },
        ],
      }
    }
    if (name === 'tools') {
      return {
        schemas: () => [
          { name: 'mcp__github__search_code' },
          { name: 'mcp__github__get_file_contents' },
          { name: 'mcp__dbhub__execute_sql' },
          { name: 'mcp__dynamic__something' },
          { name: 'read_file' },
        ],
      }
    }
    return undefined
  },
}

const installed = collectInstalledMcpServers(fakeCtx)
check('已安装服务器数量', installed.length, 4)
check('排序 + 归属', installed.map((s) => [s.name, s.entryId, s.tools.length]), [
  ['dbhub', 'mcp-dbhub', 1],
  ['deadserver', 'mcp-dead', 0],
  ['dynamic', '', 1],
  ['github', 'mcp-github', 2],
])
check('未连上的服务器 tools 为空', installed.find((s) => s.name === 'deadserver').tools, [])
check('默认全部不可编辑（未传 patch 层 id 集合）', installed.every((s) => s.editable === false), true)

// ── 3. loader 服务缺席时不炸 ─────────────────────────────────────────────────
check('无 loader / tools 服务', collectInstalledMcpServers({ get: () => undefined }), [])

// ── 4. 插件托管的服务器不重复计入「已安装」 ──────────────────────────────────
const overlapCtx = {
  get(name) {
    if (name === 'tools') return { schemas: () => [{ name: 'mcp__mine__do_thing' }, { name: 'mcp__github__x' }] }
    return undefined
  },
}
check('托管名被排除', collectInstalledMcpServers(overlapCtx, new Set(['mine'])).map((s) => s.name), ['github'])

// ── 5. editable 标记：只有 patch 层定义的条目才可关 / 可卸载 ─────────────────
const editables = collectInstalledMcpServers(fakeCtx, new Set(), new Set(['mcp-github']))
check('patch 层定义的条目 editable=true', editables.find((s) => s.name === 'github').editable, true)
check('bundle 层条目 editable=false', editables.find((s) => s.name === 'dbhub').editable, false)
check('工具面孤儿条目 editable=false', editables.find((s) => s.name === 'dynamic').editable, false)
check('editable 不影响排序', editables.map((s) => s.name), ['dbhub', 'deadserver', 'dynamic', 'github'])

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
