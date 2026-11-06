/**
 * dsh-experience-plugin —— 客户端设计令牌（对齐 DSH 桌面端设计语言）。
 *
 * 分工（务必遵守，否则风格会散）：
 *  - 颜色/边框一律映射到 DSH 主题变量（--dsw-alias-*），皮肤、主题、暗色模式
 *    自动跟随；本文件的 C / SHADOW 只是这些变量的语义别名（--dx-* 在 styles.ts 定义）。
 *  - 静态外观（padding / 圆角 / 边框 / 背景 / 字号 / 过渡）全部由 styles.ts 的
 *    `.dx-*` 类承担，组件只写 className，不要再用内联 style 覆盖它们；
 *    内联 style 只用于「随状态变化」的属性（开关位移、箭头旋转、进度宽度…）。
 *  - 尺度取自 DSH 官方设置页实测：控件高 28/36px，圆角 8/12/20px，
 *    字阶 12/13/14/18px，行内边距 12/16px，基本不用阴影。
 */
import type { CSSProperties } from 'react'

/** 间距（px），与 DSH 的行内边距节奏一致。 */
export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  huge: 32,
} as const

/** 圆角（px）：4 / 8 / 12 / 16 / 20，与 --dsw-radius-* 同阶。 */
export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  pill: 999,
} as const

/** 动效时长：DSH 界面是快节奏的，不做慢速弹簧。 */
export const DUR = {
  press: '70ms',
  fast: '120ms',
  base: '180ms',
  slow: '240ms',
} as const

/** 缓动曲线（标准 ease-out，无回弹）。 */
export const EASE = {
  spring: 'cubic-bezier(0.2, 0, 0, 1)',
  out: 'cubic-bezier(0.2, 0, 0.2, 1)',
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const

/** 语义色（指向 styles.ts 注入的 --dx-* 变量，变量本身兜底到 DSH 主题变量）。 */
export const C = {
  label1: 'var(--dx-label-1)',
  label2: 'var(--dx-label-2)',
  label3: 'var(--dx-label-3)',
  hairline: 'var(--dx-hairline)',
  hairlineStrong: 'var(--dx-hairline-strong)',
  surface: 'var(--dx-surface)',
  surface2: 'var(--dx-surface-2)',
  accent: 'var(--dx-accent)',
  accentText: 'var(--dx-accent-text)',
  success: 'var(--dx-success)',
  danger: 'var(--dx-danger)',
  warn: 'var(--dx-warn)',
  hoverWash: 'var(--dx-hover-wash)',
} as const

/** 阴影语义别名：DSH 用发丝描边代替投影，这里统一为无阴影。 */
export const SHADOW = {
  card: 'none',
  hover: 'none',
} as const

/** 常用 transition 简写（写进内联 style 时用；类里已带全套过渡）。 */
export const T = {
  colors: `background-color ${DUR.fast} ${EASE.out}, border-color ${DUR.fast} ${EASE.out}, color ${DUR.fast} ${EASE.out}`,
  spring: `transform ${DUR.base} ${EASE.spring}`,
} as const

/**
 * 内容列最大宽度（px）—— 仅作「窄容器里渲染」时的兜底上限。
 *
 * 实际默认是**通栏**：本插件把设置弹窗拉成了全屏页，再用 760px 定宽列会在
 * 右侧留一大片空白（用户明确反馈过）；官方通用设置的分组行本身也是通栏的。
 * 所以 ui.content 不设上限，只有确实需要限制行宽的地方才引用这个常量。
 */
export const CONTENT_MAX_WIDTH = 1440

/** 等宽字体栈（配置/JSON 文本域用）。 */
export const MONO_FONT = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

/**
 * 通用样式助手：只放「布局」与「随状态变化」的属性。
 * 所有静态外观请用 styles.ts 的 dx-* 类。
 */
export const ui = {
  /** 纵向堆叠。 */
  stack: (gap: number = SPACE.md): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap }),
  /** 横向排列（垂直居中）。 */
  hstack: (gap: number = SPACE.md): CSSProperties => ({ display: 'flex', alignItems: 'center', gap }),
  /** 撑满剩余宽度。 */
  grow: { flex: 1, minWidth: 0 } as CSSProperties,
  /** 单行省略。 */
  ellipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  /** 内容列：撑满设置页内容区（全屏页不做定宽居中，避免右侧大片空白）。 */
  content: { width: '100%', boxSizing: 'border-box' } as CSSProperties,
  /** 错峰入场延迟：DSH 不做逐个浮入，统一为 0（保留签名，避免调用点改动）。 */
  stagger: (_i: number): CSSProperties => ({}),
  /** 折叠箭头旋转（过渡由 .dx-card__chevron 类承担，避免内联覆盖类过渡）。 */
  chevron: (open: boolean): CSSProperties => ({
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
  }),
  /** 开关轨道（36×20）。 */
  switchTrack: (on: boolean): CSSProperties => ({
    background: on ? 'var(--dx-accent)' : 'var(--dx-switch-off)',
    transition: `background-color ${DUR.base} ${EASE.out}`,
  }),
  /** 开关滑块（16px，位移 16px）。 */
  switchThumb: (on: boolean): CSSProperties => ({
    transform: on ? 'translateX(16px)' : 'translateX(0)',
    transition: `transform ${DUR.base} ${EASE.out}`,
  }),
  /** 进度条填充宽度。 */
  meterFill: (pct: number): CSSProperties => ({ width: `${Math.max(0, Math.min(100, pct))}%` }),
} as const
