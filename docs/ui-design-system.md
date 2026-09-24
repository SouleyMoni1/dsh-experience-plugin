# 客户端界面设计系统（Apple HIG 取向）

本插件所有设置界面（设置页「日用优化」分区及其全部卡片）共用一套设计系统。
改界面前先读本文，再动手。

## 文件

| 文件 | 职责 |
| --- | --- |
| `src/client/design/tokens.ts` | 设计令牌：间距/圆角/时长/缓动/语义色别名 + `ui` 布局与动态样式助手 |
| `src/client/design/styles.ts` | 注入式样式表：全部 `.dx-*` 类（静态外观 + 悬停/按压/焦点 + 关键帧动画） |
| `src/client/design/index.ts` | 统一出口（`ui` / `cx` / `ensureDesignStyles`） |

样式表由 `src/client/index.ts` 的 `apply()` 幂等注入（`<style id="dsh-experience-design-system">`），
不引入任何 CSS 构建配置，client 半区仍是单文件 bundle。

## 两条硬规则

1. **静态外观一律用 `.dx-*` 类**：padding、圆角、边框、背景、字号、行高、字体、过渡、阴影。
   组件里不要再写这些属性的内联样式 —— 内联样式优先级高于类，会吃掉 `:hover` / `:active` /
   `:focus-visible` 和关键帧。
2. **内联 style 只写「随状态变化」的属性**：开关滑块位移（`ui.switchThumb`）、箭头旋转
   （`ui.chevron`）、进度宽度（`ui.meterFill`）、错峰延迟（`ui.stagger`）、以及 flex/gap/width 等布局。

## 类速查

| 场景 | 用法 |
| --- | --- |
| 分区标题 / 说明 | `dx-section__title` / `dx-section__intro` |
| 卡片外壳 | `className="dx-card"` + `data-hover="true"`（可展开卡片再加 `data-open` / `data-disabled`） |
| 卡片头部 / 标题 / 说明 / 箭头 / 内容区 | `dx-card__header`（另加 `dx-focus dx-tap`）、`dx-card__title`、`dx-card__desc`、`dx-card__chevron`（配 `ui.chevron(open)`）、`dx-card__body` |
| 分段控件（苹果 segmented control） | 容器 `dx-seg` + 内联 `--dx-seg-index` / `--dx-seg-count`（见 DailyOptimizationSection 的 `segVars`），滑块 `dx-seg__thumb`，按钮 `dx-seg__item` + `data-active` |
| 按钮 | `dx-btn dx-press dx-focus` + 变体 `dx-btn--primary` / `--secondary` / `--ghost` / `--danger` / `--link` / `--icon`，小号加 `dx-btn--sm` |
| 表单 | `dx-label`、`dx-input`（`dx-focus`；数字框加 `dx-input--num`）、`dx-select`、`dx-textarea`（配置/JSON 另加 `dx-mono`）、`dx-check`（`dx-focus`） |
| iOS 开关 | `className="dx-switch dx-focus dx-tap"` + `style={ui.switchTrack(on)}`，滑块 `dx-switch__thumb` + `style={ui.switchThumb(on)}` |
| 列表行 | `dx-row`（可点行加 `data-hover="true"`）、`dx-row__title`、`dx-row__desc` |
| 徽标 | `dx-badge` + `--ok` / `--warn` / `--danger` / `--accent` |
| 提示 / 消息 / 空态 | `dx-hint`、`dx-msg`（`--error` / `--ok`）、`dx-empty` |
| 进度 | `dx-meter` + `dx-meter__fill`（`style={ui.meterFill(pct)}`） |
| 滚动区 | `dx-scroll`（细滚动条） |
| 入场动效 | 列表项 `className="dx-rise" style={ui.stagger(i)}`；面板/内容块 `className="dx-fade"`；弹出元素 `dx-pop` |

## 主题与可访问性

- 所有颜色走 `--dx-*` 变量，变量兜底到 DSH 主题变量 `--dsw-alias-*` / `--dsw-elevation-*`，
  皮肤、明暗主题自动跟随，插件不写死品牌色；
- 键盘可达性：可聚焦元素必须带 `dx-focus`（`:focus-visible` 柔光光环）；
- `prefers-reduced-motion: reduce` 下动画与缩放位移自动关闭。

## 令牌

- 间距 `SPACE`（8pt 网格：2/4/6/10/14/20/28/40）
- 圆角 `RADIUS`（8/10/14/18/999；全局已启用 `corner-shape: superellipse`，圆角即苹果连续曲率）
- 时长 `DUR`（90/160/280/460ms）、缓动 `EASE.spring = cubic-bezier(0.32, 0.72, 0, 1)`
- 内容列 `CONTENT_MAX_WIDTH = 980`（`ui.content`：定宽 + 水平居中）
