/**
 * 日用优化 —— 设置页「日用优化」分区。
 *
 * 布局：内容列定宽左对齐（900px，苹果设置面板的阅读宽度），顶部标题 + 说明，
 * 下面是苹果式分段控件（segmented control，滑块弹簧位移），再下面是面板内容：
 *   - 插件设置：集中承载本插件各功能的配置 UI（模型思考等级 / CLI 请求模拟 /
 *     设置页背景不透明 / 自动加载历史 / 全局指令 / 模型参数）；
 *   - 模块开关：全部功能模块的独立启停开关；
 *   - MCP 管理 / Skills 管理：MCP 服务器与技能管理。
 *
 * 页签为组件内本地状态（与官方 Plugins 分区一致：active tab 是 viewing state），
 * 不注册子槽，避免与官方插件页的 tab 机制耦合。
 *
 * 模块开关状态由本组件持有：切换后「插件设置」页签即时把对应配置卡片置灰
 * （关闭的模块其配置不再有意义），与 src/client/index.ts 的装配判断一致。
 * 注意：文案字典必须无条件注册（见 src/client/index.ts），否则置灰卡片会显示原始 key。
 *
 * 动效：卡片以 45ms 错峰浮入（dx-rise + ui.stagger），切换页签时面板淡入（dx-fade，
 * key=active 强制重挂载以重放动画）；静态外观全部来自 .dx-* 类。
 */
import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ExperienceRpc } from '../../../client/rpc-transport.js'
import type { SettingsAccess } from '../../../client/settings-access.js'
import { ui } from '../../../client/design/index.js'
import { ModelReasoningCard, CliMimicCard, MyRulesCard } from '../../settings/client/ExperienceSettingsCard.js'
import { OpaqueBgRow } from '../../settings-page/client/OpaqueBgRow.js'
import { AutoLoadHistoryCard } from '../../auto-load-history/client/AutoLoadHistoryCard.js'
import { ModelParamsCard } from '../../model-params/client/ModelParamsCard.js'
import { McpManagerCard } from '../../mcp-manager/client/McpManagerCard.js'
import { SkillManagerCard } from '../../skill-manager/client/SkillManagerCard.js'
import { ModuleTogglesList } from '../../module-toggles/client/ModuleTogglesList.js'
import { MODULES, isModuleEnabled, setModuleEnabled, sortModuleIds } from '../../module-toggles/client/index.js'
import type { ReasoningEditorInjected } from '../../model-reasoning/client/ReasoningEditor.js'

/** model-params 配置命名空间（与 host 端 MODEL_PARAMS_NS 一致）。 */
const MODEL_PARAMS_NS = 'dsh-experience-model-params'

/** 分区组件 props：官方 settings.section 运行时份额 + 本分区文案 + 注入面。 */
export type DailyOptimizationSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'daily-optimization'> &
  DailyOptimizationSectionInjected

/** 分区注入面（register 的 inject 工厂返回值，供配置卡片使用）。 */
export interface DailyOptimizationSectionInjected {
  /** settings 访问面（模型思考等级 / CLI 模拟编辑器读写用）。 */
  api: SettingsAccess | undefined
  /** 系列配置 RPC 通道（host 端 connection.rpc）。 */
  rpc: ExperienceRpc | undefined
  /** 转发事件订阅（settings/document-updated 等 Host 事件）。 */
  remote: ReasoningEditorInjected['remote']
  /** 模型思考等级编辑器文案（绑定 model-reasoning 命名空间）。 */
  mrT: TranslateNS<'model-reasoning'>
  /** 全局指令编辑器文案（绑定 my-rules 命名空间）。 */
  myRulesT: TranslateNS<'my-rules'>
  /** MCP 管理卡片文案（绑定 mcp-manager 命名空间）。 */
  mcpT: TranslateNS<'mcp-manager'>
  /** Skills 管理卡片文案（绑定 skill-manager 命名空间）。 */
  skillT: TranslateNS<'skill-manager'>
}

/** 分区根容器：定宽内容列 + 纵向节奏。 */
const sectionStyle: CSSProperties = {
  ...ui.content,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

/** 页签 id。 */
type TabId = 'settings' | 'modules' | 'mcp' | 'skills'

/**
 * 分段控件的两个自定义属性（滑块索引 / 段数）。
 * React 的 CSSProperties 不含自定义属性，这里显式透传。
 */
function segVars(index: number, count: number): CSSProperties {
  return { '--dx-seg-index': String(index), '--dx-seg-count': String(count) } as unknown as CSSProperties
}

/**
 * 渲染「日用优化」分区。
 * @param props - 官方运行时份额（close）+ 本分区文案 t + 注入面。
 * @returns 分区元素树。
 */
export function DailyOptimizationSection(props: DailyOptimizationSectionProps): JSX.Element {
  const { t, api, rpc, remote, mrT, myRulesT, mcpT, skillT } = props
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
    // model-params 是 host 侧功能：开关状态同步到 settings 命名空间，host 热生效。
    if (id === 'model-params') void writeModelParamsEnabled(next)
  }

  // model-params 的开关状态以 settings 命名空间为准（host 读它）；页面加载时同步一次。
  useEffect(() => {
    if (api === undefined) return
    void (async () => {
      try {
        const response = await api.settings.describe({})
        if (!response.result.ok) return
        const mpView = response.result.value.namespaces.find((entry: any) => entry.ns === MODEL_PARAMS_NS)
        if (mpView !== undefined) {
          const enabled = (mpView.value as { enabled?: unknown } | undefined)?.enabled === true
          setModuleStates((s) => ({ ...s, 'model-params': enabled }))
        }
      } catch {
        // settings 不可用时保持 localStorage 状态
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  /** 把 model-params 的 enabled 写入 settings 命名空间（host 监听热生效）。 */
  const writeModelParamsEnabled = async (enabled: boolean): Promise<void> => {
    if (api === undefined) return
    try {
      const response = await api.settings.describe({})
      if (!response.result.ok) return
      const view = response.result.value.namespaces.find((entry: any) => entry.ns === MODEL_PARAMS_NS)
      if (view === undefined) return
      await api.settings.update({
        ns: MODEL_PARAMS_NS,
        patch: { enabled },
        expectedRevision: view.revision,
      })
    } catch {
      // settings 不可用时仅本地开关生效
    }
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
    { id: 'my-rules', node: <MyRulesCard rpc={rpc} t={myRulesT} disabled={!moduleStates['my-rules']} /> },
    { id: 'model-params', node: <ModelParamsCard api={api} disabled={!moduleStates['model-params']} /> },
  ]
  const settingsCardIds = sortModuleIds(settingsCards.map((c) => c.id), moduleStates)

  const tabs: { id: TabId; label: string }[] = [
    { id: 'settings', label: t('settingsTab') },
    { id: 'modules', label: t('modulesTab') },
    { id: 'mcp', label: t('mcpTab') },
    { id: 'skills', label: t('skillsTab') },
  ]
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === active))

  return (
    <div className="dx-section" style={sectionStyle}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 className="dx-section__title">{t('title')}</h2>
        <p className="dx-section__intro">{t('intro')}</p>
      </header>

      <div className="dx-seg" role="tablist" aria-label={t('title')} style={segVars(activeIndex, tabs.length)}>
        <span className="dx-seg__thumb" aria-hidden="true" />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-active={active === tab.id}
            aria-selected={active === tab.id}
            className="dx-seg__item dx-tap"
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div key={active} className="dx-fade">
        {active === 'settings' ? (
          <div style={ui.stack(12)}>
            {settingsCardIds.map((id, i) => {
              const c = settingsCards.find((x) => x.id === id)!
              return (
                <div key={c.id} className="dx-rise" style={ui.stagger(i)}>
                  {c.node}
                </div>
              )
            })}
          </div>
        ) : active === 'modules' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p className="dx-section__intro" style={{ marginBottom: 8 }}>{t('modulesIntro')}</p>
            <div className="dx-card dx-rise" style={{ padding: '4px 18px', boxSizing: 'border-box' }}>
              <ModuleTogglesList states={moduleStates} onToggle={toggleModule} />
            </div>
          </div>
        ) : active === 'mcp' ? (
          <div className="dx-card dx-rise" style={{ padding: '14px 18px', boxSizing: 'border-box' }}>
            <McpManagerCard rpc={rpc} t={mcpT} bare />
          </div>
        ) : (
          <div className="dx-card dx-rise" style={{ padding: '14px 18px', boxSizing: 'border-box' }}>
            <SkillManagerCard rpc={rpc} t={skillT} bare />
          </div>
        )}
      </div>
    </div>
  )
}
