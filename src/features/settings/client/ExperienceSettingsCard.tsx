/**
 * DSH 体验插件 —— 官方插件配置页统一卡片。
 *
 * 一个下拉框切换模块：模型思考等级 / CLI 请求模拟。这样合并后的所有配置
 * 都集中在一个卡片里，不用在设置页和插件配置页之间来回找。
 */
import { useState } from 'react'
import { ReasoningEditor } from '../../model-reasoning/client/ReasoningEditor.js'
import { CliMimicEditor } from '../../cli-mimic/client/CliMimicEditor.js'

type ModuleId = 'model-reasoning' | 'cli-mimic'

const MODULES: Array<{ id: ModuleId; label: string }> = [
  { id: 'model-reasoning', label: '模型思考等级' },
  { id: 'cli-mimic', label: 'CLI 请求模拟' },
]

const cardStyle: Record<string, string> = {
  border: '1px solid var(--dsw-alias-border-l2, #d8dee4)',
  background: 'var(--dsw-alias-bg-layer-3, #ffffff)',
  borderRadius: '8px',
  listStyle: 'none',
}

const headerStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '14px 16px',
  flexWrap: 'wrap',
}

const bodyStyle: Record<string, string> = {
  borderTop: '1px solid var(--dsw-alias-border-l2, #d8dee4)',
  margin: '0 16px',
  padding: '14px 0',
}

const selectStyle: Record<string, string> = {
  width: '100%',
  boxSizing: 'border-box',
  height: '38px',
  padding: '0 32px 0 10px',
  borderRadius: '8px',
  border: '1px solid var(--dsw-alias-border-l2, #d0d7de)',
  background: 'var(--dsw-alias-bg-layer-3, #ffffff)',
  color: 'var(--dsw-alias-label-primary, #1f2328)',
  fontSize: '13px',
  fontFamily: 'inherit',
  appearance: 'none',
  cursor: 'pointer',
}

export interface ExperienceSettingsCardProps {
  api: any
  rpc: any
  t: any
}

export function ExperienceSettingsCard(props: ExperienceSettingsCardProps): any {
  const { api, rpc, t } = props
  const [module, setModule] = useState<ModuleId>('model-reasoning')

  return (
    <li style={cardStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--dsw-alias-label-primary, #1f2328)', fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
            DSH 体验插件配置
          </span>
          <span style={{ color: 'var(--dsw-alias-label-tertiary, #6e7781)', fontSize: 13, lineHeight: 1.5 }}>
            模型思考等级 · CLI 请求模拟
          </span>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #24292f)' }}>配置模块</span>
          <select
            style={selectStyle}
            value={module}
            onChange={(event) => setModule(event.target.value as ModuleId)}
          >
            {MODULES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div style={bodyStyle}>
        {module === 'model-reasoning'
          ? <ReasoningEditor api={api} rpc={rpc} t={t} />
          : <CliMimicEditor api={api} />}
      </div>
    </li>
  )
}
