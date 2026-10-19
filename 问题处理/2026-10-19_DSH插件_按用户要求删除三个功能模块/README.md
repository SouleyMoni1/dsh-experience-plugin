# 删除「模型思考等级 / 模型参数 / 自动加载历史」三个功能模块

- 日期：2026-10-19
- 对象（单号 / 环境 / 版本）：dsh-experience-plugin 0.7.10 → 0.7.12；DSH 桌面端 0.2.1-rc.2
- 处理人：lead（AI 协助）

## 现象

用户要求：DSH 有更新了，把插件里的「模型思考等级」「模型参数」「自动加载历史」三个功能删掉。

删除过程中另外发现两个问题：

1. **打包把已删功能的类型声明一起发了**：0.7.11 的 `lib/types/` 里残留
   `model-reasoning`（27 个）、`model-params`（9 个）、`auto-load-history`（6 个）
   共 42 个 `.d.ts` / `.map`，npm 包 153 个文件里混着已不存在的模块。
2. **client 半区没有运行期门禁**：以前只能开真实浏览器、看 `web boot: N entries
   did not activate` 才知道 client 装配出了问题。

## 原因

**1. 三个功能与其余模块的耦合点**（决定了删改清单）：

- 配置契约：`src/features/config-sections.ts` 的 `CONFIG_SECTIONS` 与 `ConfigSections`
  里有 `modelReasoning` / `defaultEfforts` / `families` / `modelParams` 四个键。
- schema：`src/index.ts` 的 `configSchema()` 里对应四段（`families`、`defaultEfforts`
  在 model-reasoning 内，`modelParams` 在 model-params 内）。
- 装配：`src/index.ts` 调 `applyModelReasoning` / `applyModelParamsHost`；
  `src/client/index.ts` 调 `applyModelReasoningClient` / `applyAutoLoadHistory`。
- UI：`DailyOptimizationSection.tsx` 的 `settingsCards` 里挂三张卡片，
  注入面额外给了 `remote` 与 `mrT`；`module-toggles` 的 `MODULES` 清单有三项。
- 历史命名空间映射：`src/client/settings-access.ts` 的 `NAMESPACE_SECTIONS`
  里有 `'dsh-experience-model-params': 'modelParams'`。
- 服务依赖：`inject` 里的 `llm` **只有** model-params 用（`ctx.get('llm')`）；
  `credentials` 是 cli-mimic 在用，必须保留。

排除项：`families` / `defaultEfforts` 只出现在 `model-reasoning/*`、`config-sections.ts`、
`index.ts` 三处，是自包含的，可以整块删掉；`ExperienceSettingsCard` 里的 `ModuleCard`
被 6 个文件引用，**不能删**，只删 `ModelReasoningCard`。

**2. 陈旧类型产物**：`build:types` 原来是 `tsc -b`，属增量构建——删掉源文件后
tsc 只更新 `tsbuildinfo` 里记录的输出，不会清理已不存在源文件对应的旧输出。
所以每次删模块都会留下孤儿 `.d.ts`，直到有人手动清空 `lib/types`。

**3. client 半区门禁缺失**：`lib/client.js` 是浏览器 CJS bundle（执行时注册工厂到
`window.__ModuleLoader__`），Node 里直接 require 会因为没有 `window` 而失败，
所以之前没人做运行期检查。

## 解决方案

**删除**（14 个源文件 + 2 个脚本 + 1 篇文档）：

```
src/features/model-reasoning/   config.ts defaults.ts host.ts ops.ts remote.ts settings.ts
                                client/index.ts client/locales.ts client/ReasoningEditor.tsx
src/features/model-params/      host.ts settings.ts client/ModelParamsCard.tsx
src/features/auto-load-history/ client/index.ts client/AutoLoadHistoryCard.tsx
scripts/e2e-model-reasoning.mjs
scripts/verify-model-reasoning.mjs
docs/fix-auto-load-history-scroll-jank.md
```

**改接线**：

| 文件 | 改动 |
| --- | --- |
| `src/index.ts` | 去掉 3 个模块的 import / 导出 / 装配；schema 只剩 `hello`（旧 patch 兼容）+ `openFolder` + `cliMimic` + `mcpManager`；`inject` 去掉 `llm` |
| `src/features/config-sections.ts` | `CONFIG_SECTIONS` → `['cliMimic','mcpManager']`；`ConfigSections` 删四个键 |
| `src/client/index.ts` | 去掉两个 client 装配调用 |
| `src/features/module-toggles/client/index.ts` | `MODULES` 7 项 → 4 项 |
| `src/features/daily-optimization/client/DailyOptimizationSection.tsx` | `settingsCards` 只剩 3 张卡；注入面删 `remote`/`mrT`；删 `MODEL_PARAMS_NS` 及相关写入辅助 |
| `src/features/daily-optimization/client/index.ts` | 注入面同步去掉 `remote`/`mrT` |
| `src/features/settings/client/ExperienceSettingsCard.tsx` | 只删 `ModelReasoningCard`；`ModuleCard`/`CliMimicCard`/`MyRulesCard` 保留 |
| `src/client/settings-access.ts` | `NAMESPACE_SECTIONS` 删 `dsh-experience-model-params` |
| `scripts/verify-dsh-compat.mjs` | volatile 断言键改为 `cliMimic`/`mcpManager`；非 volatile 只剩 `openFolder` |

**修构建**：`build:types` 改成 `tsc -b --clean && tsc -b`，每次都从干净状态产出，
杜绝孤儿产物。

**加门禁**：新增 `scripts/verify-client-activate.mjs` —— 用最小 DOM + 最小 client ctx
在 Node 里复现浏览器的模块加载路径，断言 bundle 以正确 entry id 注册、`apply()` 不抛错、
「日用优化」分区正常注册且注入面键符合预期。已挂进 `pnpm verify` 与 README 验证清单。

**旧配置无需迁移**：schemastery 实测容忍未知顶层键
（`z.object({a,b})({a:{},b:{},c:[...]})` 的 `c` 原样透传），所以旧 patch 里残留的
`defaultEfforts` / `families` / `modelParams` 不会触发校验错误，没写兼容垫片。

## 验证结果

```
pnpm build                     host 116.5 kB -> 88.8 kB，client 258.6 kB -> 152.5 kB
tsc -b（--clean 后重建）        通过，无错误
lib 文件数                      150 -> 108，三个已删目录全部消失
lib/index.js + client.js       不含 ReasoningEditor / ModelParamsCard / AutoLoadHistory
verify-client-activate.mjs     全部通过（bundle 注册 / apply 不抛错 / 分区注册 / 注入面 5 键）
verify-mcp-installed.mjs       全部通过
verify-ctx-get.mjs             通过
verify-patch-edit.mjs          全部通过
verify-real-profile.mjs        真实配置验证通过
verify-dsh-compat.mjs          0.2.1-rc.2 隔离栈全绿（cliMimic/mcpManager 已标 volatile，openFolder 未标）
```

发布与部署：

```
npm 0.7.11  已发布但含 42 个陈旧 .d.ts（153 文件 / 756.9 kB）——作废
npm 0.7.12  干净版（111 文件 / 601.6 kB），dist-tags latest = 0.7.12
桌面端 profile  pin 0.7.12，实装 0.7.12，lib/*.js + package.json md5 与仓库一致
回滚备份       node_modules/dsh-experience-plugin/lib/*.bak-deploy-20261019060604
```

## 涉及表 / 源码位置 / 影响面 / 遗留问题

- **源码位置**：见上表；提交 `688d881`（删除三功能）、`e94f05f`（清理陈旧产物 + 修构建）。
- **影响面**：插件 host 与 client 两个包体积各降约 25% / 41%；设置页「日用优化 → 插件设置」
  从 6 张卡减到 3 张（CLI 请求模拟 / 设置页背景不透明 / 全局指令）；模块开关 7 项减到 4 项。
  移除的 RPC 通道：model-reasoning 的 `/dsh-experience-plugin` 子通道与 model-params 的
  `settings` 写入路径——外部无调用方。
- **遗留问题**：
  1. host 半区改动需**重启 DSH 桌面端**才生效（client 半区刷新页面即可）。
  2. `~/.dsh/profiles/web/cordis.patch.yml` 第 201/206 行还留着 `defaultEfforts` /
     `families` 两个已失效的键。schemastery 容忍未知键，不影响运行；那是用户另一份 profile
     的配置，未擅自改动。
  3. 隔离验收栈 `.compat/profiles/web` 用 `npm install --legacy-peer-deps` 会把
     `@deepseek-ai/dsh-*` 解析成 `0.2.1-alpha.2`，与 rc.2 运行时的版本闸门冲突，
     `dsh web` 起不来，所以浏览器 E2E 用 `verify-client-activate.mjs` 替代
     （只覆盖装配期，不覆盖 React 渲染期）。
  4. 用户所说「DSH 有更新了」在本机未得到印证：桌面端 `app.asar` 仍是 2026-10-17 17:20
     那份，`@deepseek-ai/dsh` 的 dist-tags 仍是 `latest 0.2.0-rc.2 / alpha 0.2.1-alpha.5 /
     next 0.2.1-rc.2`，没有比 0.2.1-rc.2 更新的版本；现有 peer 范围
     `^0.1.5-rc.1 || ^0.1.7-alpha.1 || ^0.2.0-rc.1 || ^0.2.1-alpha.1` 已覆盖
     0.2.1-rc.2 与 0.2.1-alpha.5，故未扩大范围。
