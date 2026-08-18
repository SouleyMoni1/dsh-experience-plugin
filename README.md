# dsh-experience-plugin

DSH（DeepSeek Harness）功能插件：为自定义 API 模型自动配置思考等级，并提供官方风格的设置页。

## 功能

- 自动为 `openai-responses` / `openai-completions` 协议下未声明 `reasoningEfforts` 的模型注入思考等级
- 按模型族自动匹配：deepseek / gpt-5 / grok / claude / glm / qwen / gemini / llama / mistral 等
- 支持自定义系列预设、协议级覆盖、按系列刷新
- 设置页与官方 Models 页并列，UI 风格一致，保存后热生效

## 安装

```sh
dsh plugin --profile web add dsh-experience-plugin
```

## 构建

```sh
pnpm install
pnpm build
```

## 配置

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

## 目录

- `src/features/model-reasoning/`：功能实现
- `scripts/`：验证脚本

## License

MIT
