/**
 * 设置页背景不透明开关行 —— 渲染在设置页「日用优化」分区的「插件设置」页签。
 *
 * 背景：部分皮肤/主题插件（如 dsh-web-ui-all 系）会把 `--dsw-alias-bg-layer-2`
 * 定义成半透明色，导致全屏设置页背景透出背后页面。此开关开启后强制把面板与
 * 遮罩背景改成「去 alpha 的不透明版」layer-2（颜色仍跟随皮肤，只是不透明），
 * 覆盖皮肤/主题设置的透明效果；关闭时完全跟随皮肤/主题。
 *
 * 状态持久化在 localStorage，与 settings-page 模块共享同一份读取逻辑。
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { applyOpaqueBg, OPAQUE_BG_KEY, readStoredOpaqueBg } from './index.js'
import { ModuleCard } from '../../settings/client/ExperienceSettingsCard.js'

const rowStyle: CSSProperties = {
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
  alignItems: 'center',
  gap: '8px',
  padding: '16px 0',
  display: 'flex',
}

const textStyle: CSSProperties = {
  flexDirection: 'column',
  flex: 1,
  gap: '4px',
  minWidth: 0,
  paddingRight: '48px',
  display: 'flex',
}

const titleStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '22px',
}

const descStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
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

/** 通用设置区一行：开关 + 说明。 */
export function OpaqueBgRow({ disabled = false }: { disabled?: boolean }): any {
  const [on, setOn] = useState(readStoredOpaqueBg())

  const toggle = (): void => {
    const next = !on
    setOn(next)
    try {
      localStorage.setItem(OPAQUE_BG_KEY, next ? '1' : '0')
    } catch {
      // localStorage 不可用时仅本次会话生效，忽略
    }
    // 面板当前若开着，立即应用（幂等）
    applyOpaqueBg()
  }

  return (
    <ModuleCard title="设置页背景不透明" description="开启后强制覆盖皮肤/主题的透明效果" disabled={disabled}>
      <div style={rowStyle}>
        <div style={textStyle}>
          <div style={titleStyle}>设置页背景不透明</div>
          <div style={descStyle}>开启后强制覆盖皮肤/主题的透明效果</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="设置页背景不透明"
          style={switchStyle(on)}
          onClick={toggle}
        >
          <span style={thumbStyle(on)} />
        </button>
      </div>
    </ModuleCard>
  )
}
