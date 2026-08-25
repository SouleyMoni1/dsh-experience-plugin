/**
 * 模块开关列表 —— 日用优化设置页「模块开关」页签内容。
 *
 * 列出插件全部功能模块，每个一个开关，状态持久化在 localStorage：
 * 关闭某模块后，该模块的浏览器侧功能不再装配（时间轴不显示、折叠不生效、
 * 设置页保持弹窗、配置卡片不注册等）；默认全部开启。
 *
 * 状态由父级（DailyOptimizationSection）持有并传入，这样「插件设置」页签
 * 能同步感知开关变化（关闭的模块其配置卡片即时隐藏）。
 */
import type { CSSProperties } from 'react'
import { MODULES } from './index.js'

const rowStyle: CSSProperties = {
  alignItems: 'center',
  gap: '12px',
  padding: '10px 0',
  display: 'flex',
}

const rowTextStyle: CSSProperties = {
  flexDirection: 'column',
  flex: 1,
  gap: '2px',
  minWidth: 0,
  display: 'flex',
}

const rowTitleStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '20px',
}

const rowDescStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 12,
  lineHeight: '18px',
}

function switchStyle(on: boolean): CSSProperties {
  return {
    appearance: 'none',
    width: 40,
    height: 22,
    borderRadius: 11,
    border: '0',
    cursor: 'pointer',
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 3px',
    background: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-module-platform)',
    transition: 'background .16s',
  }
}

function thumbStyle(on: boolean): CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#ffffff',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
    flex: 'none',
    transform: on ? 'translateX(18px)' : 'translateX(0)',
    transition: 'transform .16s',
  }
}

/** 模块开关列表 props：状态与切换回调由父级注入。 */
export interface ModuleTogglesListProps {
  /** 各模块当前开关状态（id → 是否开启）。 */
  states: Record<string, boolean>
  /** 切换某模块开关。 */
  onToggle: (id: string) => void
}

/** 模块开关列表：列出全部模块，每个一个开关。 */
export function ModuleTogglesList({ states, onToggle }: ModuleTogglesListProps): any {
  return (
    <div>
      {MODULES.map((m) => (
        <div key={m.id} style={rowStyle}>
          <div style={rowTextStyle}>
            <div style={rowTitleStyle}>{m.label}</div>
            <div style={rowDescStyle}>{m.description}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={states[m.id]}
            aria-label={m.label}
            style={switchStyle(states[m.id])}
            onClick={() => onToggle(m.id)}
          >
            <span style={thumbStyle(states[m.id])} />
          </button>
        </div>
      ))}
    </div>
  )
}
