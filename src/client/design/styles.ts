/**
 * dsh-experience-plugin —— 客户端样式层（注入一张 <style>，零构建配置改动）。
 *
 * 为什么要有样式层：内联 style 表达不了 :hover / :active / :focus-visible /
 * 关键帧动画，而这些正是「Apple 观感」的主要来源（悬停抬升、按压缩放、
 * 焦点光环、弹簧缓动、错峰入场）。所以约定：
 *   - 静态外观（padding / 圆角 / 边框 / 背景 / 字号 / 过渡）写在本文件的 .dx-* 类；
 *   - 组件只写 className，内联 style 只用于随状态变化的属性。
 *
 * 主题：所有 --dx-* 变量都兜底到 DSH 主题变量（--dsw-alias-*），
 * 皮肤 / 明暗主题切换时整套观感自动跟随，插件不写死颜色。
 */

export const DS_STYLE_ID = 'dsh-experience-design-system'

const CSS = /* css */ `
/* 令牌挂在 :root 与 body 两处：DSH 的主题变量（--dsw-*）定义在 body 上，
   只写在 :root 会让所有 var(--dsw-*, 兜底) 解析成兜底字面量（皮肤/暗色失效）。 */
:root,
body {
  /* ---- 动效 ---- */
  --dx-ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
  --dx-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dx-dur-fast: 160ms;
  --dx-dur-base: 280ms;
  --dx-dur-slow: 460ms;

  /* ---- 语义色（兜底到 DSH 主题变量，皮肤/暗色自动跟随） ---- */
  --dx-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --dx-surface-2: var(--dsw-alias-bg-module-platform, #f5f5f7);
  --dx-hairline: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  --dx-hairline-strong: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.16));
  --dx-label-1: var(--dsw-alias-label-primary, #1d1d1f);
  --dx-label-2: var(--dsw-alias-label-secondary, #515154);
  --dx-label-3: var(--dsw-alias-label-tertiary, #86868b);
  --dx-accent: var(--dsw-alias-brand-primary, #1d1d1f);
  --dx-accent-text: var(--dsw-alias-label-primary-foreground, #ffffff);
  --dx-success: var(--dsw-alias-state-success-primary, #34c759);
  --dx-danger: var(--dsw-alias-state-error-primary, #ff3b30);
  --dx-warn: var(--dsw-alias-state-warn-label, #ff9f0a);
  --dx-hover-wash: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.045));
  --dx-switch-off: var(--dsw-alias-bg-module-platform, #e9e9eb);

  /* ---- 焦点光环：先给不支持 color-mix 的浏览器一个静态兜底，再覆盖 ---- */
  --dx-ring: rgba(0, 0, 0, 0.18);
  --dx-ring-soft: rgba(0, 0, 0, 0.1);
  --dx-ring: color-mix(in srgb, var(--dsw-alias-brand-primary, #1d1d1f) 22%, transparent);
  --dx-ring-soft: color-mix(in srgb, var(--dsw-alias-brand-primary, #1d1d1f) 11%, transparent);
  --dx-accent-hover: color-mix(in srgb, var(--dsw-alias-brand-primary, #1d1d1f) 84%, var(--dsw-alias-label-primary-foreground, #fff));
  --dx-danger-wash: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ff3b30) 10%, transparent);
  --dx-success-wash: color-mix(in srgb, var(--dsw-alias-state-success-primary, #34c759) 14%, transparent);
  --dx-warn-wash: color-mix(in srgb, var(--dsw-alias-state-warn-label, #ff9f0a) 16%, transparent);

  /* ---- 阴影：直接用 DSH 高度令牌（含 0.5px 发丝描边），空格主题自动换 ---- */
  --dx-shadow-card: var(--dsw-elevation-soft, 0 0 0 0.5px rgba(0, 0, 0, 0.14), 0 4px 16px rgba(0, 0, 0, 0.05), 0 0 24px rgba(0, 0, 0, 0.03));
  --dx-shadow-hover: var(--dsw-elevation-prominent, 0 0 0 0.5px rgba(0, 0, 0, 0.16), 0 6px 20px rgba(0, 0, 0, 0.08), 0 20px 40px rgba(0, 0, 0, 0.05));
  --dx-shadow-pop: 0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.1), 0 0 1px rgba(0, 0, 0, 0.12);
  --dx-shadow-thumb: 0 1px 3px rgba(0, 0, 0, 0.22), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
}

/* 暗色主题：只覆盖「兜底字面量」无法跟随的少数几处（白底滑块、滑块阴影、悬停洗色）。 */
body[data-ds-dark-theme] {
  --dx-shadow-pop: 0 0 0 0.5px rgba(255, 255, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.5);
  --dx-shadow-thumb: 0 1px 3px rgba(0, 0, 0, 0.6), 0 0 0 0.5px rgba(0, 0, 0, 0.3);
  --dx-ring: color-mix(in srgb, var(--dsw-alias-label-primary, #f5f5f7) 30%, transparent);
  --dx-ring-soft: color-mix(in srgb, var(--dsw-alias-label-primary, #f5f5f7) 14%, transparent);
}

/* ================= 基础 ================= */

.dx-tap {
  -webkit-tap-highlight-color: transparent;
}

/* 等宽字体：同时压住表单基类的 font: inherit 简写（提高特异性，避免依赖源顺序）。 */
.dx-mono,
.dx-input.dx-mono,
.dx-textarea.dx-mono,
.dx-select.dx-mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}

/* 焦点光环：键盘可达性 + 苹果式柔光（只在键盘导航时出现）。 */
.dx-focus:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--dx-ring);
}

/* 按压回弹：所有可点元素统一手感。 */
.dx-press:active:not(:disabled) {
  transform: scale(0.97);
}

.dx-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--dx-hairline-strong) transparent;
}
.dx-scroll::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.dx-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.dx-scroll::-webkit-scrollbar-thumb {
  background-color: var(--dx-hairline-strong);
  background-clip: content-box;
  border: 3px solid transparent;
  border-radius: 999px;
}
.dx-scroll::-webkit-scrollbar-thumb:hover {
  background-color: var(--dsw-alias-label-dimmed, rgba(0, 0, 0, 0.32));
}

/* ================= 版面 ================= */

.dx-section {
  color: var(--dx-label-1);
}

.dx-section__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 30px;
  letter-spacing: -0.012em;
  color: var(--dx-label-1);
}

.dx-section__intro {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: 0.002em;
  color: var(--dx-label-3);
}

/* ================= 卡片 ================= */

.dx-card {
  position: relative;
  background: var(--dx-surface);
  border-radius: 16px;
  box-shadow: var(--dx-shadow-card);
  transition:
    box-shadow var(--dx-dur-base) var(--dx-ease-spring),
    transform var(--dx-dur-base) var(--dx-ease-spring);
}
.dx-card[data-hover='true']:hover {
  box-shadow: var(--dx-shadow-hover);
  transform: translateY(-1px);
}
.dx-card[data-hover='true']:active {
  transform: translateY(0) scale(0.998);
}
.dx-card[data-open='true'] {
  box-shadow: var(--dx-shadow-hover);
}
.dx-card[data-disabled='true'] {
  opacity: 0.5;
  cursor: not-allowed;
}
.dx-card[data-disabled='true'] .dx-card__header {
  cursor: not-allowed;
}

.dx-card__header {
  appearance: none;
  box-sizing: border-box;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  margin: 0;
  padding: 16px 18px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dx-card__header:disabled {
  cursor: not-allowed;
}
.dx-card__header:hover:not(:disabled) {
  background: var(--dx-hover-wash);
}
.dx-card__header::-webkit-details-marker {
  display: none;
}

.dx-card__title {
  display: block;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 21px;
  letter-spacing: -0.004em;
  color: var(--dx-label-1);
}

.dx-card__desc {
  display: block;
  margin-top: 3px;
  font-size: 13px;
  line-height: 19px;
  color: var(--dx-label-3);
}

/* 展开箭头：默认淡灰圆形芯片，展开时填充主题色并旋转 180°。 */
.dx-card__chevron {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  color: var(--dx-label-3);
  background: var(--dx-surface-2);
  transition:
    transform var(--dx-dur-base) var(--dx-ease-spring),
    background-color var(--dx-dur-base) var(--dx-ease-out),
    color var(--dx-dur-base) var(--dx-ease-out);
}
.dx-card[data-open='true'] > .dx-card__header .dx-card__chevron {
  background: var(--dx-accent);
  color: var(--dx-accent-text);
}

.dx-card__body {
  margin: 0 18px;
  padding: 16px 0 18px;
  border-top: 1px solid var(--dx-hairline);
  animation: dx-expand var(--dx-dur-base) var(--dx-ease-out) both;
}

/* ================= 分段控件（苹果 segmented control） ================= */

.dx-seg {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  width: 100%;
  max-width: 440px;
  padding: 2px;
  border-radius: 999px;
  background: var(--dx-surface-2);
}

.dx-seg__thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc((100% - 4px) / var(--dx-seg-count, 4));
  border-radius: 999px;
  background: var(--dx-surface);
  box-shadow: var(--dx-shadow-pop);
  transform: translateX(calc(var(--dx-seg-index, 0) * 100%));
  transition: transform var(--dx-dur-base) var(--dx-ease-spring);
  pointer-events: none;
}

.dx-seg__item {
  position: relative;
  z-index: 1;
  appearance: none;
  overflow: hidden;
  padding: 6px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dx-label-3);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color var(--dx-dur-fast) var(--dx-ease-out);
}
.dx-seg__item:hover {
  color: var(--dx-label-2);
}
.dx-seg__item[data-active='true'] {
  color: var(--dx-label-1);
}

/* ================= 按钮 ================= */

.dx-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dx-label-1);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--dx-dur-fast) var(--dx-ease-out),
    color var(--dx-dur-fast) var(--dx-ease-out),
    box-shadow var(--dx-dur-fast) var(--dx-ease-out),
    transform var(--dx-dur-fast) var(--dx-ease-spring),
    opacity var(--dx-dur-fast) var(--dx-ease-out);
}
.dx-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dx-btn--sm {
  padding: 4px 11px;
  font-size: 12px;
  line-height: 16px;
}

.dx-btn--primary {
  background: var(--dx-accent);
  color: var(--dx-accent-text);
}
.dx-btn--primary:hover:not(:disabled) {
  background: var(--dx-accent-hover);
}

.dx-btn--secondary {
  background: var(--dx-surface-2);
  color: var(--dx-label-1);
}
.dx-btn--secondary:hover:not(:disabled) {
  background: var(--dx-hover-wash);
}

.dx-btn--ghost {
  color: var(--dx-label-2);
}
.dx-btn--ghost:hover:not(:disabled) {
  background: var(--dx-hover-wash);
  color: var(--dx-label-1);
}

.dx-btn--danger {
  color: var(--dx-danger);
}
.dx-btn--danger:hover:not(:disabled) {
  background: var(--dx-danger-wash);
  color: var(--dx-danger);
}

.dx-btn--link {
  padding: 2px 4px;
  color: var(--dx-label-2);
  font-weight: 400;
}
.dx-btn--link:hover:not(:disabled) {
  color: var(--dx-label-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.dx-btn--icon {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 999px;
  color: var(--dx-label-2);
  background: transparent;
}
.dx-btn--icon:hover:not(:disabled) {
  background: var(--dx-hover-wash);
  color: var(--dx-label-1);
}

/* ================= 表单 ================= */

.dx-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  letter-spacing: 0.006em;
  color: var(--dx-label-2);
}

/* 行内标签（与 13px 文本同行时去掉自带下边距）；写法提高特异性，避免被基类覆盖。 */
.dx-label.dx-label--inline {
  margin-bottom: 0;
}

.dx-input,
.dx-textarea,
.dx-select {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 11px;
  border: 1px solid var(--dx-hairline);
  border-radius: 10px;
  background: var(--dx-surface);
  color: var(--dx-label-1);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  transition:
    border-color var(--dx-dur-fast) var(--dx-ease-out),
    box-shadow var(--dx-dur-fast) var(--dx-ease-out),
    background-color var(--dx-dur-fast) var(--dx-ease-out);
}
.dx-input:hover:not(:disabled),
.dx-textarea:hover:not(:disabled),
.dx-select:hover:not(:disabled) {
  border-color: var(--dx-hairline-strong);
}
.dx-input:focus,
.dx-textarea:focus,
.dx-select:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--dx-accent) 45%, transparent);
  box-shadow: 0 0 0 3.5px var(--dx-ring-soft);
}
.dx-input:disabled,
.dx-textarea:disabled,
.dx-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dx-textarea {
  padding: 9px 12px;
  border-radius: 12px;
  line-height: 1.65;
  resize: vertical;
  min-height: 96px;
}

.dx-select {
  appearance: none;
  padding-right: 30px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M3 4.5 6 7.5 9 4.5' fill='none' stroke='%2386858b' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
  cursor: pointer;
}

.dx-input--num {
  width: 76px;
}

/* 复选框：自绘圆角方块 + 弹簧对勾 */
.dx-check {
  appearance: none;
  position: relative;
  flex: none;
  width: 18px;
  height: 18px;
  margin: 0;
  border: 1px solid var(--dx-hairline-strong);
  border-radius: 6px;
  background: var(--dx-surface);
  cursor: pointer;
  transition:
    background-color var(--dx-dur-fast) var(--dx-ease-out),
    border-color var(--dx-dur-fast) var(--dx-ease-out),
    box-shadow var(--dx-dur-fast) var(--dx-ease-out);
}
.dx-check:hover:not(:disabled) {
  border-color: var(--dx-label-3);
}
.dx-check::after {
  content: '';
  position: absolute;
  left: 5.5px;
  top: 2px;
  width: 4px;
  height: 9px;
  border: solid var(--dx-accent-text);
  border-width: 0 2px 2px 0;
  border-radius: 1px;
  transform: rotate(45deg) scale(0);
  transition: transform var(--dx-dur-base) var(--dx-ease-spring);
}
.dx-check:checked {
  border-color: transparent;
  background: var(--dx-accent);
}
.dx-check:checked::after {
  transform: rotate(45deg) scale(1);
}
.dx-check:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* iOS 开关 */
.dx-switch {
  appearance: none;
  position: relative;
  flex: none;
  width: 44px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--dx-switch-off);
  cursor: pointer;
  transition: background-color var(--dx-dur-base) var(--dx-ease-out);
}
.dx-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.dx-switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: var(--dx-shadow-thumb);
}

/* ================= 列表行 ================= */

.dx-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 -10px;
  padding: 11px 10px;
  border-radius: 12px;
  transition: background-color var(--dx-dur-fast) var(--dx-ease-out);
}
.dx-row[data-hover='true'] {
  cursor: pointer;
}
.dx-row[data-hover='true']:hover {
  background: var(--dx-hover-wash);
}
.dx-row + .dx-row {
  border-top: 1px solid var(--dx-hairline);
}
.dx-row + .dx-row:hover {
  border-top-color: transparent;
}

.dx-row__title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dx-label-1);
}

.dx-row__desc {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dx-label-3);
}

/* ================= 徽标 / 提示 ================= */

.dx-badge {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--dx-surface-2);
  color: var(--dx-label-2);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 17px;
  letter-spacing: 0.006em;
  white-space: nowrap;
}
.dx-badge--accent {
  background: var(--dx-accent);
  color: var(--dx-accent-text);
}
.dx-badge--outline {
  background: transparent;
  color: var(--dx-label-2);
  box-shadow: inset 0 0 0 1px var(--dx-hairline-strong);
}
.dx-badge--ok {
  background: var(--dx-success-wash);
  color: var(--dx-success);
}
.dx-badge--warn {
  background: var(--dx-warn-wash);
  color: var(--dx-warn);
}
.dx-badge--danger {
  background: var(--dx-danger-wash);
  color: var(--dx-danger);
}

.dx-hint {
  font-size: 12px;
  line-height: 18px;
  color: var(--dx-label-3);
}

.dx-msg {
  font-size: 12px;
  line-height: 18px;
  color: var(--dx-label-2);
}
.dx-msg--error {
  color: var(--dx-danger);
}
.dx-msg--ok {
  color: var(--dx-success);
}
.dx-msg--warn {
  color: var(--dx-warn);
}

.dx-empty {
  padding: 18px 2px;
  color: var(--dx-label-3);
  font-size: 13px;
  line-height: 20px;
  text-align: left;
}

/* 正文：13px / 常规字重 / 主文字色，无自带外边距（区别于 12px 弱化说明）。 */
.dx-text {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dx-label-1);
}

/* 分组小标题：如「已启用 (3)」。 */
.dx-group__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  letter-spacing: 0.01em;
  color: var(--dx-label-2);
}

/* 内嵌面板：卡片内部的次级灰底插层（新增/导入表单、规则说明等）。 */
.dx-panel {
  padding: 14px 16px;
  border: 1px solid var(--dx-hairline);
  border-radius: 14px;
  background: var(--dx-surface-2);
  animation: dx-expand var(--dx-dur-base) var(--dx-ease-out) both;
}

/* 字符计量条 */
.dx-meter {
  height: 4px;
  border-radius: 999px;
  background: var(--dx-surface-2);
  overflow: hidden;
}
.dx-meter__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--dx-accent);
  transition: width var(--dx-dur-base) var(--dx-ease-out), background-color var(--dx-dur-fast) var(--dx-ease-out);
}

/* ================= 动效 ================= */

.dx-rise {
  animation: dx-rise var(--dx-dur-slow) var(--dx-ease-out) both;
}
.dx-fade {
  animation: dx-fade var(--dx-dur-base) var(--dx-ease-out) both;
}
.dx-pop {
  animation: dx-pop var(--dx-dur-base) var(--dx-ease-spring) both;
}

@keyframes dx-rise {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.994);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes dx-fade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes dx-expand {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes dx-pop {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ---- 桌面端（Electron）窗口标题栏避让 ----
   DSH 桌面端由 shell 在 html 上打 data-windows-titlebar 标记，并把顶栏高度写进
   --dsh-windows-titlebar-height（Windows 为 40px）；frame 用 padding-top 预留这段，
   官方全屏浮层也按同一条规则避让。官方设置弹窗本身是居中小窗、够不到这段，本插件把它
   拉成全屏后必须自己补回来，否则页面顶栏会撞上原生最小化/最大化/关闭按钮（仅桌面端）。 */
[data-windows-titlebar] .dx-settings-overlay {
  padding-top: var(--dsh-windows-titlebar-height, 40px);
}
/* 顶栏这段自己铺底色并保持可拖拽（与 frame 的 :before 一致），
   桌面端全屏设置页期间窗口仍能靠顶栏拖动。 */
[data-windows-titlebar] .dx-settings-overlay::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: var(--dsh-windows-titlebar-height, 40px);
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base));
  -webkit-app-region: drag;
}
/* macOS 桌面（hiddenInset 样式，红绿灯浮在内容左上角）：导航列顶部让出红绿灯高度。 */
html[data-platform='darwin'] .dx-settings-nav {
  padding-top: 32px;
}

/* 尊重系统的「减少动态效果」。 */
@media (prefers-reduced-motion: reduce) {
  .dx-rise,
  .dx-fade,
  .dx-pop,
  .dx-card__body {
    animation: none !important;
  }
  .dx-press:active:not(:disabled),
  .dx-card[data-hover='true']:hover,
  .dx-card[data-hover='true']:active {
    transform: none !important;
  }
  .dx-btn,
  .dx-card,
  .dx-seg__thumb,
  .dx-card__chevron {
    transition-duration: 1ms !important;
  }
}
`

/** 幂等注入设计系统样式（同一文档只注入一次）。 */
export function ensureDesignStyles(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (doc === undefined) return
  if (doc.getElementById(DS_STYLE_ID) !== null) return
  const style = doc.createElement('style')
  style.id = DS_STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}

/** 拼接 className（过滤假值）。 */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' ')
}
