/**
 * dsh-experience-plugin —— 客户端设计系统出口。
 *
 * 组件统一从这里取：
 *   - `ui` / `SPACE` / `RADIUS` / `C`：布局与动态样式助手、设计令牌；
 *   - `cx`：className 拼接；
 *   - `ensureDesignStyles()`：幂等注入 `.dx-*` 样式表（组件入口调用一次即可）。
 *
 * 视觉约定（改界面前务必读 src/client/design/styles.ts 顶部注释）：
 * 静态外观全部由 `.dx-*` 类承担，内联样式只写「随状态变化」的属性。
 */
export * from './tokens.js'
export { cx, ensureDesignStyles, DS_STYLE_ID } from './styles.js'
