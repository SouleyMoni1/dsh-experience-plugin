/**
 * dsh-experience-plugin —— 客户端样式层（注入一张 <style>，零构建配置改动）。
 *
 * 为什么要有样式层：内联 style 表达不了 :hover / :active / :focus-visible /
 * 关键帧动画。约定：
 *   - 静态外观（padding / 圆角 / 边框 / 背景 / 字号 / 过渡）写在本文件的 .dx-* 类；
 *   - 组件只写 className，内联 style 只用于随状态变化的属性。
 *
 * 视觉基线：DSH 桌面端官方设置页实测参数——控件高 28/36px、圆角 8/12/20px、
 * 发丝描边 1px（--dsw-alias-border-l3/l4）、字阶 12/13/14/18px、面板宽 760px、
 * 基本不用投影。皮肤 / 明暗主题切换时整套观感随 --dsw-* 自动跟随。
 */

export const DS_STYLE_ID = 'dsh-experience-design-system'

const CSS = /* css */ `
/* 令牌挂在 :root 与 body 两处：DSH 的主题变量（--dsw-*）定义在 body 上，
   只写在 :root 会让所有 var(--dsw-*, 兜底) 解析成兜底字面量（皮肤/暗色失效）。 */
:root,
body {
  /* ---- 动效 ---- */
  --dx-ease-out: cubic-bezier(0.2, 0, 0.2, 1);
  --dx-dur-fast: 120ms;
  --dx-dur-base: 180ms;
  --dx-dur-slow: 240ms;

  /* ---- 语义色（全部兜底到 DSH 主题变量） ---- */
  --dx-surface: var(--dsw-alias-bg-base, #ffffff);
  --dx-surface-2: var(--dsw-alias-bg-module-platform, #f5f6f7);
  --dx-hairline: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  --dx-hairline-strong: var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.16));
  --dx-label-1: var(--dsw-alias-label-primary, #0f1115);
  --dx-label-2: var(--dsw-alias-label-secondary, #61666b);
  --dx-label-3: var(--dsw-alias-label-tertiary, #81858c);
  --dx-accent: var(--dsw-alias-brand-primary, #0f1115);
  --dx-accent-text: var(--dsw-alias-label-primary-foreground, #ffffff);
  --dx-success: var(--dsw-alias-state-success-primary, #22c55e);
  --dx-danger: var(--dsw-alias-state-error-primary, #ec1313);
  --dx-warn: var(--dsw-alias-state-warn-label, #dd8629);
  --dx-hover-wash: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
  --dx-active-wash: var(--dsw-alias-interactive-bg-active, rgba(38, 49, 72, 0.1));
  --dx-switch-off: var(--dsw-alias-state-idle-primary, #d4d4d4);

  /* ---- 焦点光环（只在键盘导航时出现） ---- */
  --dx-ring: rgba(15, 17, 21, 0.28);
  --dx-ring: color-mix(in srgb, var(--dsw-alias-brand-primary, #0f1115) 32%, transparent);
  --dx-ring-soft: color-mix(in srgb, var(--dsw-alias-brand-primary, #0f1115) 14%, transparent);
  --dx-accent-hover: color-mix(in srgb, var(--dsw-alias-brand-primary, #0f1115) 88%, var(--dsw-alias-bg-base, #ffffff));
  --dx-danger-wash: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ec1313) 9%, transparent);
  --dx-success-wash: color-mix(in srgb, var(--dsw-alias-state-success-primary, #22c55e) 11%, transparent);
  --dx-warn-wash: color-mix(in srgb, var(--dsw-alias-state-warn-label, #dd8629) 12%, transparent);

  /* ---- 阴影：DSH 以发丝描边区分层级，这里保留变量但一律无投影 ---- */
  --dx-shadow-card: none;
  --dx-shadow-hover: none;
  --dx-shadow-pop: 0 0 0 1px var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  --dx-shadow-thumb: none;
}

/* 暗色主题：只覆盖少数无法自动跟随的兜底值。 */
body[data-ds-dark-theme] {
  --dx-shadow-pop: 0 0 0 1px var(--dsw-alias-border-l4, rgba(255, 255, 255, 0.16));
  --dx-ring: color-mix(in srgb, var(--dsw-alias-label-primary, #f5f5f7) 34%, transparent);
  --dx-ring-soft: color-mix(in srgb, var(--dsw-alias-label-primary, #f5f5f7) 16%, transparent);
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

/* 焦点光环：键盘可达性。 */
.dx-focus:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--dx-ring-soft);
}

/* 按压回馈：只做极轻微的不透明度变化，DSH 不做缩放回弹。 */
.dx-press:active:not(:disabled) {
  opacity: 0.86;
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
  font-size: 18px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0;
  color: var(--dx-label-1);
}

.dx-section__intro {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--dx-label-3);
}

/* 工具条：搜索框、筛选、批量操作放同一行。 */
.dx-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

/* ================= 卡片 ================= */

.dx-card {
  position: relative;
  background: var(--dx-surface);
  border: 1px solid var(--dx-hairline);
  border-radius: 12px;
  transition: border-color var(--dx-dur-fast) var(--dx-ease-out), background-color var(--dx-dur-fast) var(--dx-ease-out);
}
.dx-card[data-hover='true']:hover {
  border-color: var(--dx-hairline-strong);
}
.dx-card[data-open='true'] {
  border-color: var(--dx-hairline-strong);
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
  gap: 12px;
  width: 100%;
  margin: 0;
  padding: 12px 14px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dx-dur-fast) var(--dx-ease-out);
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
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  letter-spacing: 0;
  color: var(--dx-label-1);
}

.dx-card__desc {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dx-label-3);
}

/* 展开箭头：与官方导航控件同尺度的方形图标按钮，展开时仅旋转。 */
.dx-card__chevron {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--dx-label-3);
  background: transparent;
  transition:
    transform var(--dx-dur-base) var(--dx-ease-out),
    background-color var(--dx-dur-fast) var(--dx-ease-out),
    color var(--dx-dur-fast) var(--dx-ease-out);
}
.dx-card[data-open='true'] > .dx-card__header .dx-card__chevron {
  color: var(--dx-label-1);
}

.dx-card__body {
  margin: 0 14px;
  padding: 12px 0 14px;
  border-top: 1px solid var(--dx-hairline);
  animation: dx-expand var(--dx-dur-fast) var(--dx-ease-out) both;
}

/* ================= 分段控件（DSH 分段切换） ================= */

.dx-seg {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  width: fit-content;
  max-width: 100%;
  padding: 2px;
  border-radius: 10px;
  background: var(--dx-surface-2);
}

.dx-seg__thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc((100% - 4px) / var(--dx-seg-count, 4));
  border-radius: 8px;
  background: var(--dx-surface);
  box-shadow: 0 0 0 1px var(--dx-hairline);
  transform: translateX(calc(var(--dx-seg-index, 0) * 100%));
  transition: transform var(--dx-dur-base) var(--dx-ease-out);
  pointer-events: none;
}

.dx-seg__item {
  position: relative;
  z-index: 1;
  appearance: none;
  overflow: hidden;
  padding: 5px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dx-label-2);
  font: inherit;
  font-size: 13px;
  font-weight: 400;
  line-height: 18px;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color var(--dx-dur-fast) var(--dx-ease-out);
}
.dx-seg__item:hover {
  color: var(--dx-label-1);
}
.dx-seg__item[data-active='true'] {
  color: var(--dx-label-1);
}

/* ================= 按钮（28px 高 / 8px 圆角，对齐官方「打开配置文件」） ================= */

.dx-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  height: 28px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--dx-label-1);
  font: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--dx-dur-fast) var(--dx-ease-out),
    border-color var(--dx-dur-fast) var(--dx-ease-out),
    color var(--dx-dur-fast) var(--dx-ease-out),
    opacity var(--dx-dur-fast) var(--dx-ease-out);
}
.dx-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dx-btn--sm {
  height: 24px;
  padding: 0 8px;
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
  background: var(--dx-active-wash);
}

.dx-btn--ghost {
  border-color: var(--dx-hairline-strong);
  color: var(--dx-label-1);
}
.dx-btn--ghost:hover:not(:disabled) {
  background: var(--dx-hover-wash);
}

.dx-btn--danger {
  color: var(--dx-danger);
}
.dx-btn--danger:hover:not(:disabled) {
  background: var(--dx-danger-wash);
  color: var(--dx-danger);
}

.dx-btn--link {
  height: auto;
  padding: 2px 4px;
  color: var(--dx-label-2);
  font-weight: 400;
}
.dx-btn--link:hover:not(:disabled) {
  color: var(--dx-label-1);
}

.dx-btn--icon {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  color: var(--dx-label-3);
  font-size: 13px;
  background: transparent;
}
.dx-btn--icon:hover:not(:disabled) {
  background: var(--dx-hover-wash);
  color: var(--dx-label-1);
}

/* ================= 表单（36px 高 / 12px 圆角，对齐官方搜索框与选择器） ================= */

.dx-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
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
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--dx-hairline-strong);
  border-radius: 12px;
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
  border-color: var(--dx-label-3);
}
.dx-input:focus,
.dx-textarea:focus,
.dx-select:focus {
  outline: none;
  border-color: var(--dx-accent);
  box-shadow: 0 0 0 3px var(--dx-ring-soft);
}
.dx-input:disabled,
.dx-textarea:disabled,
.dx-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dx-textarea {
  height: auto;
  min-height: 88px;
  padding: 8px 12px;
  line-height: 20px;
  resize: vertical;
}

.dx-select {
  appearance: none;
  padding-right: 30px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M3 4.5 6 7.5 9 4.5' fill='none' stroke='%2381858c' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 12px center;
  cursor: pointer;
}

.dx-input--num {
  width: 72px;
}

/* 复选框：16px / 4px 圆角（--dsw-radius-xs）。 */
.dx-check {
  appearance: none;
  position: relative;
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  border: 1px solid var(--dx-hairline-strong);
  border-radius: 4px;
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
  left: 4.5px;
  top: 1.5px;
  width: 4px;
  height: 8px;
  border: solid var(--dx-accent-text);
  border-width: 0 2px 2px 0;
  border-radius: 1px;
  transform: rotate(45deg) scale(0);
  transition: transform var(--dx-dur-fast) var(--dx-ease-out);
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

/* 开关：36×20，开启为品牌色（对齐官方 _switch_ 组件）。 */
.dx-switch {
  appearance: none;
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
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
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--dx-surface);
  box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.08);
}

/* ================= 列表行 ================= */

.dx-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
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
  border-radius: 0;
}

/* 自适应行网格：宽屏自动多列，每格 520px 起；格内是普通行（无相邻分隔线）。 */
.dx-row-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(520px, 1fr));
  column-gap: 32px;
  row-gap: 4px;
  align-items: start;
}
.dx-row-grid > .dx-row + .dx-row {
  border-top: 0;
  border-radius: 8px;
}

.dx-row__title {
  display: block;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dx-label-1);
}

.dx-row__desc {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dx-label-3);
}

/* 行内徽标组：排在操作区左侧，窄屏可换行。 */
.dx-row__badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* 行尾操作区：图标按钮成组。 */
.dx-row__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

/* 行尾开关：与操作区之间留呼吸。 */
.dx-row__trailing {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  margin-left: 4px;
}

/* ================= 徽标 / 提示 ================= */

.dx-badge {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 1px 7px;
  border-radius: 6px;
  background: var(--dx-surface-2);
  color: var(--dx-label-2);
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
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
  padding: 16px 2px;
  color: var(--dx-label-3);
  font-size: 13px;
  line-height: 20px;
  text-align: left;
}

/* 正文：13px / 常规字重 / 主文字色，无自带外边距。 */
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
  font-weight: 400;
  line-height: 18px;
  color: var(--dx-label-2);
}

/* 内嵌面板：次级灰底插层（新增/导入表单、规则说明等）。 */
.dx-panel {
  padding: 12px 14px;
  border: 1px solid var(--dx-hairline);
  border-radius: 10px;
  background: var(--dx-surface-2);
}

/* 分隔线。 */
.dx-divider {
  height: 1px;
  margin: 12px 0;
  background: var(--dx-hairline);
}

/* 字符计量条 */
.dx-meter {
  height: 3px;
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

/* ================= 动效（短促淡入，无位移回弹） ================= */

.dx-rise {
  animation: dx-rise var(--dx-dur-base) var(--dx-ease-out) both;
}
.dx-fade {
  animation: dx-fade var(--dx-dur-fast) var(--dx-ease-out) both;
}
.dx-pop {
  animation: dx-pop var(--dx-dur-fast) var(--dx-ease-out) both;
}

@keyframes dx-rise {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes dx-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes dx-expand {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes dx-pop {
  from {
    opacity: 0;
    transform: scale(0.99);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ================= 设置页导航「返回」 ================= */

/* 左下角返回按钮：尺寸/圆角/内边距对齐官方导航单元格（40px 高 / 12px 圆角 /
   9px 16px 9px 12px / 8px 间隙），margin-top:auto 把它钉在导航列底部；
   宽度 100% 即菜单宽度（导航列内容盒），左箭头 + 「返回」文案。 */
.dx-nav-back {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  width: 100%;
  height: 40px;
  margin-top: auto;
  margin-bottom: 16px;
  padding: 9px 16px 9px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--dx-label-1);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dx-dur-fast) var(--dx-ease-out);
}
.dx-nav-back:hover {
  background: var(--dx-hover-wash);
}
.dx-nav-back > svg {
  flex: none;
}

/* ---- 全屏设置页：左侧导航列的分隔线 ----
   官方 0.2.2 起把设置面板改成四区 grid（title / header / nav / options），导航列宽由
   panel 的 grid-template-columns 决定，nav 只是其中一格、高度不含顶部标题行。
   所以分隔线不能挂在 nav 的 border 上（0.2.1 里那是整列，0.2.2 里只覆盖下半截，且
   早期实现误挂到标题格上会变成顶部一条短线）；这里统一在面板上画一条通高绝对定位竖线，
   横向位置由 JS 写入的 --dx-nav-w 决定，与导航列宽单一来源同源。 */
.dx-settings-panel {
  --dx-nav-w: 240px;
}
.dx-settings-panel::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--dx-nav-w);
  width: 1px;
  background: var(--dx-hairline);
  pointer-events: none;
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
