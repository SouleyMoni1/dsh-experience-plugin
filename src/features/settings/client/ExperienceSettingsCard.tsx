/**
 * DSH 体验插件 —— 「日用优化」分区里的可折叠配置卡片。
 *
 * 视觉：白面 + 发丝描边 + 高度阴影（.dx-card），悬停轻微抬升；
 * 头部右侧是圆形箭头芯片，展开时填充主题色并旋转 180°（弹簧缓动）。
 * 静态外观全在 src/client/design/styles.ts 的 .dx-* 类里，这里只写状态。
 */
import { useState, type ReactNode } from 'react'
import { IconChevronDownOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import { cx, ui } from '../../../client/design/index.js'
import { ReasoningEditor } from '../../model-reasoning/client/ReasoningEditor.js'
import { CliMimicEditor } from '../../cli-mimic/client/CliMimicEditor.js'
import { MyRulesEditor } from '../../my-rules/client/MyRulesEditor.js'

interface ModuleCardProps {
  title: string
  description: string
  defaultOpen?: boolean
  /** 禁用态：灰色显示、不可展开（模块关闭时用）。 */
  disabled?: boolean
  /** 裸渲染：跳过卡片外壳，直接渲染 children（作为独立选项卡页面时用）。 */
  bare?: boolean
  children: ReactNode
}

export function ModuleCard({ title, description, defaultOpen = false, disabled = false, bare = false, children }: ModuleCardProps): any {
  const [open, setOpen] = useState(defaultOpen)
  if (bare) return <>{children}</>

  const expanded = open && !disabled

  return (
    <div className="dx-card" data-hover={!disabled} data-open={expanded} data-disabled={disabled}>
      <button
        type="button"
        className="dx-card__header dx-focus dx-tap"
        aria-expanded={expanded}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span style={ui.grow}>
          <span className="dx-card__title">{title}</span>
          <span className="dx-card__desc">{description}</span>
        </span>
        <span className={cx('dx-card__chevron')} style={ui.chevron(expanded)} aria-hidden="true">
          <IconChevronDownOutlineMedium />
        </span>
      </button>
      {expanded ? <div className="dx-card__body">{children}</div> : null}
    </div>
  )
}

export interface ModelReasoningCardProps {
  api: any
  rpc: any
  remote: any
  t: any
  /** 禁用态（模块关闭时）。 */
  disabled?: boolean
}

export function ModelReasoningCard(props: ModelReasoningCardProps): any {
  const { api, rpc, remote, t, disabled } = props
  return (
    <ModuleCard title={t('nav')} description={t('cardDescription')} disabled={disabled}>
      <ReasoningEditor api={api} rpc={rpc} remote={remote} t={t} />
    </ModuleCard>
  )
}

export interface CliMimicCardProps {
  api: any
  /** 禁用态（模块关闭时）。 */
  disabled?: boolean
}

export function CliMimicCard(props: CliMimicCardProps): any {
  const { api, disabled } = props
  return (
    <ModuleCard title="CLI 请求模拟" description="本地代理 + fetch 拦截，把 DSH 请求伪装成 CLI 客户端" disabled={disabled}>
      <CliMimicEditor api={api} />
    </ModuleCard>
  )
}

export interface MyRulesCardProps {
  rpc: any
  t: any
  /** 禁用态（模块关闭时）。 */
  disabled?: boolean
}

export function MyRulesCard(props: MyRulesCardProps): any {
  const { rpc, t, disabled } = props
  return (
    <ModuleCard title={t('nav')} description={t('cardDescription')} disabled={disabled}>
      <MyRulesEditor rpc={rpc} t={t} />
    </ModuleCard>
  )
}
