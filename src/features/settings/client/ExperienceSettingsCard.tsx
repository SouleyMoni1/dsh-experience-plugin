/**
 * DSH 体验插件 —— 官方插件配置页卡片。
 *
 * 每个功能一个可收缩模块，沿用官方插件配置页的展开/收起交互；
 * 不使用下拉框切换，两个模块可以同时看到并分别展开。
 */
import { useState, type ReactNode } from 'react'
import type { CSSProperties } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { ReasoningEditor } from '../../model-reasoning/client/ReasoningEditor.js'
import { CliMimicEditor } from '../../cli-mimic/client/CliMimicEditor.js'

interface ModuleCardProps {
  title: string
  description: string
  defaultOpen?: boolean
  children: ReactNode
}

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

function ModuleCard({ title, description, defaultOpen = false, children }: ModuleCardProps): any {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <li style={open ? { ...cardStyle, ...cardOpenStyle } : cardStyle}>
      <button
        type="button"
        style={headerStyle}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span style={headTextStyle}>
          <span style={titleStyle}>{title}</span>
          <span style={descriptionStyle}>{description}</span>
        </span>
        <span style={{ ...chevronStyle, transform: open ? 'rotate(180deg)' : 'none' }}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {open ? <div style={bodyStyle}>{children}</div> : null}
    </li>
  )
}

export interface ModelReasoningCardProps {
  api: any
  rpc: any
  t: any
}

export function ModelReasoningCard(props: ModelReasoningCardProps): any {
  const { api, rpc, t } = props
  return (
    <ModuleCard title={t('nav')} description={t('cardDescription')}>
      <ReasoningEditor api={api} rpc={rpc} t={t} />
    </ModuleCard>
  )
}

export interface CliMimicCardProps {
  api: any
}

export function CliMimicCard(props: CliMimicCardProps): any {
  const { api } = props
  return (
    <ModuleCard title="CLI 请求模拟" description="本地代理 + fetch 拦截，把 DSH 请求伪装成 CLI 客户端">
      <CliMimicEditor api={api} />
    </ModuleCard>
  )
}
