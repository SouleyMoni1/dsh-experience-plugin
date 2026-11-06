/**
 * 管理类列表的共用 UI 骨架（MCP 管理 / Skills 管理共用）。
 *
 * 为什么单独抽一层：这两个页签此前由不同人实现，工具条符号、搜索框位置、
 * 分组标题、行尾操作顺序、删除确认形态各不相同，看起来像两个插件。所有
 * 「长什么样」的判断集中在这里，卡片只负责数据与 RPC，就不会再各写一套。
 *
 * 外观仍全部来自 .dx-* 类（见 src/client/design/styles.ts），本文件不写静态样式。
 */
import type { JSX, ReactNode } from 'react'
import { cx, ui } from '../../../client/design/index.js'

/** 顶部操作条：新增 / 导入这类入口按钮排一行。 */
export function ManagerActions({ children }: { children: ReactNode }): JSX.Element {
  return <div className="dx-toolbar">{children}</div>
}

/** 入口按钮（新增 / 导入切换）：展开时把前缀换成 ✕，其余两处保持一致。 */
export function ManagerEntryButton(props: {
  label: string
  glyph: string
  open: boolean
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  const { label, glyph, open, disabled = false, onClick } = props
  return (
    <button type="button" disabled={disabled} className="dx-btn dx-btn--link dx-focus dx-press dx-tap" onClick={onClick}>
      {open ? '✕ ' : glyph + ' '}
      {label}
    </button>
  )
}

/** 搜索框宽度上限：设置页是全屏通栏，输入框跟着拉满会显得空，480px 足够。 */
const SEARCH_STYLE = { flex: 1, minWidth: 0, maxWidth: 480 } as const

/** 搜索框：限宽输入框 + 有内容时右侧出现「清空」。 */
export function ManagerSearch(props: {
  value: string
  placeholder: string
  clearLabel: string
  disabled?: boolean
  onChange: (next: string) => void
}): JSX.Element {
  const { value, placeholder, clearLabel, disabled = false, onChange } = props
  return (
    <div style={ui.hstack(8)}>
      <input
        className="dx-input dx-focus"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        style={SEARCH_STYLE}
        onChange={(e) => onChange(e.target.value)}
      />
      {value === '' ? null : (
        <button type="button" className="dx-btn dx-btn--link dx-focus dx-press dx-tap" onClick={() => onChange('')}>
          {clearLabel}
        </button>
      )}
    </div>
  )
}

/** 状态消息一行（成功绿 / 失败红），无消息时由调用方不渲染。 */
export function ManagerMsg({ kind, text }: { kind: 'ok' | 'err'; text: string }): JSX.Element {
  return <div className={cx('dx-msg', kind === 'ok' ? 'dx-msg--ok' : 'dx-msg--error')}>{text}</div>
}

/** 分组标题：标题 + 计数（搜索态显示 命中/总数），下方可选说明文字。 */
export function ManagerSectionHeader(props: {
  title: string
  count: string
  hint?: string
}): JSX.Element {
  const { title, count, hint } = props
  return (
    <div style={ui.stack(4)}>
      <div className="dx-group__title">
        {title} <span className="dx-badge">{count}</span>
      </div>
      {hint === undefined ? null : <p className="dx-hint" style={{ margin: 0 }}>{hint}</p>}
    </div>
  )
}

/**
 * 行容器：宽屏自适应多列（全屏设置页 1600px 宽时一行拉太长，标题与开关离得太远）。
 * 单列最小 520px，可用宽度越大列数越多；窄屏自动退回一列。
 */
export function ManagerRows({ children }: { children: ReactNode }): JSX.Element {
  return <div className="dx-row-grid">{children}</div>
}

/** 列表行：标题 + 描述占满剩余宽度，右侧依次是徽标、操作区、开关。 */
export function ManagerRow(props: {
  title: string
  description: string
  badges?: ReactNode
  actions?: ReactNode
  trailing?: ReactNode
  hover?: boolean
  faded?: boolean
}): JSX.Element {
  const { title, description, badges, actions, trailing, hover = false, faded = false } = props
  return (
    <div className={cx('dx-row', faded ? 'dx-fade' : 'dx-rise')} data-hover={hover}>
      <div style={{ ...ui.stack(2), ...ui.grow }}>
        <div className="dx-row__title">{title}</div>
        <div className="dx-row__desc" style={ui.ellipsis}>{description}</div>
      </div>
      {badges === undefined ? null : <div className="dx-row__badges">{badges}</div>}
      {actions === undefined ? null : <div className="dx-row__actions">{actions}</div>}
      {trailing === undefined ? null : <div className="dx-row__trailing">{trailing}</div>}
    </div>
  )
}

/** 行内编辑态：整行换成表单（字段由调用方给），下方统一「保存 / 取消」。 */
export function ManagerEditRow(props: {
  fields: ReactNode
  hint?: string
  saveLabel: string
  cancelLabel: string
  busy?: boolean
  disabled?: boolean
  onSave: () => void
  onCancel: () => void
}): JSX.Element {
  const { fields, hint, saveLabel, cancelLabel, busy = false, disabled = false, onSave, onCancel } = props
  return (
    <div className="dx-row dx-fade" style={ui.stack(8)}>
      {fields}
      {hint === undefined ? null : <p className="dx-hint" style={{ margin: 0 }}>{hint}</p>}
      <div style={ui.hstack(8)}>
        <button type="button" disabled={busy || disabled} className="dx-btn dx-btn--primary dx-focus dx-press dx-tap" onClick={onSave}>
          {saveLabel}
        </button>
        <button type="button" disabled={busy} className="dx-btn dx-btn--secondary dx-focus dx-press dx-tap" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}

/** 行尾图标按钮（排序 / 编辑 / 删除）。 */
export function RowIconButton(props: {
  label: string
  glyph: string
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  const { label, glyph, disabled = false, onClick } = props
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      className="dx-btn dx-btn--icon dx-focus dx-press dx-tap"
      onClick={onClick}
    >
      {glyph}
    </button>
  )
}

/**
 * 两步删除按钮：常规态是小图标（✕ / 卸载文字），点一次进入确认态，
 * 变成红字「确认删除」+「取消」；两次点击之间由调用方计时复位。
 */
export function RowDeleteButton(props: {
  icon?: string
  label: string
  confirmLabel: string
  cancelLabel: string
  confirming: boolean
  disabled?: boolean
  onArm: () => void
  onConfirm: () => void
  onCancel: () => void
}): JSX.Element {
  const { icon, label, confirmLabel, cancelLabel, confirming, disabled = false, onArm, onConfirm, onCancel } = props
  if (!confirming) {
    return icon === undefined
      ? (
          <button type="button" disabled={disabled} className="dx-btn dx-btn--sm dx-btn--danger dx-focus dx-press dx-tap" onClick={onArm}>
            {label}
          </button>
        )
      : <RowIconButton label={label} glyph={icon} disabled={disabled} onClick={onArm} />
  }
  return (
    <>
      <button
        type="button"
        data-confirm-delete="true"
        disabled={disabled}
        className="dx-btn dx-btn--sm dx-btn--danger dx-focus dx-press dx-tap"
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
      <button type="button" disabled={disabled} className="dx-btn dx-btn--sm dx-btn--link dx-focus dx-press dx-tap" onClick={onCancel}>
        {cancelLabel}
      </button>
    </>
  )
}

/** 开关（36×20）：两个页签同一套状态与可访问性属性。 */
export function RowSwitch(props: {
  label: string
  on: boolean
  disabled?: boolean
  onToggle: () => void
}): JSX.Element {
  const { label, on, disabled = false, onToggle } = props
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className="dx-switch dx-focus dx-tap"
      style={ui.switchTrack(on)}
      onClick={onToggle}
    >
      <span className="dx-switch__thumb" style={ui.switchThumb(on)} />
    </button>
  )
}

/** 空列表 / 加载中的统一提示行。 */
export function ManagerEmpty({ text }: { text: string }): JSX.Element {
  return <div className="dx-empty">{text}</div>
}
