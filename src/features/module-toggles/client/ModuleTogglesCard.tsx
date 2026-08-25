/**
 * 模块开关卡片 —— 注册进官方插件配置页（settings.plugin.item）。
 *
 * 列出插件全部功能模块，每个一个开关，状态持久化在 localStorage：
 * 关闭某模块后，该模块的浏览器侧功能不再装配（时间轴不显示、折叠不生效、
 * 设置页保持弹窗、配置卡片不注册等）；默认全部开启。
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { MODULES, isModuleEnabled, setModuleEnabled } from './index.js'

const cardStyle: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-alias-bg-layer-3)',
  borderRadius: '12px',
  listStyle: 'none',
  transition: 'border-color .16s, background .16s',
}

const cardOpenStyle: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2)',
  borderColor: 'var(--dsw-alias-label-dimmed)',
}

const headerStyle: CSSProperties = {
  appearance: 'none',
  width: '100%',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  background: 'transparent',
  border: '0',
  borderRadius: '12px',
  alignItems: 'center',
  gap: '12px',
  padding: '14px 16px',
  display: 'flex',
}

const headTextStyle: CSSProperties = {
  flexDirection: 'column',
  flex: 1,
  gap: '4px',
  minWidth: 0,
  display: 'flex',
}

const titleStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.4,
}

const descriptionStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 13,
  lineHeight: 1.5,
}

const chevronStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  flex: 'none',
  display: 'inline-flex',
  transition: 'transform .16s',
}

const bodyStyle: CSSProperties = {
  borderTop: '1px solid var(--dsw-alias-border-l2)',
  margin: '0 16px',
  padding: '14px 0 8px',
}

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

/** 模块开关卡片：列出全部模块，每个一个开关。 */
export function ModuleTogglesCard(): any {
  const [open, setOpen] = useState(false)
  const [states, setStates] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const m of MODULES) init[m.id] = isModuleEnabled(m.id)
    return init
  })

  const toggle = (id: string): void => {
    const next = !states[id]
    setStates((s) => ({ ...s, [id]: next }))
    setModuleEnabled(id, next)
  }

  return (
    <li style={open ? { ...cardStyle, ...cardOpenStyle } : cardStyle}>
      <button
        type="button"
        style={headerStyle}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span style={headTextStyle}>
          <span style={titleStyle}>模块开关</span>
          <span style={descriptionStyle}>按需启用/停用各功能模块（默认全部开启）</span>
        </span>
        <span style={{ ...chevronStyle, transform: open ? 'rotate(180deg)' : 'none' }}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {open ? (
        <div style={bodyStyle}>
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
                onClick={() => toggle(m.id)}
              >
                <span style={thumbStyle(states[m.id])} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  )
}
