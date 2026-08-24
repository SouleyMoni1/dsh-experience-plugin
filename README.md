# dsh-experience-plugin

DSH（DeepSeek Harness）功能插件，按功能模块组织，共五个模块：

| 模块 | 功能 | 配置入口 |
|------|------|----------|
| 模型思考等级 | 为自定义 API 模型注入推理等级（reasoning effort） | 插件行 `modelReasoning` 段 + 官方插件配置页卡片 |
| CLI 请求模拟 | 把 DSH 模型请求伪装成 Codex / Claude Code / Grok CLI | `cli-mimic` settings 命名空间 + 官方插件配置页卡片 |
| 打开文件夹 | 工作区行三点菜单「打开文件夹」，用系统文件管理器打开项目目录 | 插件行 `openFolder` 段（默认开启） |
| 消息时间轴 | 对话页左侧短横线标记每条用户消息，hover 预览、点击跳转 | 无需配置（随插件自动启用） |
| 消息折叠 | 每个 AI 工作过程块上方折叠横条，一键收起/展开处理过程 | 无需配置（随插件自动启用） |

前两个模块的配置在官方插件配置页各占一个可收缩卡片，第三个模块在侧边栏工作区行的三点（⋯）菜单中提供入口，第四个模块在对话内容区左侧提供消息时间轴，第五个模块在对话内容区每个 AI 工作过程块上方提供折叠横条。

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

### 模块四：消息时间轴（timeline-rail）

在对话内容区左侧新增一条竖向消息时间轴，复刻 codex / zcode 桌面端交互：每条短横线代表一条你发送的消息，位置与对应消息在对话中的纵向位置对齐。

**功能特性**

- 对话区左侧竖向窄轨，每条短横线 = 一条用户消息，位置与消息逐像素对齐
- hover 短横线：平滑加长加深（3 / 2 / 1.5 倍级联），延迟 250ms 弹出预览卡片（淡入上浮动画）
- 快速移动鼠标划过横线时不弹卡片（延迟内移走即取消），停住才显示，避免卡片重叠
- 点击短横线：平滑滚动到对应消息位置
- 随消息流实时刷新，纯 DOM 浮层，不侵入官方布局
- 无需配置（随插件自动启用）

### 模块五：消息折叠（msg-collapse）

在对话内容区每个 AI 工作过程块上方插入一条浅色分割线横条，横条右侧是「已工作 X 分 X 秒 ›」总结按钮，一键收起/展开该回合的处理过程（Think / 工具调用 / 上下文注入）。

**功能特性**

- 每个回合的处理过程算一个块，横条插在块内第一个元素上方（用户消息之后）
- 默认：最新回合处理过程展开显示，历史回合处理过程折叠隐藏
- 点击横条独立折叠/展开该回合：折叠后只保留用户消息 + AI 最终回复（隐藏其 Think 标题，只留干净正文）+ 状态行
- 折叠/展开带平滑动画：工作过程淡入淡出 + 最终回复块上下滑动（Web Animations API 驱动）
- 发送新消息后自动折叠上一轮，保持对话清爽
- 自动加载历史到 20 条用户消息（保留原版「加载更早」按钮，可继续手动加载）
- 折叠状态跨 DSH 虚拟滚动/容器重建自动恢复（回合 key + 隐藏仓库），按钮和分界线不会丢失
- 无需配置（随插件自动启用）

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
- `src/features/timeline-rail/`：模块四，消息时间轴（client 短横线标记 + hover 预览 + 点击跳转）
- `src/features/msg-collapse/`：模块五，消息折叠（client 折叠横条 + 工作过程收起/展开 + 自动加载历史）
- `src/features/settings/`：官方插件配置页统一卡片（承载模块一 / 模块二的配置 UI）
- `scripts/`：验证脚本

## License

MIT
