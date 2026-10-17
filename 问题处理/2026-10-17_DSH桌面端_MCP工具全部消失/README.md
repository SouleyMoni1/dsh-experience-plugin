# MCP 工具全部消失（DSH 桌面端更新到 0.2.1-rc.2 后暴露）

- 日期：2026-10-17
- 对象：DSH 桌面端 `D:\A-EdenChen\App\DSHDisk`（0.2.0-rc.2 → **0.2.1-rc.2**），profile `~/.dsh/profiles/desktop`
- 插件：`dsh-experience-plugin` 0.7.9 → **0.7.10**

## 现象

- 主人报「桌面端更新版本了，mcp 工具那里识别不出来了」。
- 设置在「日用优化 → MCP 管理」，列表为空。
- 会话里 `mcp__fastctx__*`、`mcp__chrome-devtools__*`、`mcp__cua-driver__*`、`mcp__github__*` 四组工具全部消失。
- 进程检查：没有任何 MCP 子进程在跑。

## 原因

MCP 服务器**不是插件自带的**，定义在 profile 的 `cordis.patch.yml` 顶层 `- insert:` 列表里，每条形如
`{id, name: '@deepseek-ai/dsh-mcp-client', config: {serverName, transport, command, args, env}}`。

**该文件的整段 `- insert:` 块（4 个 mcp-client 条目）丢了**，所以 loader 里没有 MCP 条目，
工具自然没有，插件「MCP 管理」读的也正是同一批 loader 条目，因此一并变空。

**丢失时间窗**（用 profile 目录里的历史备份夹逼）：

| 备份 | 时间 | 行数 | MCP 条目 |
| --- | --- | --- | --- |
| `cordis.patch.yml.bak-1792220412492` | 10-15 17:15 | 238 | **4（完好）** |
| `cordis.patch.yml.bak-1792220569207` | 10-17 15:00 | 22 | 0 |
| `bak-remote-disable-20261017-180028` 等 | 10-17 18:00–18:06 | 92 → 97 | 0 |

即**条目在 10-17 15:00 之前就已经丢了**；桌面端 17:20 更新到 0.2.1-rc.2 并重启，重启时重新读
已被清空的 patch，MCP 才真正消失。所以「更新后才出问题」是**暴露时间**，不是诱因。

**写入方归属**：本插件 patch 编辑器的备份名是 `cordis.patch.yml.bak-mcp-<时间戳>`，
现场**没有任何该前缀的文件**；存在的是 `bak-remote-disable-*` / `bak-remote-off-*`（另一插件）
与 epoch 式命名。故本次丢失不是本插件写入造成；本插件的写入行为另有 `verify-patch-edit` 覆盖
（纯追加 / 就地翻转，不丢他人注释与 `!!js`）。

**为什么不是插件坏了**：把 4 个条目补回后一切正常；且在 0.2.1-rc.2 隔离栈上
`verify-dsh-compat` 全绿（见验证结果），说明识别逻辑对新版本依旧有效。

## 解决方案

1. **恢复数据**：从 10-15 17:15 的完好备份里取出 `- insert:` 块（原 146–205 行），
   **只追加该块**到当前 patch，不动其它条目——当前 patch 的 `ui-chat` 等取值与 10-15 不同，
   说明主人之后重新配过，不能整体回滚。写入前备份为
   `cordis.patch.yml.bak-pre-mcp-restore-<时间戳>`，保持 UTF-8 无 BOM + LF。
   脚本见同目录 `restore-mcp.cjs`（原样留档）。
2. 确认 DSH 0.2.1 **仍支持该格式**：它自己生成的 patch 头部注释明确写着
   "id-targeted config overrides, disables, and **insert lists**"。
   改完由 `watchUserPatches` 热重组，**无需重启**。
3. **插件补齐兼容声明**：`peerDependencies` 追加 `^0.2.1-alpha.1`，版本升到 0.7.10（小版本）。

## 验证结果

1. 写入后 8 秒内 4 个 MCP 子进程全部拉起（热重组生效）：
   - `fastctx.exe serve --enable-shell`
   - `cua-driver.exe mcp`
   - `github-mcp-server-1.12.2.exe stdio --toolsets=default,git`
   - `node ...chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js`
2. patch YAML 可解析（含 `!!js` 标签），顶层 8 条 + insert 4 条，`serverName` 全部正确。
3. 隔离栈（`@deepseek-ai/dsh@0.2.1-rc.2` + cordis 4.0.5 + loader 1.0.6 + dsh-settings 0.2.1-rc.2）
   跑 `verify-dsh-compat`：**全绿**，其中
   `collectInstalledMcpServers 认出全部服务器`、
   `dispatchMcpManagerRpc 返回 ok`、`响应 installed 覆盖全部服务器` 均通过，
   已安装清单为 `chrome-devtools(1) cua-driver(1) fastctx(1) github(1)`。
4. 契约比对（防漏判新版本）：
   - `dsh-settings@0.2.1-rc.2` 的 `volatile` 机制、命名空间解析
     （`configEditor.entries()` 里 `options.id === ns`）、三条报错文案与 0.1.7 / 0.2.0 线**逐字一致**；
   - `cordis-plugin-loader@1.0.6` 的 `Entry.options` / `entries()` / `disabled` **形状未变**。
5. 插件版本：`package.json` 0.7.10，peer 范围经 semver 实测覆盖
   `0.1.5-rc.3 / 0.1.7-rc.2 / 0.2.0-rc.2 / 0.2.1-alpha.5 / 0.2.1-rc.2 / 0.2.1`。

## 涉及位置

- profile patch：`~/.dsh/profiles/desktop/cordis.patch.yml`
- 完好备份：`cordis.patch.yml.bak-1792220412492`
- 恢复脚本：`restore-mcp.cjs`（同目录）
- 插件源码：`src/features/mcp-manager/patch-file.ts`（文本级编辑，保注释与 `!!js`）、
  `src/features/mcp-manager/host.ts`（`collectInstalledMcpServers`）
- 验收脚本：`scripts/verify-dsh-compat.mjs`、`scripts/verify-patch-edit.mjs`
- README 已补「MCP 条目住哪儿（排查用）」章节

## 影响面

- 只影响该 profile 的 MCP 工具可用性，不影响 DSH 本体与插件其它功能。
- 同一次清空还带走了 `- id: dsh-experience-plugin` 配置条目与 `- id: ui-conversation`（`busyEnter: steer`）。
  前者插件有内置默认值，影响有限；**后者未恢复**（不在本次诉求内，且主人之后可能另有取值）。

## 遗留问题

- 到底是谁清空了 patch，未最终定位：现场存在多个第三方写入方。本插件写入路径已验证为
  「不丢他人内容」，非本插件所为。若再次发生，先看 `bak-remote-*` 类备份的时间点。
- 插件「MCP 管理」目前只反映 loader 现状，没有「从备份恢复条目」的入口。主人若需要可后续加。
- 顺带修掉 `verify-patch-edit.mjs` 里写死 `mcp-dbhub` 的断言（改为按基线取样），
  否则 `DSH_PROFILE_DIR` 换个 profile 就会假失败。
