/**
 * 模块开关列表 —— 日用优化设置页「模块开关」页签内容。
 *
 * 列出插件全部功能模块，每个一个开关，状态持久化在 localStorage：
 * 关闭某模块后，该模块的浏览器侧功能不再装配（设置页保持弹窗、
 * 配置卡片不注册等）；默认全部开启。
 *
 * 状态由父级（DailyOptimizationSection）持有并传入，这样「插件设置」页签
 * 能同步感知开关变化（关闭的模块其配置卡片即时隐藏）。
 *
 * 排序：开启的模块排在前面（与「插件设置」页签共用 sortModuleIds）。
 * 切换开关时用 FLIP 动画让行平滑移动到新位置（关闭的滑到下方、开启的滑到上方）。
 */
import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { MODULES, sortModuleIds } from './index.js'

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
    border: on ? '0' : '1px solid var(--dsw-alias-border-l2)',
    cursor: 'pointer',
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 3px',
    background: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-module-platform)',
    transition: 'background .16s, border-color .16s',
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

/** 模块开关列表：列出全部模块，每个一个开关，开启的排在前面，切换时行平滑移动。 */
export function ModuleTogglesList({ states, onToggle }: ModuleTogglesListProps): any {
  const ids = sortModuleIds(MODULES.map((m) => m.id), states)
  const listRef = useRef<HTMLDivElement>(null)
  // 切换前各行的旧位置（FLIP 起点）。
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map())

  // 切换前记录每行当前位置，再触发父级状态更新。
  const handleToggle = (id: string): void => {
    const rects = new Map<string, DOMRect>()
    listRef.current?.querySelectorAll<HTMLElement>('[data-module-row]').forEach((row) => {
      const key = row.getAttribute('data-module-row')
      if (key) rects.set(key, row.getBoundingClientRect())
    })
    prevRectsRef.current = rects
    onToggle(id)
  }

  // 重渲染后对比新旧位置，用 transform 反向补偿再过渡到原位（FLIP）。
  useLayoutEffect(() => {
    const prev = prevRectsRef.current
    if (prev.size === 0) return
    listRef.current?.querySelectorAll<HTMLElement>('[data-module-row]').forEach((row) => {
      const key = row.getAttribute('data-module-row')
      if (!key) return
      const prevRect = prev.get(key)
      if (!prevRect) return
      const curRect = row.getBoundingClientRect()
      const dx = prevRect.left - curRect.left
      const dy = prevRect.top - curRect.top
      if (dx === 0 && dy === 0) return
      row.style.transition = 'none'
      row.style.transform = `translate(${dx}px, ${dy}px)`
      // 强制回流，让起始位移先落位，再过渡回原位。
      void row.offsetHeight
      row.style.transition = 'transform 300ms ease'
      row.style.transform = ''
    })
    prevRectsRef.current = new Map()
  }, [ids.join(',')])

  return (
    <div ref={listRef}>
      {ids.map((id) => {
        const m = MODULES.find((x) => x.id === id)!
        return (
          <div key={m.id} data-module-row={m.id} style={rowStyle}>
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
              onClick={() => handleToggle(m.id)}
            >
              <span style={thumbStyle(states[m.id])} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
