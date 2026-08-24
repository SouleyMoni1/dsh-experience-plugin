# dsh-experience-plugin

DSH（DeepSeek Harness）功能插件，按功能模块组织，共三个模块：

| 模块 | 功能 | 配置入口 |
|------|------|----------|
| 模型思考等级 | 为自定义 API 模型注入推理等级（reasoning effort） | 插件行 `modelReasoning` 段 + 官方插件配置页卡片 |
| CLI 请求模拟 | 把 DSH 模型请求伪装成 Codex / Claude Code / Grok CLI | `cli-mimic` settings 命名空间 + 官方插件配置页卡片 |
| 打开文件夹 | 工作区行三点菜单「打开文件夹」，用系统文件管理器打开项目目录 | 插件行 `openFolder` 段（默认开启） |

前两个模块的配置在官方插件配置页各占一个可收缩卡片，第三个模块在侧边栏工作区行的三点（⋯）菜单中提供入口。

---

## 功能模块

### 模块一：模型思考等级（model-reasoning）

为 `openai-responses` / `openai-completions` 协议下未声明 `reasoningEfforts` 的模型自动注入思考等级，并支持按模型族匹配与自定义预设。

**功能特性**

- 自动为未声明 `reasoningEfforts` 的模型注入思考等级
- 按模型族自动匹配：deepseek / gpt-5 / grok / claude / glm / qwen / gemini / llama / mistral 等
- 支持自定义系列预设、协议级覆盖、按系列刷新
- 官方插件配置页「模型思考等级」可收缩卡片

**配置**

```yaml
- id: hello
  name: dsh-experience-plugin
  config:
    modelReasoning:
      enabled: true
      autoInject: true
      familyPresets:
        '^my-(gpt|o)-':
          off: null
          minimal: minimal
          low: low
          medium: medium
          high: high
```

### 模块二：CLI 请求模拟（cli-mimic）

本地 HTTP 代理 + 全局 fetch 拦截，把 DSH 模型请求伪装成 Codex / Claude Code / Grok CLI。

**功能特性**

- 本地 HTTP 代理 + 全局 fetch 拦截
- 支持 Codex / Claude Code / Grok CLI 等请求指纹预设
- 官方插件配置页「CLI 请求模拟」可收缩卡片

**配置**

CLI 请求模拟配置保存在 `cli-mimic` settings 命名空间，由官方插件配置页的「CLI 请求模拟」模块读写：

```yaml
cli-mimic:
  enabled: false
  port: 4123
  host: 127.0.0.1
  upstreamBaseUrl: ""
  apiKeyEnv: EDENAIOS_API_KEY
  authorizationPrefix: Bearer
  userAgent: codex_cli_rs/0.148.0 (Windows 10.0; x86_64) WindowsTerminal
  originator: codex_cli_rs
  installationId: aad30239-28a2-451b-a4ed-7a4c5d6ab12b
  addClientMetadata: true
  extraHeadersJson: '{"openai-beta": "responses=experimental", "version": "0.148.0"}'
  extraBodyJson: "{}"
  activeProfileId: codex
  profiles: {}
```

### 模块三：打开文件夹（open-folder）

在侧边栏工作区行的三点（⋯）菜单中注入「打开文件夹」项（第二位），点击后用系统文件管理器打开该项目目录。

**功能特性**

- 工作区行三点菜单新增「打开文件夹」项（位于「重命名」之后、「删除工作区」之前）
- 用系统文件管理器打开项目目录：Windows `explorer` / macOS `open` / Linux `xdg-open`
- 只作用于工作区行菜单；会话行、视图选项等菜单保持原版，不受影响
- 只允许打开已注册 workspace 的路径（host 侧安全校验）

**配置**

```yaml
- id: hello
  name: dsh-experience-plugin
  config:
    openFolder:
      enabled: true
```

---

## 安装

```sh
dsh plugin --profile web add dsh-experience-plugin
```

本地开发安装（Windows 跨盘符时先建一个 C 盘 junction，避免 pnpm 对 `link:F:/...` 解析成错误路径）：

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\plugins\dsh-experience-plugin" -Target "<项目绝对路径>"
```

```sh
dsh plugin --profile web add link:C:/Users/<用户名>/.dsh/plugins/dsh-experience-plugin
```

## 构建

```sh
pnpm install
pnpm build
```

## 目录结构

按功能模块组织在 `src/features/` 下：

- `src/features/model-reasoning/`：模块一，模型思考等级（host 逻辑 + 配置编辑器 client）
- `src/features/cli-mimic/`：模块二，CLI 请求模拟（host 代理 + client 编辑器 + 预设）
- `src/features/open-folder/`：模块三，打开文件夹（host 调系统文件管理器 + client 菜单注入）
- `src/features/settings/`：官方插件配置页统一卡片（承载模块一 / 模块二的配置 UI）
- `scripts/`：验证脚本

## License

MIT
