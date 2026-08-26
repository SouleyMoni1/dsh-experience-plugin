/**
 * 日用优化 —— 设置页「日用优化」分区。
 *
 * 布局参考官方「插件」分区（PluginsSettingsSection）：左侧导航一个分区，
 * 内容区顶部标题 + 说明 + 页签栏，页签下方渲染对应面板。
 * 本分区两个页签：
 *   - 插件设置：集中承载本插件各功能的配置 UI（模型思考等级 / CLI 请求模拟 /
 *     设置页背景不透明），从官方插件配置页与通用设置区搬移过来；
 *   - 模块开关：全部功能模块的独立启停开关。
 *
 * 页签为组件内本地状态（与官方 Plugins 分区一致：active tab 是 viewing state），
 * 不注册子槽，避免与官方插件页的 tab 机制耦合。
 *
 * 模块开关状态由本组件持有：切换后「插件设置」页签即时隐藏对应配置卡片
 * （关闭的模块其配置不再有意义），与 src/client/index.ts 的装配判断一致。
 */
import { useState, type CSSProperties, type JSX } from 'react'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientConnectionRpc, IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import { ModelReasoningCard, CliMimicCard } from '../../settings/client/ExperienceSettingsCard.js'
import { OpaqueBgRow } from '../../settings-page/client/OpaqueBgRow.js'
import { AutoLoadHistoryCard } from '../../auto-load-history/client/AutoLoadHistoryCard.js'
import { ModuleTogglesList } from '../../module-toggles/client/ModuleTogglesList.js'
import { MODULES, isModuleEnabled, setModuleEnabled, sortModuleIds } from '../../module-toggles/client/index.js'
import type { ReasoningEditorInjected } from '../../model-reasoning/client/ReasoningEditor.js'

/** 分区组件 props：官方 settings.section 运行时份额 + 本分区文案 + 注入面。 */
export type DailyOptimizationSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'daily-optimization'> &
  DailyOptimizationSectionInjected

/** 分区注入面（register 的 inject 工厂返回值，供配置卡片使用）。 */
export interface DailyOptimizationSectionInjected {
  /** settings wire API（模型思考等级 / CLI 模拟编辑器读写用）。 */
  api: Pick<IApiClient, 'settings'> | undefined
  /** 系列配置 RPC 通道（host 端 connection.rpc）。 */
  rpc: ClientConnectionRpc | undefined
  /** 转发事件订阅（settings/document-updated 等 Host 事件）。 */
  remote: ReasoningEditorInjected['remote']
  /** 模型思考等级编辑器文案（绑定 model-reasoning 命名空间）。 */
  mrT: TranslateNS<'model-reasoning'>
}

const sectionStyle: CSSProperties = {
  width: '100%',
  color: 'var(--dsw-alias-label-primary)',
  flexDirection: 'column',
  gap: 12,
  display: 'flex',
}

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
}

const introStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  margin: 0,
  fontSize: 13,
}

const tabsStyle: CSSProperties = {
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
  alignItems: 'flex-end',
  gap: 22,
  marginTop: 2,
  display: 'flex',
}

const tabStyle = (active: boolean): CSSProperties => ({
  color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
  font: 'inherit',
  cursor: 'pointer',
  background: '0 0',
  border: 0,
  padding: '7px 1px 9px',
  fontSize: 13,
  lineHeight: '20px',
  position: 'relative',
})

const tabActiveBarStyle: CSSProperties = {
  background: 'var(--dsw-alias-label-primary)',
  content: '""',
  borderRadius: '2px 2px 0 0',
  height: 2,
  position: 'absolute',
  bottom: -1,
  left: 0,
  right: 0,
}

const panelStyle: CSSProperties = {
  minWidth: 0,
  paddingTop: 2,
}

const cardsStyle: CSSProperties = {
  flexDirection: 'column',
  gap: 10,
  display: 'flex',
}

const emptyStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  margin: 0,
  fontSize: 13,
}

/** 页签 id。 */
type TabId = 'settings' | 'modules'

/**
 * 渲染「日用优化」分区。
 * @param props - 官方运行时份额（close）+ 本分区文案 t + 注入面。
 * @returns 分区元素树。
 */
export function DailyOptimizationSection(props: DailyOptimizationSectionProps): JSX.Element {
  const { t, api, rpc, remote, mrT } = props
  const [active, setActive] = useState<TabId>('settings')
  const [moduleStates, setModuleStates] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const m of MODULES) init[m.id] = isModuleEnabled(m.id)
    return init
  })

  const toggleModule = (id: string): void => {
    const next = !moduleStates[id]
    setModuleStates((s) => ({ ...s, [id]: next }))
    setModuleEnabled(id, next)
  }

  // 插件设置页签的配置卡片：全部显示，关闭的模块卡片禁用灰色（不可展开）。
  // 排序与「模块开关」页签一致（开启优先、再按清单顺序），开关变化时自动刷新。
  const settingsCards: { id: string; node: JSX.Element }[] = [
    {
      id: 'model-reasoning',
      node: <ModelReasoningCard api={api} rpc={rpc} remote={remote} t={mrT} disabled={!moduleStates['model-reasoning']} />,
    },
    { id: 'cli-mimic', node: <CliMimicCard api={api} disabled={!moduleStates['cli-mimic']} /> },
    { id: 'settings-page', node: <OpaqueBgRow disabled={!moduleStates['settings-page']} /> },
    { id: 'auto-load-history', node: <AutoLoadHistoryCard disabled={!moduleStates['auto-load-history']} /> },
  ]
  const settingsCardIds = sortModuleIds(settingsCards.map((c) => c.id), moduleStates)

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>{t('title')}</h2>
      <p style={introStyle}>{t('intro')}</p>
      <div style={tabsStyle}>
        <button
          type="button"
          data-active={active === 'settings'}
          style={tabStyle(active === 'settings')}
          onClick={() => setActive('settings')}
        >
          {t('settingsTab')}
          {active === 'settings' ? <span style={tabActiveBarStyle} /> : null}
        </button>
        <button
          type="button"
          data-active={active === 'modules'}
          style={tabStyle(active === 'modules')}
          onClick={() => setActive('modules')}
        >
          {t('modulesTab')}
          {active === 'modules' ? <span style={tabActiveBarStyle} /> : null}
        </button>
      </div>
      <div style={panelStyle}>
        {active === 'settings' ? (
          <div style={cardsStyle}>
            {settingsCardIds.map((id) => {
              const c = settingsCards.find((x) => x.id === id)!
              return <div key={c.id}>{c.node}</div>
            })}
          </div>
        ) : (
          <div>
            <p style={emptyStyle}>{t('modulesIntro')}</p>
            <ModuleTogglesList states={moduleStates} onToggle={toggleModule} />
          </div>
        )}
      </div>
    </div>
  )
}
