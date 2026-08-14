// model-reasoning 端到端验证：真实 settings-file + llm + pi-ai 栈，临时 DSH_HOME
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as piAi from '@deepseek-ai/dsh-llm-pi-ai'
import { applyModelReasoning } from '../lib/types/features/model-reasoning/host.js'
import { buildInjectionPatch, MODEL_REASONING_NS, ModelReasoningSettingsSchema, dispatchMrRpc, MR_RPC_GET, MR_RPC_WRITE } from '../lib/index.js'

const HOME = './.e2e-home'
const DOC = HOME + '/settings.yaml'
rmSync(HOME, { recursive: true, force: true })
mkdirSync(HOME, { recursive: true })
// 固定干净模板（不依赖真实文件——真实文件可能已被插件运行"污染"）。
// 与用户场景一致：codex = openai-responses 网关（EdenAI 风格模型），
// opencode-go = 无 api 的 provider（注入跳过，保存时必须保留原样）。
const TEMPLATE = [
  'llm-pi-ai:',
  '  providers:',
  '    codex:',
  "      displayName: EdenAI",
  "      apiKeyEnv: CODEX_API_KEY",
  "      api: openai-responses",
  "      baseURL: https://api.example.com/v1",
  "      models:",
  "        - id: deepseek-v4-flash",
  "          name: deepseek-v4-flash",
  "        - id: deepseek-v4-pro",
  "          name: deepseek-v4-pro",
  "        - id: gpt-5.6-luna",
  "          name: gpt-5.6-luna",
  "        - id: gpt-5.6-sol",
  "          name: gpt-5.6-sol",
  "        - id: grok-4.6",
  "          name: grok-4.6",
  "    opencode-go:",
  "      displayName: opencode-go",
  "      models:",
  "        - id: deepseek-v4-flash",
  "          name: deepseek-v4-flash",
  '',
].join('\n')
writeFileSync(DOC, TEMPLATE, 'utf8')
console.log('temp home ready:', DOC)

const app = new Context()
try {
  app.plugin(FileSettingsProvider, { path: DOC, dshHome: HOME, watch: false })
  app.plugin(LlmRuntime, {})
  app.plugin(piAi, { providers: {} })
} catch (error) {
  console.log('MOUNT FAIL:', error.message)
  process.exit(1)
}
await new Promise((r) => setTimeout(r, 500))
console.log('plugins mounted')

// 1) 调用 feature（行配置为空 → 族预设生效 + 旧值升级）
applyModelReasoning(app, {})
await new Promise((r) => setTimeout(r, 2000))

const desc = app.settings.describe().find((d) => String(d.ns) === 'llm-pi-ai')
if (!desc) { console.log('FAIL: llm-pi-ai namespace not registered'); process.exit(1) }
console.log('namespace registered; revision =', desc.revision)

// 2) 磁盘文档断言
const after = readFileSync(DOC, 'utf8')
const yamlMod = await import('yaml')
const yaml = yamlMod.parse(after)
const codexModels = yaml['llm-pi-ai'].providers.codex.models
const effortOf = (id) => codexModels.find((m) => m.id === id).reasoningEfforts
console.log('gpt-5.6-luna:', JSON.stringify(effortOf('gpt-5.6-luna')))
console.log('deepseek-v4-flash:', JSON.stringify(effortOf('deepseek-v4-flash')))
const opencodeModels = yaml['llm-pi-ai'].providers['opencode-go'].models
console.log('opencode-go deepseek (no api, must stay untouched):', JSON.stringify(opencodeModels[0].reasoningEfforts))
if (effortOf('gpt-5.6-luna').minimal !== 'minimal') { console.log('FAIL: gpt-5.6 must upgrade to minimal set'); process.exit(1) }
if (effortOf('deepseek-v4-flash').minimal !== undefined) { console.log('FAIL: deepseek must stay minimal-free'); process.exit(1) }
if (effortOf('deepseek-v4-flash').low !== 'low') { console.log('FAIL: deepseek efforts lost'); process.exit(1) }
console.log('upgrade + family differentiation on real stack: OK')

// 2.5) 本插件系列配置命名空间：注册 + 默认值 = 内置知识库
const mrDesc = app.settings.describe().find((d) => String(d.ns) === MODEL_REASONING_NS)
if (!mrDesc) { console.log('FAIL: model-reasoning namespace not registered'); process.exit(1) }
const mrValue = mrDesc.value
const familyCount = mrValue.families.length
console.log('mr namespace registered; families =', familyCount)
if (familyCount < 8) { console.log('FAIL: builtin families missing'); process.exit(1) }
const gpt56 = mrValue.families.find((f) => f.id === 'gpt-5.6')
if (!gpt56 || gpt56.efforts.xhigh !== 'xhigh') { console.log('FAIL: gpt-5.6 family seed'); process.exit(1) }
console.log('builtin families seeded: OK')

// 2.6) 用户保存系列配置（模拟设置页 update 路径）→ 注入用新配置
await app.settings.update(MODEL_REASONING_NS, {
  defaultEfforts: { off: null, medium: 'medium' },
  families: [
    { id: 'mine', label: '我的系列', pattern: '^my-', efforts: { off: null, max: 'max' } },
  ],
}, mrDesc.revision)
console.log('user families saved; revision =', app.settings.describe().find((d) => String(d.ns) === MODEL_REASONING_NS).revision)


// 2.7) 再注入一次：用户系列应生效（my- 模型 → max；其余 → 用户 defaultEfforts）
// 往 llm-pi-ai 加一个 my- 模型，触发扫描
const llmDesc2 = app.settings.describe().find((d) => String(d.ns) === 'llm-pi-ai')
const codexModels2 = structuredClone(llmDesc2.user.providers.codex.models)
codexModels2.push({ id: 'my-custom-x', name: 'my-custom-x' })
await app.settings.update('llm-pi-ai', { providers: { codex: { models: codexModels2 } } }, llmDesc2.revision)
await new Promise((r) => setTimeout(r, 1500))
const after3 = readFileSync(DOC, 'utf8')
const y3 = yamlMod.parse(after3)
const myModel = y3['llm-pi-ai'].providers.codex.models.find((m) => m.id === 'my-custom-x')
console.log('my-custom-x efforts:', JSON.stringify(myModel.reasoningEfforts))
if (!myModel.reasoningEfforts || myModel.reasoningEfforts.max !== 'max') { console.log('FAIL: user family must apply'); process.exit(1) }
// 其余模型应回退到用户 defaultEfforts（off + medium）
const ds2 = y3['llm-pi-ai'].providers.codex.models.find((m) => m.id === 'deepseek-v4-flash')
console.log('deepseek after user families:', JSON.stringify(ds2.reasoningEfforts))
if (ds2.reasoningEfforts.medium !== 'medium' || ds2.reasoningEfforts.low !== undefined) { console.log('FAIL: user defaultEfforts fallback'); process.exit(1) }
console.log('user families + defaultEfforts on real stack: OK')

// 2.65) RPC 通道（设置页用的读写路径）：GET 返回用户已保存的系列配置
const rpcGet = await dispatchMrRpc(app, MR_RPC_GET, {})
if (!rpcGet.ok) { console.log('FAIL: rpc get', JSON.stringify(rpcGet.error)); process.exit(1) }
const rpcView = rpcGet.value
console.log('rpc get: families =', rpcView.families.length, 'userOwns =', rpcView.userOwns, 'revision =', rpcView.revision)
if (rpcView.families.length !== 1 || rpcView.families[0].id !== 'mine' || rpcView.userOwns !== true) { console.log('FAIL: rpc get view'); process.exit(1) }

// 2.66) RPC 写：更新系列 → 立即生效
const rpcWrite = await dispatchMrRpc(app, MR_RPC_WRITE, {
  defaultEfforts: { off: null, low: 'low', high: 'high' },
  families: [
    { id: 'mine', label: '我的系列', pattern: '^my-', efforts: { off: null, medium: 'medium' } },
    { id: 'second', label: '二系列', pattern: '^second-', efforts: { off: null, minimal: 'minimal' } },
  ],
})
if (!rpcWrite.ok) { console.log('FAIL: rpc write', JSON.stringify(rpcWrite.error)); process.exit(1) }
const rpcGet2 = await dispatchMrRpc(app, MR_RPC_GET, {})
if (!rpcGet2.ok) { console.log('FAIL: rpc get after write'); process.exit(1) }
console.log('rpc write ok; families now =', rpcGet2.value.families.length, 'defaultEfforts =', JSON.stringify(rpcGet2.value.defaultEfforts))
if (rpcGet2.value.families.length !== 2 || rpcGet2.value.families[1].id !== 'second') { console.log('FAIL: rpc write roundtrip'); process.exit(1) }
if (rpcWrite.value.revision !== rpcGet2.value.revision) { console.log('FAIL: rpc revision sync'); process.exit(1) }
console.log('rpc channel get/write on real stack: OK')

// 2.67) RPC 写后：新模型按新系列注入（my-custom-y → medium）；
// 已注入的模型保持原状（my-custom-x → max 不动）——这正是 UI 里
// "按系列刷新"按钮的用途，插件不自动覆盖已配置模型。
const llmDesc3 = app.settings.describe().find((d) => String(d.ns) === 'llm-pi-ai')
const codexModels3 = structuredClone(llmDesc3.user.providers.codex.models)
codexModels3.push({ id: 'my-custom-y', name: 'my-custom-y' })
await app.settings.update('llm-pi-ai', { providers: { codex: { models: codexModels3 } } }, llmDesc3.revision)
await new Promise((r) => setTimeout(r, 1500))
const y3b = readFileSync(DOC, 'utf8')
const modelsY = yamlMod.parse(y3b)['llm-pi-ai'].providers.codex.models
const myModel2 = modelsY.find((m) => m.id === 'my-custom-y')
const myModelX = modelsY.find((m) => m.id === 'my-custom-x')
console.log('my-custom-y after rpc write:', JSON.stringify(myModel2.reasoningEfforts))
console.log('my-custom-x untouched:', JSON.stringify(myModelX.reasoningEfforts))
if (!myModel2.reasoningEfforts || myModel2.reasoningEfforts.medium !== 'medium' || myModel2.reasoningEfforts.max !== undefined) { console.log('FAIL: new model must use new family'); process.exit(1) }
if (myModelX.reasoningEfforts.max !== 'max' || myModelX.reasoningEfforts.medium !== undefined) { console.log('FAIL: configured model must stay untouched'); process.exit(1) }
console.log('rpc write applies to new models, keeps configured ones: OK')

// 3) 幂等：以当前文档为基准，再挂一个插件实例后文档不得变化
const beforeIdem = readFileSync(DOC, 'utf8')
applyModelReasoning(app, {})
await new Promise((r) => setTimeout(r, 1200))
const after2 = readFileSync(DOC, 'utf8')
const idemOk = (after2.match(/reasoningEfforts/g) ?? []).length === (beforeIdem.match(/reasoningEfforts/g) ?? []).length
console.log('idempotent:', idemOk)
if (!idemOk) process.exit(1)

// 4) 模拟设置页"保存全部"（UI save 的 omit 语义）：
//    - 已声明 reasoningEfforts 的模型原样保留；
//    - 空勾选模型省略 reasoningEfforts 字段（绝不写空对象）。
//    pi-ai schema 拒绝 "has an empty reasoningEfforts"，所以整个 update 必须成功。
const llmFinal = app.settings.describe().find((d) => String(d.ns) === 'llm-pi-ai')
const uiPatch = { providers: {} }
for (const [route, provider] of Object.entries(llmFinal.user.providers)) {
  uiPatch.providers[route] = {
    models: provider.models.map((model) => {
      const raw = { ...model }
      const re = raw.reasoningEfforts
      const hasEfforts = re !== undefined && re !== null && typeof re === 'object' && Object.keys(re).length > 0
      if (hasEfforts) return raw
      const { reasoningEfforts: _dropped, ...rest } = raw
      return rest
    }),
  }
}
try {
  await app.settings.update('llm-pi-ai', uiPatch, llmFinal.revision)
  console.log('ui-save simulation (all models): accepted')
} catch (error) {
  console.log('FAIL: ui-save simulation rejected:', error.message)
  process.exit(1)
}
// 断言：任何模型都没有空 reasoningEfforts
const yFinal = yamlMod.parse(readFileSync(DOC, 'utf8'))['llm-pi-ai']
for (const [route, provider] of Object.entries(yFinal.providers)) {
  for (const model of provider.models) {
    const re = model.reasoningEfforts
    if (re !== undefined && re !== null && typeof re === 'object' && Object.keys(re).length === 0) {
      console.log('FAIL: empty reasoningEfforts on', route, model.id)
      process.exit(1)
    }
  }
}
console.log('no empty reasoningEfforts anywhere: OK')

// 5) 模拟清空一个模型的所有勾选 → 省略字段 → 宿主按系列重新注入
const llmFinal2 = app.settings.describe().find((d) => String(d.ns) === 'llm-pi-ai')
const uiPatch2 = { providers: { codex: { models: llmFinal2.user.providers.codex.models.map((m) => {
  if (m.id !== 'deepseek-v4-flash') return { ...m }
  const { reasoningEfforts: _d, ...rest } = m
  return rest
}) } } }
await app.settings.update('llm-pi-ai', uiPatch2, llmFinal2.revision)
await new Promise((r) => setTimeout(r, 1500))
const yFinal2 = yamlMod.parse(readFileSync(DOC, 'utf8'))['llm-pi-ai']
const dsAgain = yFinal2.providers.codex.models.find((m) => m.id === 'deepseek-v4-flash')
console.log('deepseek after clearing:', JSON.stringify(dsAgain.reasoningEfforts))
if (!dsAgain.reasoningEfforts || dsAgain.reasoningEfforts.low !== 'low') { console.log('FAIL: cleared model must be re-injected from family'); process.exit(1) }
console.log('cleared model re-injected from family: OK')

console.log('E2E ALL PASSED')
process.exit(0)