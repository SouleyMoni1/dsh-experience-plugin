# dsh-experience-plugin

DSH（DeepSeek Harness）功能插件，按功能模块组织：

| 模块 | 功能 | 配置入口 |
|------|------|----------|
| 模型思考等级 | 为自定义 API 模型注入推理等级 | 设置页「日用优化」分区 |
| CLI 请求模拟 | 把 DSH 模型请求伪装成 Codex / Claude Code / Grok CLI | 设置页「日用优化」分区 |
| 打开文件夹 | 工作区行菜单打开项目目录 | 插件行 `openFolder` 段 |
| 消息时间轴 | 对话页左侧消息标记条 + 预览跳转 | 无需配置 |
| 消息折叠 | AI 工作过程一键收起/展开 | 无需配置 |
| 设置页全屏化 | 设置弹窗改全屏页 + 背景不透明开关 | 设置页「日用优化」分区 |
| 模块开关 | 各功能模块独立启停 | 设置页「日用优化」分区「模块开关」页签 |

所有配置 UI 统一收拢在设置页「日用优化」分区，含「插件设置」与「模块开关」两个页签。

## 安装

```sh
dsh plugin --profile web add dsh-experience-plugin
```

本地开发安装（Windows 跨盘符时先建 C 盘 junction）：

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

- `model-reasoning/`：模型思考等级
- `cli-mimic/`：CLI 请求模拟
- `open-folder/`：打开文件夹
- `timeline-rail/`：消息时间轴
- `msg-collapse/`：消息折叠
- `settings-page/`：设置页全屏化
- `module-toggles/`：模块开关
- `daily-optimization/`：设置页「日用优化」分区
- `settings/`：统一配置卡片

## License

MIT
