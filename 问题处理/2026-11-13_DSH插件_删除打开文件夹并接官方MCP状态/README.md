# 删除「打开文件夹」改用官方能力 + MCP 管理接官方 mcp-manager 状态

- 日期：2026-11-13
- 对象（单号 / 环境 / 版本）：dsh-experience-plugin 0.7.13 → 0.7.14；DSH 桌面端 0.2.2-rc.2
- 处理人：lead（AI 协助）

## 现象

用户两条要求：

1. 「打开文件夹」功能删掉，改用官方的；
2. MCP 管理「看看能不能优化优化」。

## 原因

### 1. 打开文件夹：官方 0.2.2 已内置，插件那份是重复实现

证据（从桌面端 `app.asar` 提取的官方源码）：

- `dsh-web-app/cordis.patch.yml:73,84` 挂载 `dsh-host-open-in-app` + `dsh-client-ui-open-in-app`；
- `ui-open-in-app/src/client/context-menus.tsx:74` 注册 `{ id: 'open-in-app.workspace', target: 'workspace', order: 200 }`；
- `dsh-client-ui-workspace/README.md:80` 明确「原生目录揭示由 ui-open-in-app 提供」。

即工作区行 ⋯ / 右键菜单里已经自带「在…中打开」（可选编辑器 / Git GUI / 终端 / 文件管理器），
插件再往同一个菜单 DOM 注入一项就成了重复项，且官方换 DOM 时插件会静默失效。

### 2. MCP 管理：host 能力被官方接管，插件只有「板 + patch 层手术」还有价值

- `dsh-web-app/cordis.patch.yml:153-155` 挂载 `@deepseek-ai/dsh-mcp-manager`（id `mcp`，服务名 `mcpManager`）：
  按 serverName 维护连接状态、提供 `list()` / `restart()` / `probe()` / `watch()`；
- 但官方没有任何 MCP 管理 UI（`dsh-client-ui-*/src` 里 `mcp` 零命中），设置页只能给
  「通用配置表单」；
- 插件原来的问题：判断「连上没有」只看工具面里有没有 `mcp__<name>__*`——起不来的服务器
  （无 loader 条目、无工具）在 UI 里**整条消失**，失败原因更看不到。

## 解决方案

### 删除 open-folder（9 处挂载点全部收口）

| 位置 | 动作 |
| --- | --- |
| `src/features/open-folder/{host,client/index}.ts` | 整目录删除（142 + 268 行） |
| `src/index.ts` | 删 import / export / schema 里的 `openFolder` 段 / `applyOpenFolderHost()` 调用 / 文档注释（config 示例改 `cliMimic`） |
| `src/client/index.ts` | 删 import 与 `isModuleEnabled('open-folder')` 调用；`inject` 去掉只为它引入的 `workspaces` |
| `src/features/config-sections.ts` | 删 `ConfigSections.openFolder` |
| `src/features/module-toggles/client/index.ts` | `MODULES` 删一项，头部注释同步 |
| `scripts/verify-dsh-compat.mjs` | 删「alpha 线 openFolder 未标 volatile」检查 |
| `scripts/verify-client-activate.mjs` | 注释不再提 open-folder |
| `README.md` | 模块表 / 目录结构 / 0.7.14 迁移说明 |

schema 删除是破坏性的：`z.object` 拒绝未知键，旧 patch 里若留着 `openFolder:` 会让插件装配失败。
已核对两个 profile（desktop / web）的 `cordis.patch.yml` 都没有该键，README 里也写了迁移提示。

### MCP 管理接官方运行时（`mcpManager`，不写进 inject）

| 新增 | 内容 |
| --- | --- |
| `mcpManagerService(ctx)` | `ctx.get('mcpManager')` 探测；老版本没有该服务 → 全程降级（行为同 0.7.13） |
| `collectRuntimeStatuses(ctx)` / `normalizeRuntimeStatus()` | 把官方 6 种 `McpConnectionStatus` + 管理器自有 `disabled` / `failed(load\|cleanup)` 压平成 `{ state, configured, toolCount, attempt, maxAttempts, nextRetryAtMs, lastError, reason }`；cleanup 的诊断从 `result.cleanupError` 里取 |
| `mergeRuntimeServers()` | 把官方 `list()` 里 `configured=true` 而 loader/工具面都扫不到的服务器补进「已安装」清单（以前这类整条消失） |
| `mcp/manager/list` 响应 | 新增 `runtime: Record<serverName, McpRuntimeStatus>` |
| `mcp/manager/restart` / `mcp/manager/probe` | 转发官方 `restart()` / `probe()`；`normalizeProbe()` 压平失败阶段 / 耗时 / 工具名；不由官方管的条目返回明确错误（提示改用条目开关） |
| 卡片 | 已安装行徽标改用真实状态（connected→`n 个工具`、connecting、reconnecting 第 n 次、failed 带原因、disabled、waiting-credentials）；失败原因进描述；⚡ 测试 / ⟳ 重启 |

## 验证结果

```
$ pnpm build
lib\index.js 107.20 kB   lib\client.js 173.75 kB   （删 open-folder 前 client 178.60 kB）

$ node scripts/verify-dsh-compat.mjs         → DSH 兼容性验证通过
$ node scripts/verify-mcp-runtime.mjs        → 全部通过（40 项断言）
$ node scripts/verify-mcp-installed.mjs / verify-ctx-get / verify-client-activate
  / verify-patch-locate / verify-patch-edit  → 全 OK

$ DSH_PROFILE_DIR=.../desktop node scripts/deploy-to-profile.mjs  → index.js + client.js 已更新
$ DSH_PROFILE_DIR=.../web     node scripts/deploy-to-profile.mjs  → 同上
副本 package.json 版本已同步 0.7.14
```

`verify-mcp-runtime.mjs` 覆盖：6 种官方状态压平（含 cleanup 的嵌套诊断）、服务缺席降级、
清单补全（`configured=false` 的残留不补）、restart/probe 三种分支（正常 / 未归官方管 / 无服务）、
probe 成功与失败与截断标记。

**未完成**：host 半区必须重启 DSH 才会生效，重启前的真实界面（新徽标 / ⚡ / ⟳）尚未截图。

## 涉及表 / 源码位置 / 影响面 / 遗留问题

- 源码位置：`src/index.ts`（schema + 装配）、`src/client/index.ts`（inject）、
  `src/features/mcp-manager/host.ts`（新端点与状态归一）、
  `src/features/mcp-manager/client/McpManagerCard.tsx`（徽标与操作）、
  `scripts/verify-mcp-runtime.mjs`（新增）
- 影响面：插件公开 API 少 `applyOpenFolderHost` / `OpenFolderConfig` 导出；
  `mcp/manager/list` 多 `runtime` 字段（**新增字段，老 client 不受影响**）；
  新增两个端点。老版本 DSH（< 0.2.2）行为不变。
- 遗留问题：
  1. `scripts/verify-mcp-patch-rpc.mjs`、`scripts/verify-patch-live.mjs` 失败，**与本次改动无关**：
     两者以 `~/.dsh/profiles/web/cordis.patch.yml` 为固定夹具并假设里面有 `mcp-dbhub`，
     而该文件现在 `grep -c dbhub` = 0（web profile 已不再配 MCP）。断言 `卸载后 dbhub 仍在`
     与 `基线：dbhub 在跑` 必然失败。要修就改成「夹具里实际存在的条目」或改为纯内存夹具。
  2. 重启后补真实界面截图（设置页 → 日用优化 → MCP 管理：徽标 / 失败原因 / ⚡ / ⟳）。
