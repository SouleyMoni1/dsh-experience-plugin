// model-reasoning 注入逻辑验证：固定 fixture（不依赖用户实时 settings.yaml）跑注入 + 幂等 + schema 校验
import { buildInjectionPatch, DEFAULT_EFFORTS_BY_API, THINKING_LEVELS, FAMILY_PRESETS } from '../lib/index.js'
import { effortsEqual } from '../lib/types/features/model-reasoning/ops.js'
import z from '@deepseek-ai/schemastery'

// 与用户场景一致：codex = openai-responses 网关；模型带旧版统一注入值
//（验证族升级）；opencode-go 无 api（注入必须跳过）。
const providers = {
  codex: {
    displayName: 'EdenAI',
    apiKeyEnv: 'CODEX_API_KEY',
    api: 'openai-responses',
    baseURL: 'https://api.example.com/v1',
    models: [
      { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high' } },
      { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro', reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high' } },
      { id: 'gpt-5.6-luna', name: 'gpt-5.6-luna', reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high' } },
      { id: 'gpt-5.6-sol', name: 'gpt-5.6-sol', reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high' } },
      { id: 'grok-4.6', name: 'grok-4.6', reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high' } },
    ],
  },
  'opencode-go': {
    displayName: 'opencode-go',
    models: [{ id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' }],
  },
}
console.log('providers:', Object.keys(providers).join(', '))

// 1) 注入 patch（不传 effortsByApi → 模型族预设生效）
const { patch, changed } = buildInjectionPatch(providers, { effortsByApi: {} })
const routes = Object.keys(patch.providers)
console.log('patch routes:', routes.join(', '))
console.log('changed count =', changed, '(expect >=2: gpt-5.6 模型从旧统一值升级为 minimal 族)')
if (changed < 2) { console.log('FAIL: expected >= 2 changed'); process.exit(1) }
if (routes.length !== 1 || routes[0] !== 'codex') { console.log('FAIL: patch must only target codex'); process.exit(1) }
// 已有 reasoningEfforts 的模型（含旧统一值）必须在合并后保留且 gpt 系升级
if (!patch.providers.codex.models.every((m) => m.reasoningEfforts)) { console.log('FAIL: every codex model must carry reasoningEfforts'); process.exit(1) }
const gptModels = patch.providers.codex.models.filter((m) => String(m.id).startsWith('gpt-'))
if (!gptModels.every((m) => m.reasoningEfforts.minimal === 'minimal')) { console.log('FAIL: gpt family must include minimal after upgrade'); process.exit(1) }
console.log('gpt family upgraded to minimal:', gptModels.map((m) => m.id).join(', '))

// 2) 应用 patch 到克隆（模拟 update 的深合并：数组整体替换，对象深合并）
const patched = structuredClone({ providers })
for (const [route, section] of Object.entries(patch.providers)) {
  patched.providers[route] = { ...patched.providers[route], models: section.models }
}
const sample = patched.providers.codex.models.find((m) => m.id === 'deepseek-v4-flash').reasoningEfforts
console.log('injected sample:', JSON.stringify(sample))
console.log('opencode-go untouched:', JSON.stringify(patched.providers['opencode-go'].models[0].reasoningEfforts))

// 3) 幂等
const second = buildInjectionPatch(patched.providers, { effortsByApi: {} })
console.log('second pass changed =', second.changed, '(expect 0)')
if (second.changed !== 0) { console.log('FAIL: not idempotent'); process.exit(1) }

// 4) 用与 pi-ai 相同的 settings schema 形状校验注入值
const effortsSchema = z.dict(z.union([z.string(), z.const(null)]), z.union(THINKING_LEVELS))
for (const m of patched.providers.codex.models) {
  const out = effortsSchema(m.reasoningEfforts, { autofix: false })
  if (out === undefined || typeof out !== 'object') { console.log('FAIL: schema rejected', JSON.stringify(m.reasoningEfforts)); process.exit(1) }
}
console.log('schema validation: all injected values pass pi-ai settings schema shape')

// 5) 默认等级表必须满足 pi-ai 的约束（至少一个非 off 等级；off 可为 null；其余必须有值）
for (const [api, efforts] of Object.entries(DEFAULT_EFFORTS_BY_API)) {
  const entries = Object.entries(efforts)
  const hasThinking = entries.some(([lvl, v]) => lvl !== 'off' && v !== null && v !== undefined && String(v).length > 0)
  const offOk = entries.every(([lvl, v]) => lvl !== 'off' ? (typeof v === 'string' && v.length > 0) : true)
  if (!hasThinking || !offOk) { console.log('FAIL: default efforts for', api, 'violate pi-ai constraints'); process.exit(1) }
}
console.log('default efforts tables satisfy pi-ai resolveModelReasoning constraints')
// 6) 模型族差异化：不同族得到不同等级
const fam = {
  codex: { api: 'openai-responses', models: [
    { id: 'gpt-5.6-luna' }, { id: 'gpt-5.2' }, { id: 'o4-mini' }, { id: 'deepseek-v4-flash' },
    { id: 'grok-4.6' }, { id: 'claude-sonnet-4-5' }, { id: 'glm-4.6' }, { id: 'unknown-model-xyz' },
  ]},
}
const famPatch = buildInjectionPatch(fam, { effortsByApi: {} })
const famModels = famPatch.patch.providers.codex.models
const effort = (m) => m.reasoningEfforts
console.log('gpt-5.6-luna:', JSON.stringify(effort(famModels[0])))
console.log('gpt-5.2:', JSON.stringify(effort(famModels[1])))
console.log('o4-mini:', JSON.stringify(effort(famModels[2])))
console.log('deepseek-v4-flash:', JSON.stringify(effort(famModels[3])))
console.log('grok-4.6:', JSON.stringify(effort(famModels[4])))
console.log('claude-sonnet-4-5:', JSON.stringify(effort(famModels[5])))
console.log('glm-4.6:', JSON.stringify(effort(famModels[6])))
console.log('unknown-model-xyz:', JSON.stringify(effort(famModels[7])))
if (effort(famModels[0]).xhigh !== 'xhigh') { console.log('FAIL: gpt-5.6 family must include xhigh'); process.exit(1) }
if (effort(famModels[0]).max !== undefined) { console.log('FAIL: gpt-5.6 family must NOT include max'); process.exit(1) }
if (effort(famModels[1]).xhigh !== undefined) { console.log('FAIL: gpt-5 (non-5.6) must NOT include xhigh'); process.exit(1) }
if (effort(famModels[1]).minimal !== 'minimal' || effort(famModels[2]).high !== 'high') { console.log('FAIL: gpt-5/o families must include minimal'); process.exit(1) }
if (effort(famModels[3]).minimal !== undefined) { console.log('FAIL: deepseek family must NOT include minimal'); process.exit(1) }
if (effort(famModels[4]).minimal !== undefined) { console.log('FAIL: grok family must NOT include minimal'); process.exit(1) }
if (effort(famModels[5]).low !== 'low' || effort(famModels[6]).high !== 'high') { console.log('FAIL: claude/glm family basics'); process.exit(1) }
if (effort(famModels[7]).low !== 'low') { console.log('FAIL: fallback family'); process.exit(1) }
console.log('family differentiation: OK')

// 7) 用户自定义 familyPresets 覆盖内置
const userPatch = buildInjectionPatch({ codex: { api: 'openai-responses', models: [{ id: 'grok-4.6' }] } }, {
  effortsByApi: {},
  familyPresets: [{ pattern: /^grok/i, label: 'user', efforts: { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' } }],
})
const userEffort = userPatch.patch.providers.codex.models[0].reasoningEfforts
console.log('user grok override:', JSON.stringify(userEffort))
if (userEffort.max !== 'max') { console.log('FAIL: user familyPresets must win over builtin'); process.exit(1) }
console.log('user familyPresets override: OK')

// 8) 旧版统一默认值升级为族预设；手改值不动
const legacy = {
  codex: { api: 'openai-responses', models: [
    { id: 'gpt-5.6-luna', reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high' } },
    { id: 'deepseek-v4-flash', reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high' } },
    { id: 'custom-tuned', reasoningEfforts: { off: null, high: 'high' } },
  ]},
}
const legacyPatch = buildInjectionPatch(legacy, { effortsByApi: {} })
const legacyModels = legacyPatch.patch.providers.codex.models
console.log('legacy gpt-5.6 upgraded:', JSON.stringify(legacyModels[0].reasoningEfforts))
console.log('legacy deepseek upgraded:', JSON.stringify(legacyModels[1].reasoningEfforts))
console.log('user-tuned untouched:', JSON.stringify(legacyModels[2].reasoningEfforts))
if (legacyModels[0].reasoningEfforts.minimal !== 'minimal' || legacyModels[0].reasoningEfforts.xhigh !== 'xhigh') { console.log('FAIL: legacy gpt-5.6 must upgrade to minimal+xhigh set'); process.exit(1) }
if (legacyModels[2].reasoningEfforts.low !== undefined || legacyModels[2].reasoningEfforts.high !== 'high') { console.log('FAIL: user-tuned must NOT be overwritten'); process.exit(1) }
console.log('legacy upgrade logic: OK')

// 9) upgradeLegacy=false 时旧值不动
const noUpgrade = buildInjectionPatch(legacy, { effortsByApi: {}, upgradeLegacy: false })
if (noUpgrade.changed !== 0) { console.log('FAIL: upgradeLegacy=false must change nothing'); process.exit(1) }
console.log('upgradeLegacy=false: OK')

// 10) defaultEfforts 兜底：未命中系列时用默认配置
const fallback = buildInjectionPatch({ codex: { api: 'openai-responses', models: [{ id: 'my-custom-model-x' }] } }, {
  effortsByApi: {},
  defaultEfforts: { off: null, high: 'high' },
})
const fbEffort = fallback.patch.providers.codex.models[0].reasoningEfforts
console.log('defaultEfforts fallback:', JSON.stringify(fbEffort))
if (fbEffort.high !== 'high' || fbEffort.low !== undefined) { console.log('FAIL: defaultEfforts fallback'); process.exit(1) }
console.log('defaultEfforts fallback: OK')

// 11) 系列优先级：用户 familyPresets 排在内置知识库之前
const prio = buildInjectionPatch({ codex: { api: 'openai-responses', models: [{ id: 'deepseek-v4-flash' }] } }, {
  effortsByApi: {},
  familyPresets: [{ id: 'override', pattern: /^deepseek/i, label: 'override', efforts: { off: null, max: 'max' } }],
})
const prioEffort = prio.patch.providers.codex.models[0].reasoningEfforts
console.log('family override wins:', JSON.stringify(prioEffort))
if (prioEffort.max !== 'max') { console.log('FAIL: user family must win over builtin'); process.exit(1) }
console.log('family precedence: OK')

// 12) 内置知识库：25 个知名系列 + 关键族等级
const BUILTIN = FAMILY_PRESETS
console.log('builtin families:', BUILTIN.length)
if (BUILTIN.length < 20) { console.log('FAIL: expected 25 builtin families'); process.exit(1) }
const byId = new Map(BUILTIN.map((p) => [p.id, p]))
if (!byId.get('gpt-5.6').efforts.xhigh) { console.log('FAIL: gpt-5.6 xhigh'); process.exit(1) }
if (byId.get('gpt-5.6').efforts.max) { console.log('FAIL: gpt-5.6 must not have max'); process.exit(1) }
for (const id of ['gpt-5', 'deepseek', 'grok', 'claude', 'glm', 'qwen', 'gemini', 'llama', 'mistral', 'gpt-4', 'doubao', 'kimi', 'ernie', 'spark', 'baichuan', 'yi', 'minimax', 'hunyuan', 'step', 'internlm', 'gemma', 'phi', 'command', 'nemotron']) {
  if (!byId.has(id)) { console.log('FAIL: missing family', id); process.exit(1) }
}
// 新系列都是三档
for (const id of ['gpt-4', 'doubao', 'kimi', 'hunyuan', 'gemma']) {
  const e = byId.get(id).efforts
  if (e.minimal !== undefined || e.xhigh !== undefined) { console.log('FAIL: new family', id, 'must be 3-level'); process.exit(1) }
}
console.log('builtin family knowledge base: OK')

console.log('ALL TESTS PASSED')