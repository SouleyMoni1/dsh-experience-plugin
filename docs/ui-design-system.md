# 客户端界面设计系统（DSH 桌面端取向）

本插件所有设置界面（设置页「日用优化」分区及其全部卡片）共用一套设计系统。
改界面前先读本文，再动手。

**视觉基线不是猜的**：下面所有尺度都是从 DSH 桌面端官方设置页实测出来的
（导航单元格 215×40 / 12px 圆角 / 14px 字，右上角「打开配置文件」按钮 94×28 / 8px 圆角 / 12px 字，
搜索框 760×36 / 12px 圆角 / 13px 字，开关 36×20，分区标题 18px/600，说明文字 13px 弱化色，
面板内容内边距 0 36px 36px，几乎不用投影）。插件观感要贴着它，不做苹果式的胶囊按钮、
弹簧回弹、大圆角卡片和重投影。

## 文件

| 文件 | 职责 |
| --- | --- |
| `src/client/design/tokens.ts` | 设计令牌：间距/圆角/时长/缓动/语义色别名 + `ui` 布局与动态样式助手 |
| `src/client/design/styles.ts` | 注入式样式表：全部 `.dx-*` 类（静态外观 + 悬停/按压/焦点 + 关键帧动画） |
| `src/client/design/index.ts` | 统一出口（`ui` / `cx` / `ensureDesignStyles`） |
| `src/features/settings/client/ManagerKit.tsx` | 管理类列表的共用骨架（工具条 / 搜索 / 分组标题 / 行 / 编辑态 / 两步删除 / 开关）——MCP 管理与 Skills 管理必须共用，别再各写一套 |

样式表由 `src/client/index.ts` 的 `apply()` 幂等注入（`<style id="dsh-experience-design-system">`），
不引入任何 CSS 构建配置，client 半区仍是单文件 bundle。

## 两条硬规则

1. **静态外观一律用 `.dx-*` 类**：padding、圆角、边框、背景、字号、行高、字体、过渡、阴影。
   组件里不要再写这些属性的内联样式 —— 内联样式优先级高于类，会吃掉 `:hover` / `:active` /
   `:focus-visible` 和关键帧。
2. **内联 style 只写「随状态变化」的属性**：开关滑块位移（`ui.switchThumb`）、箭头旋转
   （`ui.chevron`）、进度宽度（`ui.meterFill`）、以及 flex/gap/width 等布局。

## 类速查

| 场景 | 用法 |
| --- | --- |
| 分区标题 / 说明 | `dx-section__title`（18px/600）/ `dx-section__intro`（13px 弱化色） |
| 工具条（搜索 + 操作） | `dx-toolbar` |
| 卡片外壳 | `className="dx-card"` + `data-hover="true"`（可展开卡片再加 `data-open` / `data-disabled`） |
| 卡片头部 / 标题 / 说明 / 箭头 / 内容区 | `dx-card__header`（另加 `dx-focus dx-tap`）、`dx-card__title`、`dx-card__desc`、`dx-card__chevron`（配 `ui.chevron(open)`）、`dx-card__body` |
| 分段控件（页签切换） | 容器 `dx-seg` + 内联 `--dx-seg-index` / `--dx-seg-count`（见 DailyOptimizationSection 的 `segVars`），滑块 `dx-seg__thumb`，按钮 `dx-seg__item` + `data-active` |
| 按钮 | `dx-btn dx-press dx-focus` + 变体 `dx-btn--primary` / `--secondary` / `--ghost` / `--danger` / `--link` / `--icon`，小号加 `dx-btn--sm`（默认 28px 高 / 8px 圆角 / 12px 字） |
| 表单 | `dx-label`（行内标签加 `dx-label--inline`）、`dx-input`（36px 高 / 12px 圆角 / 13px 字）、`dx-select`、`dx-textarea`（配置/JSON 另加 `dx-mono`）、`dx-check`（16px / 4px 圆角） |
| 开关 | `className="dx-switch dx-focus dx-tap"` + `style={ui.switchTrack(on)}`，滑块 `dx-switch__thumb` + `style={ui.switchThumb(on)}`（36×20，开启为品牌色） |
| 列表行 | `dx-row`（可点行加 `data-hover="true"`）、`dx-row__title`、`dx-row__desc`、行尾操作区 `dx-row__actions` |
| 徽标 | `dx-badge` + `--ok` / `--warn` / `--danger` / `--accent` / `--outline` |
| 提示 / 消息 / 空态 | `dx-hint`、`dx-msg`（`--error` / `--ok` / `--warn`）、`dx-empty` |
| 进度 / 分隔线 | `dx-meter` + `dx-meter__fill`（`style={ui.meterFill(pct)}`）、`dx-divider` |
| 滚动区 | `dx-scroll`（细滚动条） |
| 入场动效 | 内容块 `dx-fade`（120ms 淡入）；`dx-rise` / `dx-pop` 保留但只做极短淡入，不做位移回弹 |

## 主题与可访问性

- 所有颜色走 `--dx-*` 变量，变量兜底到 DSH 主题变量 `--dsw-alias-*`，
  皮肤、明暗主题自动跟随，插件不写死品牌色；
- 发丝描边用 `--dsw-alias-border-l3`（0.12）/ `-l4`（0.16），层级靠描边与灰底，不靠投影；
- 键盘可达性：可聚焦元素必须带 `dx-focus`（`:focus-visible` 3px 柔光光环）；
- `prefers-reduced-motion: reduce` 下动画与过渡自动关掉。

## 令牌

- 间距 `SPACE`（2/4/8/12/16/20/24/32）
- 圆角 `RADIUS`（4/8/10/12/16/999，与 `--dsw-radius-xs..xl` 同阶）
- 时长 `DUR`（70/120/180/240ms）、缓动 `EASE.out = cubic-bezier(0.2, 0, 0.2, 1)`（标准 ease-out，无回弹）
- 内容列：**通栏**（`ui.content` 只有 `width: 100%`，不设 max-width）。设置页被本插件拉成全屏后，再用 760px 定宽会在右侧留一大片空白；
  行列表用 `.dx-row-grid` 自适应多列（`minmax(520px, 1fr)`，列间距 32px、行间距 4px）吃满宽度：1608px 内容区正好两列、900px 窗口自动退回一列。
  `CONTENT_MAX_WIDTH = 1440` 只留给「确实要限宽」的窄容器场景。
