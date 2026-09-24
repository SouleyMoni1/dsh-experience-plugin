/**
 * dsh-experience-plugin —— 客户端设计令牌（Apple HIG 取向）。
 *
 * 分工（务必遵守，否则风格会散）：
 *  - 颜色/阴影/边框一律映射到 DSH 主题变量（--dsw-alias-*），皮肤、主题、
 *    暗色模式自动跟随，插件不写死品牌色；本文件的 C / SHADOW 只是这些变量的
 *    语义别名（--dx-* 在 styles.ts 里定义）。
 *  - 静态外观（padding / 圆角 / 边框 / 背景 / 字号 / 过渡）全部由 styles.ts 的
 *    `.dx-*` 类承担，组件只写 className，不要再用内联 style 覆盖它们；
 *    内联 style 只用于「随状态变化」的属性（开关位移、箭头旋转、进度宽度…）。
 *  - SPACE / RADIUS / DUR / EASE 是本插件自己的工艺参数（8pt 网格 + 苹果缓动），
 *    集中在这里，保证所有卡片与控件同一个节奏。
 */
import type { CSSProperties } from 'react'

/** 8pt 网格间距（px）。 */
export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 28,
  huge: 40,
} as const

/** 圆角（px）。全局已启用 corner-shape: superellipse，圆角即苹果「连续曲率」。 */
export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 980,
} as const

/** 动效时长。 */
export const DUR = {
  press: '90ms',
  fast: '160ms',
  base: '280ms',
  slow: '460ms',
} as const

/** 缓动曲线；spring 为苹果公布的弹簧近似曲线（WWDC 2018）。 */
export const EASE = {
  spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
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

/** 阴影语义别名。 */
export const SHADOW = {
  card: 'var(--dx-shadow-card)',
  hover: 'var(--dx-shadow-hover)',
} as const

/** 常用 transition 简写（写进内联 style 时用；类里已带全套过渡）。 */
export const T = {
  colors: `background-color ${DUR.fast} ${EASE.out}, border-color ${DUR.fast} ${EASE.out}, color ${DUR.fast} ${EASE.out}`,
  spring: `transform ${DUR.base} ${EASE.spring}`,
} as const

/**
 * 内容列最大宽度（px）：Apple 官网经典的 980px 栅格。
 * 设置页不动辄 1600px 通铺，文字行宽落在舒适阅读区间。
 */
export const CONTENT_MAX_WIDTH = 980

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
  /** 内容列（980px 栅格，水平居中）。 */
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, margin: '0 auto', boxSizing: 'border-box' } as CSSProperties,
  /** 错峰入场延迟（卡片/行依次浮入）。 */
  stagger: (i: number): CSSProperties => ({ animationDelay: `${Math.max(0, i) * 45}ms` }),
  /** 折叠箭头旋转（过渡由 .dx-card__chevron 类承担，避免内联覆盖类过渡）。 */
  chevron: (open: boolean): CSSProperties => ({
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
  }),
  /** iOS 开关轨道。 */
  switchTrack: (on: boolean): CSSProperties => ({
    background: on ? 'var(--dx-success)' : 'var(--dx-switch-off)',
    transition: `background-color ${DUR.base} ${EASE.out}`,
  }),
  /** iOS 开关滑块。 */
  switchThumb: (on: boolean): CSSProperties => ({
    transform: on ? 'translateX(18px)' : 'translateX(0)',
    transition: `transform ${DUR.base} ${EASE.spring}`,
  }),
  /** 进度条填充宽度。 */
  meterFill: (pct: number): CSSProperties => ({ width: `${Math.max(0, Math.min(100, pct))}%` }),
} as const
