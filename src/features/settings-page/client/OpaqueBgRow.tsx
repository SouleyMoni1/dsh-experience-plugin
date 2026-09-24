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
import { ui } from '../../../client/design/index.js'
import { applyOpaqueBg, OPAQUE_BG_KEY, readStoredOpaqueBg } from './index.js'
import { ModuleCard } from '../../settings/client/ExperienceSettingsCard.js'

/** 通用设置区一行：iOS 开关 + 说明文字。 */
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
      <div className="dx-row" style={{ marginTop: -6, marginBottom: -6 }}>
        <div style={ui.grow}>
          <div className="dx-row__title">设置页背景不透明</div>
          <div className="dx-row__desc">开启后强制覆盖皮肤/主题的透明效果</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="设置页背景不透明"
          className="dx-switch dx-focus dx-tap"
          style={ui.switchTrack(on)}
          onClick={toggle}
        >
          <span className="dx-switch__thumb" style={ui.switchThumb(on)} />
        </button>
      </div>
    </ModuleCard>
  )
}
