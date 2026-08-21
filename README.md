# dsh-experience-plugin

DSH（DeepSeek Harness）功能插件：合并模型思考等级与 CLI 请求模拟，两个模块的配置在官方插件配置页各占一个可收缩卡片。

## 功能

- 自动为 `openai-responses` / `openai-completions` 协议下未声明 `reasoningEfforts` 的模型注入思考等级
- 按模型族自动匹配：deepseek / gpt-5 / grok / claude / glm / qwen / gemini / llama / mistral 等
- 支持自定义系列预设、协议级覆盖、按系列刷新
- CLI 请求模拟：本地 HTTP 代理 + 全局 fetch 拦截，把 DSH 模型请求伪装成 Codex / Claude Code / Grok CLI
- 官方插件配置页两个可收缩模块：`模型思考等级` / `CLI 请求模拟`

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

## 配置

插件行配置只保留 `modelReasoning` 功能段：

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

CLI 请求模拟配置保存在 `cli-mimic` settings 命名空间，由官方插件配置页的 `CLI 请求模拟` 模块读写：

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

## 目录

- `src/features/model-reasoning/`：模型思考等级功能
- `src/features/cli-mimic/`：CLI 请求模拟功能
- `src/features/settings/`：官方插件配置页统一卡片
- `scripts/`：验证脚本

## License

MIT
