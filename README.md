# dsh-experience-plugin

DSH（DeepSeek Harness）功能插件，按功能模块组织：

| 模块 | 功能 | 配置入口 |
|------|------|----------|
| 模型思考等级 | 为自定义 API 模型注入推理等级与输入能力（文字 / 视觉） | 设置页「日用优化」分区 |
| 模型参数 | 按 Provider / 模型手动覆盖 temperature / maxTokens / reasoningEffort | 设置页「日用优化」分区 |
| CLI 请求模拟 | 把 DSH 模型请求伪装成 Codex / Claude Code / Grok CLI | 设置页「日用优化」分区 |
| 打开文件夹 | 工作区行菜单打开项目目录 | 插件行 `openFolder` 段 |
| 设置页全屏化 | 设置弹窗改全屏页 + 背景不透明开关 | 设置页「日用优化」分区 |
| 自动加载历史 | 打开会话时自动加载更早的对话历史 | 设置页「日用优化」分区 |
| 全局指令 | 设置页编辑此主机全局指令（~/.dsh/AGENTS.md） | 设置页「日用优化」分区 |
| MCP 管理 | 列出已安装的 MCP server（含 loader 装配的外部条目与实时工具面）+ 增删 / 导入 / 启停插件托管条目 + 关 / 卸载 profile 组合里的条目 | 设置页「日用优化」分区「MCP 管理」页签 |
| Skills 管理 | 增删 / 导入 / 启停 Skill | 设置页「日用优化」分区「Skills 管理」页签 |
| 模块开关 | 各功能模块独立启停 | 设置页「日用优化」分区「模块开关」页签 |

所有配置 UI 统一收拢在设置页「日用优化」分区，含「插件设置」「模块开关」「MCP 管理」「Skills 管理」四个页签。

## 输入能力（文字 / 视觉）

设置页「日用优化 → 插件设置 → 模型思考等级」里，每个系列和每个模型都有「输入能力」
开关（文字 / 视觉）。勾上「视觉」即向 `llm-pi-ai.providers.<route>.models[].input`
写入 `[text, image]`，DSH 的模型选择器与图片准入会立刻认识该模型。

解决的问题：自定义网关（edenai 这类中转）的 `/v1/models` 只返回 id，不公布能力
元数据；`edenai` 也不在 pi-ai 的内置目录里。于是 pi-ai 的模态解析链
`declaredInput(entry.input) ?? base?.input ?? [...request.defaultInput]` 一路落空到
路由级 `defaultInput`（默认 `['text']`）——模型明明能识图，DSH 却按纯文本处理，
发图时报「当前模型不支持图片」（`MODEL_DOES_NOT_SUPPORT_IMAGES`）。

注入规则（保守，零回归）：

- 只有系列/模型**显式声明**模态才写入；缺省不注入，保持 pi-ai 目录原样；
- 只在模型**完全没声明** `input` 时补（pi-ai 把缺省与空数组都视为「没配」）；
- 已有 `input` 的模型**绝不覆盖**。

> 注：`@anionex/dsh-vision-toolkit` 的变体路由只包装「已声明为纯文本」的模型
> （`shouldWrapModel` 要求 `inputModalities` 不含 `image`）。一旦这里声明了视觉，
> 该插件就不再为这个模型注册变体，两套机制自动协调、不冲突。且它的图片拦截只挂在
> `document` 的 `paste` 事件（捕获阶段），文件选择器 / 拖拽路径本就不覆盖。

### 两个必须知道的实现约束

**1. `settings.mutate` 的 `set` 是整体替换，不是深合并。**
`dsh-settings` 的 `applyPathOp` 对路径端点是 `{...section, [head]: op.value}`。
所以 `{op:'set', path:['providers'], value:{edenai:{models:[…]}}}` 会把
`api` / `baseURL` / `apiKeyEnv` / `displayName` 一并抹掉，被 pi-ai 校验拒绝
（`provider "edenai" model "…" needs an api`）。
`src/client/settings-access.ts` 的 `update()` 因此在客户端先读当前 user 段、
把 patch 深合并进去，再把合并结果整体 `set` 回去。

**2. `SettingsScope.mutate` 失败时不抛错。**
`dsh-client-ui-settings` 的 `mutate` 在 `!response.ok` 时只做一次 `recover()`
然后 `return`。不核对 revision 的话，写入失败会被静默吞掉，UI 假显示「已保存」。
`write()` 因此比较写入前后的 revision，未推进即判定为被拒绝。

## 安装

插件已发布到 npm（`dsh-experience-plugin`），两种安装方式：

**方式一：DSH 插件命令（推荐，自动从 npm 拉取）**

```sh
dsh plugin --profile web add dsh-experience-plugin
```

**方式二：直接 npm 安装**

```sh
npm install dsh-experience-plugin
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

## 浏览器 ↔ host 通信

host 与浏览器半区共用**一条**精确 Fetch 路由 `/api/dsh-experience-plugin`
（`connection.fetch.register`），各功能把逻辑通道登记进来，请求体为
`{ channel, endpoint, payload }` 信封，响应为 `ConnectionRpcResult` JSON。

> `connection.rpc.handle()` 在 0.1.5 里对第三方插件不可用：它内部是
> `owner.effect(() => owner.webServer.register(route))`，而 `owner` 恒为 connection
> 服务自身的 ctx（inject 只有 `credentials`），调用方注入 `webServer` 也无效。
> 官方 api-gateway 因此只走 `rpc.intercept('/api', …)`，而 `/api` 拦截器全局唯一，
> 第三方插件无法共用。`connection.fetch.register()` 是 0.1.5 里可用的官方扩展点，
> 并自动继承 Connection 的 Host/Origin 围栏与浏览器会话鉴权
> （官方 `dsh-client-file-upload` 同款用法）。

## 目录结构

按功能模块组织在 `src/features/` 下：

- `model-reasoning/`：模型思考等级 + 输入能力（文字 / 视觉）
- `model-params/`：模型参数手动覆盖
- `cli-mimic/`：CLI 请求模拟
- `open-folder/`：打开文件夹
- `settings-page/`：设置页全屏化
- `auto-load-history/`：自动加载历史
- `my-rules/`：全局指令（My Rules，读写 ~/.dsh/AGENTS.md）
- `mcp-manager/`：MCP server 管理
- `skill-manager/`：Skill 管理
- `module-toggles/`：模块开关
- `daily-optimization/`：设置页「日用优化」分区
- `settings/`：统一配置卡片
- `rpc-channel.ts`：host 侧唯一 RPC 入口路由（`connection.fetch.register`）

浏览器半区另在 `src/client/` 提供三个跨功能基础设施：

- `rpc-transport.ts`：`createExperienceRpc()`，与 host 入口路由配套的 RPC 调用器
- `settings-access.ts`：`settingsScope` 访问面封装（`describe` / `update` / `mutate`）
- `design/`：客户端界面设计系统（Apple HIG 取向的设计令牌 + `.dx-*` 类样式层），
  说明见 [docs/ui-design-system.md](docs/ui-design-system.md)；所有设置界面统一使用它

## 本地开发与部署（重要）

> **历史坑（0.7.2 已修复）：DSH 升级会让「已安装」区整个变空。**
> `0.7.1` / `0.8.0` 这两个已发布版本**都不含**「已安装（DSH 组合）」功能——它当时
> 只存在于本仓库源码。而 profile 用 `^0.7.1` 从 registry 引用，任何一次 `pnpm install`
> （DSH 升级会触发）都会把 profile 里的副本**还原回那份不含该功能的包**，
> 于是卡片照常渲染、但「已安装」列表为空。这不是 DSH 的兼容性破坏。
> **0.7.2 起该功能已随包发布**，正常升级即可，不再需要手动同步。

profile 用 `^0.7.x` 从 registry 引用本插件，pnpm 装出来的是**独立副本**
（硬链接到 pnpm store），**不是**指向本仓库的 junction。运行中的 DSH 读的就是那份副本，
所以只 `build` 不 `deploy`，改的代码永远不会生效：

```bash
pnpm build                                  # 产物落到 lib/
node scripts/deploy-to-profile.mjs          # 同步进 profile 的安装副本
node scripts/deploy-to-profile.mjs --dry    # 只看差异
```

部署脚本会先把原文件备份为 `*.bak-deploy-<时间戳>`，并**先删后拷**以断开硬链接
（直接覆盖会写进 pnpm store 的共享块，污染其他 profile）。

生效方式分两半：

- **client 半区**（`lib/client.js`）：刷新页面即生效，无需重启；
- **host 半区**（`lib/index.js`）：**必须重启 DSH Web**。profile 的 `patchReload: live`
  只重放 patch **配置**并复用已 import 的模块，而 `cordis-plugin-hmr` 的
  `partialReload` 明确跳过所有 `/node_modules/` 路径，因此 host 模块无法热载。

> 版本偏斜提醒：client 半区能独立热载而 host 不能，所以 client 必须容忍宿主响应里
> 缺失的新字段（例如 `mcp/manager/list` 的 `installed`）。漏了这层归一化会以
> `undefined.length` 炸掉整个设置页。

## 关 / 卸载已安装的 MCP server（写回 profile 组合）

「已安装（DSH 组合）」区的条目由 `cordis.patch.yml` 定义，属于**profile 组合层**而不是
插件注册表。本插件不接管它们，但可以在主人的授权下编辑主人自己的 patch 层：

| 操作 | 落到文件里的样子 | 生效方式 |
| --- | --- | --- |
| 关闭 | 追加 `- id: <entryId>` + `disabled: true`（可逆） | DSH 热重组，约 0.4s |
| 开启 | 摘掉插件自己追加的那段（回到原字节） | 同上 |
| 卸载 | 用 yaml 节点区间把条目定义整段切除 | 同上 |

三条硬约束：

1. **绝不调用官方 `loader.update()` / `entry.update()`**。那条路最终走
   `EntryTree.write()` → `Include.write()`，会把**整棵合成树**（bundles + 所有 patch 层）
   `yaml.dump` 回 patch 文件——主人手写的注释、`!!js` 表达式、分组结构全部丢失。
   所以只做文本级最小手术，逐字节保留其余内容。
2. **只改主人的 patch 层**，不碰 bundle 层文件。因此只有 `cordis.patch.yml` 里
   真正定义了 `insert` 条目的服务器才显示开关与卸载按钮（`editable: true`）；
   bundle 层来的条目只展示、标记为「外部」。
3. 生效靠官方 `watchUserPatches`（`dsh-app-boot` 监视该文件并事务性重组 patch 层），
   profile 的 `patchReload` 默认 `live`。这也是**唯一**被认可的热载路径。

写入前自动备份为 `cordis.patch.yml.bak-mcp-<时间戳>`，并用 `tmp` + `rename` 原子替换；
文件编码（UTF-8 无 BOM）、行尾（LF）在编辑前后保持一致。

> 定位方式：优先用运行时的配置基址 `ctx.baseUrl`（DSH boot 时设为配置文件所在目录，
> 即 profile 根），因此对 `node_modules` 副本与 `link:` 安装**都**成立；老运行时没有
> `baseUrl` 时才回退到从插件 URL 上溯三层（仅 `node_modules` 布局成立）。
> 两处都定位不到时返回 `null`，RPC 会拒绝操作而不是乱写文件。

## 验证脚本

```bash
node scripts/verify-dsh-compat.mjs       # ★ DSH 升级后先跑这个：用 profile 真实运行时验兼容
node scripts/verify-mcp-installed.mjs    # 假数据单测：三源合并 + 工具名切分 + editable 标记
node scripts/verify-real-profile.mjs     # 读真实 cordis.patch.yml 端到端验证
node scripts/verify-ctx-get.mjs          # 验证 ctx.get() 在未 inject 时可用
node scripts/verify-patch-locate.mjs     # 验证 patch 文件定位（上溯三层 + 仓库加载返回 null）
node scripts/verify-patch-edit.mjs       # patch 编辑器：注释/!!js 不丢、关开幂等、卸载边界
node scripts/verify-mcp-patch-rpc.mjs    # patch 端点行为 + 4 条拒绝路径无副作用
node scripts/verify-patch-live.mjs       # 真实闭环：改文件 → 进程真退出/回来 → 字节还原
node scripts/verify-patch-live.mjs --live  # 上面那个的真实改动模式（自动还原）
```

## License

MIT
