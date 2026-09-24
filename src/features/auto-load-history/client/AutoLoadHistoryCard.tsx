/**
 * 自动加载历史设置卡片 —— 渲染在设置页「日用优化」分区的「插件设置」页签。
 *
 * 只提供「加载条数」配置（自动加载到多少条用户消息，key 为
 * dsh-experience:auto-load:count，默认 20）。模块的启停开关在「模块开关」
 * 页签统一管理，这里不再重复放开关。
 *
 * 视觉：静态外观全部来自 .dx-* 类（正文 dx-text、数字输入 dx-input--num、
 * 提示 dx-hint），内联 style 只留行布局（flex / gap / margin）。
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ui } from '../../../client/design/index.js'
import { readAutoLoadCount, setAutoLoadCount } from './index.js'
import { ModuleCard } from '../../settings/client/ExperienceSettingsCard.js'

/** 行内标签：只写布局；字号/颜色/行高在 .dx-text。 */
const labelInline: CSSProperties = { flex: 'none' }

/** 自动加载历史设置卡片：只配置加载条数。 */
export function AutoLoadHistoryCard({ disabled = false }: { disabled?: boolean }): any {
  const [count, setCount] = useState(readAutoLoadCount())

  const changeCount = (raw: string): void => {
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return
    const clamped = Math.min(100, Math.max(1, n))
    setCount(clamped)
    setAutoLoadCount(clamped)
  }

  return (
    <ModuleCard title="自动加载历史" description="打开会话时自动加载更早的对话历史" disabled={disabled}>
      {/* 行布局内联；上下留白沿用旧的 16px */}
      <div style={{ ...ui.hstack(10), margin: '16px 0' }}>
        <span className="dx-text" style={labelInline}>加载条数</span>
        <input
          type="number"
          min={1}
          max={100}
          value={count}
          disabled={disabled}
          aria-label="自动加载历史条数"
          className="dx-input dx-input--num dx-focus"
          onChange={(e) => changeCount(e.target.value)}
        />
        <span className="dx-hint">条用户消息（1–100）</span>
      </div>
    </ModuleCard>
  )
}
