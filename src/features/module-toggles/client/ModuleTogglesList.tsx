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
 *
 * 视觉：行外观用 .dx-row（悬停洗色 + 行间发丝线），文字用 dx-row__title /
 * dx-row__desc，开关用 dx-switch / dx-switch__thumb；内联 style 只留行内布局
 * 与开关状态位移。行刻意不加 .dx-rise 入场动画：它 animation-fill-mode: both
 * 会把 transform 钉在 none，盖住 FLIP 写入的行内 transform，只保留 dx-row。
 */
import { useLayoutEffect, useRef } from 'react'
import { ui } from '../../../client/design/index.js'
import { MODULES, sortModuleIds } from './index.js'

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
        const on = states[m.id]
        return (
          <div key={m.id} className="dx-row" data-hover="true" data-module-row={m.id}>
            <div style={{ ...ui.stack(2), ...ui.grow }}>
              <div className="dx-row__title">{m.label}</div>
              <div className="dx-row__desc">{m.description}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={m.label}
              className="dx-switch dx-focus dx-tap"
              style={ui.switchTrack(on)}
              onClick={() => handleToggle(m.id)}
            >
              <span className="dx-switch__thumb" style={ui.switchThumb(on)} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
