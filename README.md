# dsh-experience-plugin

DSH（DeepSeek Harness）功能插件：**功能按模块分配**（每个功能一个独立 feature 模块，
host 半区 / client 半区各自装配），当前包含两个功能：

| 功能 | 模块 | 说明 |
| --- | --- | --- |
| **model-reasoning**（思考等级自由配置） | `src/features/model-reasoning/` | 自定义 API 模型在选择模型时可自由选择思考等级，**按模型族自动配置**（deepseek / gpt-5 / grok / claude / glm …），UI 与官方完全一致 |

## 功能一：model-reasoning —— 自定义 API 模型思考等级

### 问题

官方模型选择器（ModelSelect）**只有在模型目录条目带有 `reasoning.efforts` 元数据时**才渲染
"思考等级"面板。该元数据来自 LLM 适配器（`dsh-llm-pi-ai`）的模型目录，而 pi-ai 只有模型
声明了 `reasoningEfforts` 才会暴露它。手声明的自定义 API 模型默认没有该声明 —— 所以选择模型时
看不到思考等级。

### 方案（UI 零改动，与官方完全一致）

插件在启动时（以及每次设置变化后）扫描 `~/.dsh/settings.yaml` 的 `llm-pi-ai.providers`，
为 **openai 系协议**（`openai-responses` / `openai-completions`）provider 下**未声明
`reasoningEfforts`** 的模型，自动按**模型族**写入思考等级（经 `ctx.settings.update`
深合并 patch：models 数组整体作为 value、其余字段原样保留，走 revision 校验 + 热重载）。
注入后：

1. pi-ai 模型目录暴露 `reasoning.efforts` → 官方 ModelSelect 自动出现思考等级面板
   （等级可选：Off / Low / Medium / High）；
2. 选择回传 `reasoningEffort` → pi-ai 按 `thinkingLevelMap` 把等级翻译成网关的 wire 参数
   （OpenAI 兼容网关透传给 claude / codex / grok / glm 等后端模型）。

写入效果（settings.yaml 中可见、可手改，等于自由配置）：

```yaml
llm-pi-ai:
  providers:
    codex:
      api: openai-responses
      baseURL: https://api.example.com/v1
      models:
        - id: grok-4.6
          reasoningEfforts:          # ← 插件自动注入（已声明的模型绝不覆盖）
            off: null                # 支持"不思考"（null = 不发送该参数）
            low: low
            medium: medium
            high: high
```

### 每个模型的等级怎么来（优先级从高到低）

1. **`effortsByApi[api]`**（插件配置）：协议级显式覆盖——配置了就以它为准；
2. **`familyPresets`**（插件配置）：按模型 id 正则匹配的自定义预设，排在内置知识库之前；
3. **内置模型族知识库**：按 id 前缀自动匹配（2026-08 调研）：

   | 族 | 思考等级 |
   | --- | --- |
   | gpt-5.6（gpt-5.6-luna / gpt-5.6-sol …） | Off / Minimal / Low / Medium / High / **XHigh** |
   | gpt-5 / o 系列 | Off / Minimal / Low / Medium / High |
   | deepseek / grok / claude / glm / qwen / gemini / llama / mistral | Off / Low / Medium / High |

   （gpt-5.6 在 OpenAI 侧开放 `none/minimal/low/medium/high/xhigh`，custom-gateway 把 ultra
   映射到 xhigh、`max` 会报 Invalid value —— 所以开放到 xhigh 为止，不开放 max。）
4. **协议兜底 / 全局兜底**：off / low / medium / high。

所以**在官方 Models 页新建模型保存后，插件会自动按模型 id 配好该族的思考等级**（热生效，
无需重启）；已注入过旧版统一值的模型会自动升级（gpt-5.6 补上 minimal+xhigh），用户手改过
的值绝不覆盖（`upgradeLegacy: false` 可关闭升级）。

### 设置页 UI：系列配置 + 模型等级（可折叠）

官方 Models 设置页刻意不做 reasoning-effort 控件（per-MODEL 能力），官方模型行编辑器也
没有 slot 注入点。插件按官方 slot 机制（`settings.section`）新增一个**"模型思考等级"**
设置页（与官方 Models 页并列，UI 用官方设计 token），两块内容都可折叠：

1. **系列配置**（存本插件 settings 命名空间 `dsh-experience-plugin`，schema 默认值 = 内置
   知识库，首次打开即为完整内置列表；设置页经官方通用 RPC 通道读写，因为
   dsh-host-apiproxy 不把第三方命名空间暴露给配置客户端）：
   - **默认配置**：关键词未命中任何系列时使用的等级（兜底）；
   - **系列列表**：25 个内置知名系列（OpenAI GPT-5.6 / GPT-5 / GPT-4、DeepSeek、
     Grok、Claude、GLM、Qwen、Gemini、Llama、Mistral、Doubao、Kimi、ERNIE、Spark、
     Baichuan、Yi、MiniMax、Hunyuan、Step、InternLM、Gemma、Phi、Command、
     Nemotron…）+ 可编辑名称 / 关键词正则 / 等级开关、可删除、可**添加自定义系列**；
   - 添加模型时：未声明 reasoningEfforts 的模型按 id 关键词自动匹配系列并配置等级；
     用户一旦保存过系列配置，完全以用户配置为准（删掉的系列不再生效，内置知识库
     不再兜底）；已注入的模型不会被自动改写，用模型行的"按系列刷新"按钮按当前
     系列重新配对（未命中时按默认配置）。
2. **模型等级**：llm-pi-ai 下所有 provider 的所有模型（Provider 卡片、模型行均可
   折叠）；每行显示命中的系列标签或"未匹配（用默认配置）"，可单独覆盖等级，
   并提供**按系列刷新**按钮（按当前系列配置重新配对该模型）。

保存经 `settings.update` 深合并写回（revision 冲突保护，其余字段保留），数据流与官方
Models 页一致（describe → 编辑 → update），只读部署自动禁用保存。

### 插件配置（`modelReasoning` 段）

```yaml
# cordis.patch.yml
# 行 id "hello" 是 dsh plugin add 生成的行标识，与本插件功能无关。
- id: hello
  name: dsh-experience-plugin
  config:
    modelReasoning:
      enabled: true        # 总开关
      autoInject: true     # 自动注入缺失的 reasoningEfforts
      effortsByApi: {}     # 协议级显式覆盖（key = provider.api 的值）；留空 = 按模型族匹配
      familyPresets:       # 用户自定义模型族预设（key = 匹配模型 id 的正则）
        '^my-(gpt|o)-':     # 例：把所有 my-gpt-* / my-o-* 模型配成 OpenAI 五档
          off: null
          minimal: minimal
          low: low
          medium: medium
          high: high
      providers: []        # 只处理列出的 provider 路由；空 = 全部
      upgradeLegacy: true  # 旧版统一默认值（off/low/medium/high）升级为族预设；默认 true
```

可选等级枚举（pi-ai 的 `ModelThinkingLevel`）：`off / minimal / low / medium / high / xhigh / max`。
默认各模型族只开放最兼容的档位；想开放更多等级，在 `familyPresets` 或 settings.yaml 里
按需添加（注意：仅 `off` 可留空值，其余等级必须给出 wire 字符串）。

### 关于"从网站获取模型思考等级"

**没有公开网站/API 提供"每个模型支持哪些思考等级枚举"**——这是协议知识，不是目录数据：

| 数据源 | 提供什么 | 缺什么 |
| --- | --- | --- |
| models.dev / LiteLLM（models.dev/api.json） | 每个模型的 `reasoning: true/false` 布尔标志 | 没有等级枚举 |
| OpenRouter（openrouter.ai/api/v1/models） | 模型的 reasoning 架构标志 | 没有等级枚举 |
| pi-ai 内置模型目录（本地） | 官方 provider（openai/anthropic/deepseek/google…）模型的 `thinkingLevelMap` | 覆盖不到自定义网关上的新模型 id |

所以插件把常见模型族的等级知识**内置**（deepseek / gpt-5 / grok / claude / glm / qwen /
gemini / llama / mistral），按 id 自动匹配；你的自定义网关模型（deepseek-v4-flash、
gpt-5.6-luna、grok-4.6 等）虽然在任何目录里都查不到，但族是能识别的。需要精确到单个
模型时，直接在 settings.yaml 的该模型下写 `reasoningEfforts`（插件绝不覆盖已声明值）。

### 行为细节

- **幂等**：只补缺失项；用户已声明（含 `reasoningEfforts: false` 声明为非推理模型）绝不覆盖；
  删除后会在下次文档变化时重新补上（可在配置里关闭 `autoInject`）。
- **协议白名单**：只有 `openai-responses` / `openai-completions` 会被自动注入；
  其它协议（如 anthropic）的 wire 拼写因后端而异，请手工配置。
- **热生效**：写入走 dsh-settings 服务（revision 校验），pi-ai 适配器逐请求重读配置，
  无需重启即可在模型选择器看到等级面板。

## 目录结构

```text
dsh-experience-plugin/
├── package.json        # dsh.bundle.patch + dsh.client 声明（插件包的核心元数据）
├── cordis.patch.yml    # 插件行（- insert: - id / name）
├── tsconfig.json       # tsc -b 产出 lib/types/*.d.ts
├── tsdown.config.ts    # node 半区 esm + client 半区 __ModuleLoader__ 包裹
├── src/
│   ├── index.ts                     # host 半区入口：装配所有功能 + 插件 Config
│   ├── client/index.ts              # browser 半区入口：装配 client 功能
│   └── features/
│       ├── model-reasoning/         # 功能一：思考等级（host 半区）
│       │   ├── host.ts              #   扫描 / 注入 / 重试 / 防抖
│       │   ├── ops.ts               #   纯函数：计算注入操作（可单测）
│       │   ├── config.ts            #   功能配置类型
│       │   └── defaults.ts          #   等级枚举 + 各协议默认等级表
├── src/features/model-reasoning/
│   ├── host.ts                     # host 半区：命名空间注册 / 扫描 / 注入 / 重试
│   ├── remote.ts                   # 系列配置 RPC 通道（connection.rpc）
│   ├── settings.ts                 # 系列配置命名空间 schema（默认=内置知识库）
│   ├── ops.ts                      # 纯函数：按系列计算注入 patch（可单测）
│   ├── defaults.ts                 # 内置系列知识库 + 默认等级表
│   └── client/                     # browser 半区："模型思考等级"设置页 UI
│       ├── index.ts                # 注册 settings.section
│       ├── ReasoningEditor.tsx     # 系列配置 + 模型等级（可折叠）+ 按系列刷新
│       └── locales.ts              # zh / en 文案
├── scripts/
│   ├── verify-model-reasoning.mjs  # 纯函数层验证（真实 settings.yaml + 模型族断言）
│   └── e2e-model-reasoning.mjs     # 真实栈端到端验证（settings-file + llm + pi-ai）
└── README.md
```

## 构建

```sh
pnpm install
pnpm build          # tsc -b && tsdown → lib/index.js + lib/client.js + lib/types
node scripts/verify-model-reasoning.mjs   # 可选：纯函数层验证
node scripts/e2e-model-reasoning.mjs      # 可选：真实栈端到端验证
```

## 安装到 profile（本地开发）

```sh
# 物理目录仍为 dsh-hello-plugin（历史路径），包名已改为 dsh-experience-plugin
dsh plugin --profile web add link:<project-path>
# 重启 dsh web 后生效
```

卸载：

```sh
dsh plugin --profile web remove dsh-hello-plugin
```

## 新增功能指引

| 想做什么 | 改哪里 |
| --- | --- |
| 加新工具 | `src/features/<name>/host.ts` 里 `defineTool` + `ctx.tools.register` |
| 加策略/审计 | `ctx.on('tools/pre-execute')`（允许/拒绝/询问）、`tools/post-execute`（改写结果） |
| 加 UI 部件 | `src/features/<name>/client.ts` 用 React + slots（参考官方 `dsh-client-ui-*` 包） |
| 加设置项 | host 半区用 `installSettingsSection`（参考 `dsh-live-stats`） |
| 发布到 npm | 本包名为 `dsh-experience-plugin`，`npm publish` 后即可 `dsh plugin add dsh-experience-plugin` |

## 参考

- 官方扩展手册：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md>
- 工具教程：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md>