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
// （仓库 devDependencies 与 profile 会各自升版，混用等于没测）。
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
      // settings-compat 的分线探测：只依赖 register 是否存在，因此这里用两个
      // 极简替身分别代表两条线，验证探测函数本身在真实 cordis 上下文里成立。
      lineLegacy: plugin.settingsLine({ register() {} }) === 'legacy',
      lineConfig: plugin.settingsLine({ describe() {}, update() {} }) === 'config',
    }
  },
}, { tag: 'cfg-ok', args: ['--x'] })

check('对象形式 plugin 可 await', fiber !== undefined)
check('inject 的服务可读', inner.inject === true)
check('plugin config 原样透传（含数组）', inner.config === true)
check('ctx.logger(name) 可用', inner.logger === true)
check('ctx.effect 返回注销函数', inner.effect === true)
check('未注册的服务返回 undefined', inner.missing === true)
check('settings 分线探测：稳定线（有 register）', inner.lineLegacy === true)
check('settings 分线探测：alpha 线（无 register）', inner.lineConfig === true)

// ── 5. 本插件在**当前 profile 这条线**上的真实契约 ───────────────────────────
// 两条线的差异只有「命名空间从哪来」：稳定线插件自注册，alpha 线命名空间 = 条目 id。
// 直接读 profile 里真实的 dsh-settings，确认本插件选对了分支。
const SettingsForms = (await fromProfile('@deepseek-ai/dsh-settings')).default
const hasRegister = typeof SettingsForms.prototype.register === 'function'
const profileLine = hasRegister ? 'legacy' : 'config'
console.log(`\nsettings 线：${profileLine}（dsh-settings ${profileRequire('@deepseek-ai/dsh-settings/package.json').version}）`)

if (profileLine === 'config') {
  // alpha 线：register 必须**不存在**；命名空间由条目 id 提供，可写字段须 volatile。
  check('alpha 线：settings 上没有 register', hasRegister === false)
  check('alpha 线：PlainConfig 仍导出（供稳定线分支调用）', typeof plugin.PlainConfig === 'function')
  // 可写段必须全部标了 volatile，否则设置页保存会被 host 拒绝。
  const { Config } = plugin
  const rootIds = (j) => j.refs[String(j.uid)].dict
  const isVolatile = (j, key) => {
    const dict = rootIds(j)
    return j.refs[String(dict[key])]?.meta?.volatile === true
  }
  const json = Config.toJSON()
  for (const key of ['defaultEfforts', 'families', 'cliMimic', 'mcpManager', 'modelParams']) {
    check(`alpha 线：${key} 已标 volatile`, isVolatile(json, key))
  }
  for (const key of ['modelReasoning', 'openFolder']) {
    check(`alpha 线：${key} 未标 volatile（普通配置）`, isVolatile(json, key) === false)
  }
  // 命名空间必须等于 loader 条目 id，而条目 id 来自 bundle patch。
  const bundleRows = parse(readFileSync(join(pluginDir, 'cordis.patch.yml'), 'utf8'), { customTags: [JS_TAG] })
  const inserted = bundleRows?.find((r) => r?.insert !== undefined)?.insert ?? []
  check('bundle patch 里条目 id 等于包名', inserted.some((i) => i.id === PLUGIN), JSON.stringify(inserted.map((i) => i.id)))
} else {
  // 稳定线：register 必须存在，且未注册前命名空间不可见。
  check('稳定线：settings 上有 register', hasRegister === true)
  check('稳定线：PlainConfig 作为注册 schema 存在', typeof plugin.PlainConfig === 'function')
}

console.log(`\n已安装清单：${installed.map((s) => `${s.name}(${s.tools.length})`).join(' ') || '(空)'}`)
console.log(failed === 0 ? 'DSH 兼容性验证通过' : `${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
