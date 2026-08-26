/**
 * 自动加载历史设置卡片 —— 渲染在设置页「日用优化」分区的「插件设置」页签。
 *
 * 只提供「加载条数」配置（自动加载到多少条用户消息，key 为
 * dsh-experience:auto-load:count，默认 20）。模块的启停开关在「模块开关」
 * 页签统一管理，这里不再重复放开关。
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { readAutoLoadCount, setAutoLoadCount } from './index.js'
import { ModuleCard } from '../../settings/client/ExperienceSettingsCard.js'

const rowStyle: CSSProperties = {
  alignItems: 'center',
  gap: '10px',
  padding: '16px 0',
  display: 'flex',
}

const labelStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  lineHeight: '20px',
  flex: 'none',
}

const inputStyle: CSSProperties = {
  width: 72,
  boxSizing: 'border-box',
  padding: '6px 8px',
  borderRadius: '8px',
  border: '1px solid var(--dsw-alias-border-l2, #d0d7de)',
  background: 'var(--dsw-alias-bg-layer-3, #ffffff)',
  color: 'var(--dsw-alias-label-primary, #1f2328)',
  fontSize: '13px',
  fontFamily: 'inherit',
}

const hintStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
  lineHeight: '18px',
}

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
      <div style={rowStyle}>
        <span style={labelStyle}>加载条数</span>
        <input
          type="number"
          min={1}
          max={100}
          value={count}
          disabled={disabled}
          aria-label="自动加载历史条数"
          style={inputStyle}
          onChange={(e) => changeCount(e.target.value)}
        />
        <span style={hintStyle}>条用户消息（1–100）</span>
      </div>
    </ModuleCard>
  )
}
