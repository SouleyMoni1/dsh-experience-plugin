# 设置页「返回」按钮跑到顶部、顶部多出一条竖线（DSH 桌面端 0.2.2）

- 日期：2026-11-06
- 对象：dsh-experience-plugin —— 设置页全屏化（`src/features/settings-page/client/index.ts` + `src/client/design/styles.ts`）
- 触发：DeepSeek Harness 桌面端从 0.2.1 系列更新到 **0.2.2-rc.1**（插件仍是 0.7.12）

## 现象

用户更新桌面端后打开插件设置页：

1. 左下角本该在导航列底部的「返回」按钮**跑到了页面左上角**（和「设置」标题挤在同一行）；
2. 同一处**多出一条竖向短线**（只在标题行那一截）。

不是桌面端特有：用 0.2.2-rc.1 的 `dsh web` 起同样的 profile，Web 端同样复现；0.2.1-alpha.2 上一切正常。

## 原因

DSH 0.2.2 把官方设置面板的 DOM 结构改了（源码 `@deepseek-ai/dsh-client-ui-settings-general/lib/client.js`）：

| 版本 | panel 直接子节点 | 布局 |
| --- | --- | --- |
| 0.2.1 及更早 | `[nav[navTitle, navList], content[header, options]]` | 两栏 flex |
| 0.2.2 起 | `[navTitle, nav, header, options]` | 四区 CSS grid，`grid-template: "title header" "nav options" / 188px 1fr` |

插件原先按「panel 第一个子元素是 nav、最后一个子元素是内容列」来定位官方部件：

```ts
nav: panel.firstElementChild        // 0.2.2 里取到的是 div.navTitle（标题格）
content: panel.lastElementChild     // 0.2.2 里取到的是 div.options
options: panel.lastElementChild.lastElementChild  // 打到了分区内容节点上
```

于是：

- `ensureBackButton(panel, nav)` 把「返回」按钮 **append 进了标题格** → 按钮跑到顶部；
- 同一处被写了 `nav.style.borderRight = '1px solid …'` → 标题格右边**多出一条竖线**；
- 内容区 padding `0 36px 36px` 打到了 `options` 的最后一个子节点（分区内容）上，而不是滚动容器。

实测 0.2.2 打开设置后的 panel 子树（1920×897 视口）：

```
DIV  navTitle   240×54   (x=0,y=0)
NAV  nav        240×843  (x=0,y=54)   ← 官方导航列
DIV  header    1680×54   (x=240,y=0)
DIV  options   1680×843  (x=240,y=54)
```

## 解决方案

改为**按语义定位 + 按布局分支**，不再依赖子节点顺序：

1. `locateChrome()`
   - `nav`：`panel.querySelector(':scope > nav')`（两版都把导航渲染成 `<nav>`），兜底 `children[0]`；
   - `navTitle`：`document.getElementById(panel.getAttribute('aria-labelledby'))`（两版都用这个 id 指向标题）；
   - `layout`：`getComputedStyle(panel).display` 含 `grid` → 新版四区网格；否则旧版两栏；
   - 旧版仍按 `content = 最后一个子节点`、`options = content.lastElementChild` 取；新版直接取 panel 的最后一个子节点，`header` 用「既不是标题也不是 nav 也不是 options」的那个子节点。
2. `applyFullscreen()`
   - grid 版：`panel.style.gridTemplateColumns = '240px minmax(0,1fr)'` 把官方 188px 导航列放宽到 240px（窄窗口 <768px 不覆盖，官方会切成横向标签条）；`options`（滚动容器）设 `padding: 0 36px 36px`；`nav` 不再设 width/flex/border；
   - 旧版：保持原来的 nav 宽度 + content flex 逻辑；
   - 两版共同的「返回」按钮仍挂到 `nav`，靠 `.dx-nav-back{margin-top:auto}` 钉在列底。
3. 竖线改由样式层画：`panel` 加 `.dx-settings-panel` 类，`::after` 绝对定位画通高 1px 竖线，横向位置用 JS 写入的 `--dx-nav-w`（与导航列宽同源）。这样线不会落到官方任何子节点上，也不会随官方结构变化再错位。

改动文件：

- `src/features/settings-page/client/index.ts`：`SettingsChrome` 增加 `navTitle`/`layout`；`locateChrome` 重写；`applyFullscreen` 按 layout 分支。
- `src/client/design/styles.ts`：新增 `.dx-settings-panel` 与 `.dx-settings-panel::after`；删除原先写在 nav 上的内联 borderRight。

## 验证结果

用 **npm 安装的 0.2.2-rc.1 独立 profile**（`~/.dsh/profiles/verify022`，起 `dsh web --port 3099`）和 **0.2.1-alpha.2 的 web profile** 各跑一遍，实测几何：

| 项 | 0.2.2（模拟桌面端 `data-windows-titlebar` + 40px） | 0.2.1 |
| --- | --- | --- |
| panel | 1920×857，top=40（让出标题栏） | 1920×897，top=0 |
| 布局 | grid，列 `240px 1680px`，行 `54px 843px` | flex，nav 240 / content 1680 |
| 返回按钮 | `x=12, y=841, 216×40, bottom=881`，父节点 = NAV | 同左 |
| 竖线 | `::after` left=240px / 1px | 同左 |
| options padding | `0 36px 36px`（滚动容器） | 同左 |
| 顶栏拖拽条 | ::before 40px，`-webkit-app-region: drag` | — |

两版截图均正常：标题在左上、返回按钮在左下、列分隔线通高。

`pnpm build` 通过（client.js 178.60 kB），已同步到 desktop profile（hash `7E221F7AB8AA`，与仓库构建一致）；`node scripts/verify-dsh-compat.mjs` 全绿。

## 涉及文件 / 影响面 / 遗留问题

- 源码：`src/features/settings-page/client/index.ts`、`src/client/design/styles.ts`
- 影响面：仅「设置页全屏化」的几何改造；不碰官方 slot 注册、不碰配置读写。
- 遗留（**待确认**）：`package.json` 的 peerDependencies 只写到 `^0.2.1-alpha.1`，没覆盖 0.2.2 线；全新 `npm install` 会因 peer 冲突失败（本次验证时实测，只能 `--legacy-peer-deps` 绕过）。插件本身在 0.2.2 上运行正常，但发版前建议把 peer 范围补到 0.2.2。
- 遗留（待用户确认）：版本号仍是 0.7.12，本次修复未提交、未发版。
