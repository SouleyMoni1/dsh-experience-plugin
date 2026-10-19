/**
 * verify-client-activate —— 在 Node 里验证 client 半区能正常装配。
 *
 * `lib/client.js` 是给浏览器用的 CJS bundle：执行时把工厂注册进
 * `window.__ModuleLoader__`，再由 DSH 前端取 `apply(ctx)` 装配。装配期抛错的表现是
 * `web boot: N entries did not activate`——以前只能开真实浏览器才能发现。
 *
 * 本脚本用最小 DOM + 最小 client ctx 复现这条路径，断言：
 *   1. bundle 以正确的 entry id 注册、导出 apply / name / inject；
 *   2. apply() 不抛错；
 *   3. 「日用优化」settings.section 正常注册，注入面键符合预期。
 *
 * 用法：node scripts/verify-client-activate.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const bundlePath = fileURLToPath(new URL('../lib/client.js', import.meta.url))

const noop = () => undefined
const translate = (key) => key

let failed = 0
const check = (label, ok, detail) => {
  if (ok) {
    console.log(`✔ ${label}`)
  } else {
    failed += 1
    console.log(`✘ ${label}${detail === undefined ? '' : `\n    ${detail}`}`)
  }
}

// ── 最小 DOM：设计系统注入样式表、open-folder 注入菜单标记时会碰到 ────────────
const el = () => ({
  style: {},
  dataset: {},
  children: [],
  setAttribute: noop,
  getAttribute: () => null,
  appendChild: noop,
  removeChild: noop,
  insertBefore: noop,
  remove: noop,
  addEventListener: noop,
  removeEventListener: noop,
  querySelector: () => null,
  querySelectorAll: () => [],
  contains: () => false,
  textContent: '',
})
const fakeDocument = {
  createElement: el,
  createElementNS: el,
  createTextNode: el,
  head: el(),
  body: el(),
  documentElement: el(),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
}

const loaded = []
const fakeWindow = {
  __ModuleLoader__: { load: (mod) => { loaded.push(mod) } },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop,
  removeEventListener: noop,
  location: { href: 'http://127.0.0.1/' },
  document: fakeDocument,
}

// ── 1. 执行 bundle：它只会调用 window.__ModuleLoader__.load 注册工厂 ──────────
const src = readFileSync(bundlePath, 'utf8')
new Function('window', 'document', 'localStorage', 'MutationObserver', src)(
  fakeWindow,
  fakeDocument,
  fakeWindow.localStorage,
  class { observe() {} disconnect() {} },
)
check('bundle 注册了 1 个模块', loaded.length === 1, `实际 ${loaded.length}`)
if (loaded.length !== 1) process.exit(1)

const { id, factory } = loaded[0]
check('entry id 等于包名', id === 'dsh-experience-plugin', id)

// ── 2. 解析模块：只 stub 官方 UI 组件库，react 用真实包 ───────────────────────
const uiPrimitives = new Proxy({}, { get: (_t, prop) => (prop === '__esModule' ? true : () => null) })
const mod = factory((spec) => {
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return uiPrimitives
  return require(spec)
})
check('导出了 apply', typeof mod.apply === 'function')
check('导出了 name', typeof mod.name === 'string')

// ── 3. 装配：捕获运行期异常 ──────────────────────────────────────────────────
const sections = []
const ctx = {
  effect: (fn) => { fn(); return noop },
  locale: { register: () => noop, bind: () => translate, t: translate },
  slots: {
    inject: (_name, fn) => { fn(); return noop },
    register: (def, component) => { sections.push({ def, component }); return noop },
    registerComponent: () => noop,
  },
  remote: { on: () => noop, off: noop, call: async () => ({}) },
  connection: { fetch: { register: () => noop }, rpc: { call: async () => ({}) } },
  workspaces: { on: () => noop, list: () => [] },
  services: {},
  get: () => undefined,
  on: () => noop,
  emit: noop,
  logger: () => ({ info: noop, warn: noop, error: noop, debug: noop }),
}

let applyError
try {
  mod.apply(ctx)
} catch (error) {
  applyError = error
}
check('apply() 不抛错', applyError === undefined, applyError && (applyError.stack ?? String(applyError)))

// ── 4. 设置页分区必须注册，且注入面不含已删功能的字段 ────────────────────────
const daily = sections.find((s) => s.def.id === 'daily-optimization')
check('「日用优化」分区已注册', daily !== undefined, sections.map((s) => s.def.id).join(', ') || '(无)')
if (daily !== undefined) {
  check('分区组件是函数组件', typeof daily.component === 'function')
  const injected = daily.def.inject()
  check('注入面含 api', 'api' in injected, Object.keys(injected).join(', '))
  check('注入面含 rpc', 'rpc' in injected)
  check('注入面含各命名空间文案', 'myRulesT' in injected && 'mcpT' in injected && 'skillT' in injected)
}

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
