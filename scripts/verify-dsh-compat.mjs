#!/usr/bin/env node
/**
 * verify-dsh-compat —— 用 profile 里**真实**的 DSH 运行时验证插件与当前版本兼容。
 *
 * 为什么需要它：插件在运行期从 profile 的 node_modules 副本加载，DSH 升级会连
 * cordis / cordis-plugin-loader / dsh-mcp-client 一起换版本。插件源码里任何
 * 依赖旧版行为的假设（loader 条目形状、未 inject 时 ctx.get 的语义、settings
 * scope 形状）一旦失效，表现是**静默**的——设置页「MCP 管理」里「已安装」永远为空，
 * 而卡片本身照常渲染，看不出报错。
 *
 * 覆盖：
 *   1. 真实 Loader + Include 装配真实 cordis.patch.yml 里的 mcp-client 条目；
 *   2. 部署副本的 collectInstalledMcpServers 能认出全部条目（含 entryId / editable）；
 *   3. cordis 运行时 API：对象形式 plugin、未 inject 的 ctx.get、settings scope、effect。
 *
 * 只读：不写 profile 配置，不启动任何 MCP 子进程（条目全部 disabled，只建 Entry 不 init）。
 *
 * 用法：node scripts/verify-dsh-compat.mjs
 * profile 目录默认 %USERPROFILE%\.dsh\profiles\web，可用 DSH_PROFILE_DIR 覆盖。
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { parse, stringify } from 'yaml'

/** DSH patch 允许 `!!js` 表达式；不声明该标签解析会报 unresolved tag。 */
const JS_TAG = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value) => value,
  stringify: (value) => String(value),
}

/** host 半区识别 MCP loader 条目时比对的包名。 */
const MCP_MODULE = '@deepseek-ai/dsh-mcp-client'
const PLUGIN = 'dsh-experience-plugin'

const profileDir = process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'web')
const patchFilePath = join(profileDir, 'cordis.patch.yml')
const pluginDir = join(profileDir, 'node_modules', PLUGIN)

let failed = 0
/** 记一条断言结果。 */
const check = (label, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '✔' : '✘'} ${label}${ok || detail === '' ? '' : `  -- ${detail}`}`)
}

if (!existsSync(patchFilePath)) {
  console.error(`找不到 profile 配置：${patchFilePath}`)
  process.exit(2)
}
if (!existsSync(pluginDir)) {
  console.error(`profile 里没有本插件：${pluginDir}\n先跑 node scripts/deploy-to-profile.mjs`)
  process.exit(2)
}

// 关键：一切运行时包都从 profile 的真实安装面解析，而不是本仓库的 devDependencies
// （仓库锁的是 0.1.5-rc.1，profile 跑的是 0.1.6-alpha.2，混用等于没测）。
const profileRequire = createRequire(join(profileDir, 'package.json'))
const fromProfile = (spec) => import(pathToFileURL(profileRequire.resolve(spec)).href)

const { Context } = await fromProfile('@deepseek-ai/cordis')
const Loader = (await fromProfile('@deepseek-ai/cordis-plugin-loader')).default
const Include = (await fromProfile('@deepseek-ai/cordis-plugin-include')).default
const plugin = await fromProfile(PLUGIN)

console.log(`profile : ${profileDir}`)
console.log(`cordis  : ${profileRequire('@deepseek-ai/cordis/package.json').version}`)
console.log(`loader  : ${profileRequire('@deepseek-ai/cordis-plugin-loader/package.json').version}`)
console.log(`mcp-cli : ${profileRequire(`${MCP_MODULE}/package.json`).version}\n`)

// ── 1. 真实 Loader 装配真实 patch 里的 mcp-client 条目 ────────────────────────
const rows = parse(readFileSync(patchFilePath, 'utf8'), { customTags: [JS_TAG] })
const mcpRows = []
for (const row of rows ?? []) {
  for (const item of row?.insert ?? []) {
    if (item?.name !== MCP_MODULE) continue
    // 全部 disabled：只创建 Entry，不启动 MCP 子进程（本脚本必须无副作用）。
    mcpRows.push({ ...item, disabled: true })
  }
}
check(`patch 层存在 mcp-client 条目（${mcpRows.length} 个）`, mcpRows.length > 0)
if (mcpRows.length === 0) process.exit(1)

const dir = mkdtempSync(join(tmpdir(), 'dsh-compat-'))
const cfgPath = join(dir, 'cordis.yml')
writeFileSync(cfgPath, stringify(mcpRows), 'utf8')

const ctx = new Context()
await ctx.plugin(Loader)
ctx.loader.builtins.include = Include
await ctx.loader.create({
  id: 'include',
  name: 'cordis:include',
  config: { path: pathToFileURL(cfgPath).href },
})
await ctx.loader.await()
rmSync(dir, { recursive: true, force: true })

const loader = ctx.get('loader')
const entries = [...loader.entries()].filter((e) => e.options.name === MCP_MODULE)
check('ctx.get(loader) 在未 inject loader 时可用', loader !== undefined)
check('loader.entries() 能看到全部条目', entries.length === mcpRows.length, `实际 ${entries.length}`)
check('entry.options.name 仍是模块名', entries.every((e) => e.options.name === MCP_MODULE))
check('entry.disabled 可读', entries.every((e) => typeof e.disabled === 'boolean'))
check(
  'entry.options.config.serverName 可读',
  entries.every((e) => typeof e.options.config?.serverName === 'string'),
)

// ── 2. 部署副本的收集逻辑认得这些条目 ────────────────────────────────────────
check('部署副本导出了 collectInstalledMcpServers', typeof plugin.collectInstalledMcpServers === 'function')
check('部署副本导出了 patchIdOf', typeof plugin.patchIdOf === 'function')

const names = mcpRows.map((r) => r.config.serverName)
const editableIds = new Set(entries.map((e) => plugin.patchIdOf(e.id)))
// tools 面用形状等价的桩：真实 tools 服务需要完整 boot，这里只验证契约。
const probe = {
  get: (name) => (name === 'tools'
    ? { schemas: () => names.map((s) => ({ name: `mcp__${s}__probe` })) }
    : name === 'loader' ? loader : undefined),
}
const installed = plugin.collectInstalledMcpServers(probe, new Set(), editableIds)
check(
  'collectInstalledMcpServers 认出全部服务器',
  installed.map((s) => s.name).sort().join(',') === [...names].sort().join(','),
  installed.map((s) => s.name).join(','),
)
check('每个服务器都归属到工具面', installed.every((s) => s.tools.length === 1))
check('patch 层定义的条目 editable=true', installed.every((s) => s.editable === true))
check(
  'entryId 就是 loader 里的真实条目 id',
  installed.every((s) => entries.some((e) => e.id === s.entryId)),
)

// ── 3. RPC 响应形状：这正是「卡片里显示不出已安装」的断点 ───────────────────
// 前端读的是返回值的 installed 字段；host 半区一旦滞后（未重启）这个字段就整个消失，
// 卡片照常渲染但列表为空。所以这里直接打 dispatch，而不只测内部函数。
const view = await plugin.dispatchMcpManagerRpc('mcp/manager/list', {}, {
  servers: () => [],
  replace: async () => {},
  live: () => [],
  installed: () => installed,
  patch: () => ({ file: patchFilePath, editable: () => [...editableIds], toggle: async () => {}, remove: async () => {} }),
})
check('dispatchMcpManagerRpc 返回 ok', view.ok === true)
check('响应含 installed 字段', Object.hasOwn(view.value ?? {}, 'installed'), JSON.stringify(Object.keys(view.value ?? {})))
check('响应 installed 是数组', Array.isArray(view.value?.installed))
check('响应 installed 覆盖全部服务器', view.value?.installed?.length === mcpRows.length)

// ── 4. cordis 运行时 API（插件 host 半区依赖的行为面）───────────────────────
const root = new Context()
root.provide('alpha', { ok: true })
root.provide('loader', loader)
root.provide('settings', {
  register: (_ns, schema, options) => {
    const value = schema(options?.base ?? {})
    return { get: () => value, watch: () => () => {}, update: async () => {}, replace: async () => {} }
  },
})

const { default: z } = await fromProfile('@deepseek-ai/schemastery')
let inner = {}
const fiber = await root.plugin({
  name: 'compat-probe',
  inject: ['alpha'],
  apply(c, cfg) {
    inner = {
      inject: typeof c.alpha === 'object',
      config: cfg?.tag === 'cfg-ok' && cfg.args?.[0] === '--x',
      logger: typeof c.logger('probe').info === 'function',
      effect: typeof c.effect(() => () => {}, 'probe') === 'function',
      missing: c.get('definitely-not-a-service') === undefined,
      scopeGet: (() => {
        const s = root.settings.register('probe-ns', z.object({ n: z.number().default(1) }).default({ n: 1 }), {})
        return s.get().n === 1 && typeof s.watch(() => {}) === 'function' && typeof s.replace === 'function'
      })(),
    }
  },
}, { tag: 'cfg-ok', args: ['--x'] })

check('对象形式 plugin 可 await', fiber !== undefined)
check('inject 的服务可读', inner.inject === true)
check('plugin config 原样透传（含数组）', inner.config === true)
check('ctx.logger(name) 可用', inner.logger === true)
check('ctx.effect 返回注销函数', inner.effect === true)
check('未注册的服务返回 undefined', inner.missing === true)
check('settings scope 形状（get/watch/replace）', inner.scopeGet === true)

console.log(`\n已安装清单：${installed.map((s) => `${s.name}(${s.tools.length})`).join(' ') || '(空)'}`)
console.log(failed === 0 ? 'DSH 兼容性验证通过' : `${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
