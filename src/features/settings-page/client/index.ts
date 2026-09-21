/**
 * settings-page —— browser 半区：把官方「设置弹窗」改造成全屏「设置页」。
 *
 * 官方设置壳（@deepseek-ai/dsh-client-ui-settings-general 的 SettingsRoot）注册在
 * 侧栏底部 `sidebar.settings` 单槽，点击后渲染一个居中模态弹窗：
 * 全屏遮罩 + 居中 800px 圆角面板。面板内部其实已经是「左侧导航 + 右侧内容」结构，
 * 但弹窗形态（居中浮动、圆角、遮罩模糊）观感不像一个页面。
 *
 * 本模块不改 slot 架构、不改官方渲染树，只在官方面板挂载后把几何形态覆盖成
 * 「全屏设置页」：面板 100vw × 100vh、无圆角无阴影，左侧导航加宽、右侧内容撑满。
 * 只改几何不改主题 token，官方所有分区内容（通用 / 模型 / 插件 / Agent 预设…
 * 含本插件两个配置卡片）原样保留；面板随关闭卸载 DOM，内联样式一并消失，无需
 * 反向清理。
 *
 * 背景透明处理：部分皮肤/主题插件（如 dsh-web-ui-all 系）会把 `--dsw-alias-bg-layer-2`
 * 定义成半透明色，导致设置页背景透出背后页面。本模块提供「背景不透明」开关
 * （注册进通用设置区），开启时把 layer-2 的实际计算色去掉 alpha 强制不透明，
 * 覆盖其他插件设置的透明效果；关闭时完全跟随皮肤/主题。
 *
 * 实现方式（纯 DOM 增强，零布局侵入）：
 *  - MutationObserver 监听 document，捕获官方 `role="dialog"` 面板挂载；
 *  - 用 `aria-labelledby` 指向的标题文本（「设置」/「Settings」）精确判定官方设置
 *    面板，避免误伤页面内其他模态对话框（全权限确认、文件错误提示等）；
 *  - 按官方 SettingsPanel 的子节点顺序定位 nav / content / options，不依赖
 *    CSS Modules hash 类名（每次构建会变），内联样式优先级最高、不怕漂移；
 *  - 入场 180ms 淡入上浮动画，遵循 prefers-reduced-motion。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** 设置页背景不透明持久化 key（localStorage）。 */
export const OPAQUE_BG_KEY = 'dsh-experience:settings-page:opaque-bg'
/** 默认：开启强制不透明（覆盖皮肤/主题的透明效果）。 */
export const DEFAULT_OPAQUE_BG = true

/** 读取持久化的「背景不透明」开关（非法值回退默认）。 */
export function readStoredOpaqueBg(): boolean {
  if (typeof localStorage === 'undefined') return DEFAULT_OPAQUE_BG
  const stored = localStorage.getItem(OPAQUE_BG_KEY)
  if (stored === null) return DEFAULT_OPAQUE_BG
  return stored === '1'
}

/** 解析 CSS 颜色字符串，去掉 alpha 返回不透明版本（hex / rgb / color(srgb) → 不透明）。 */
function opaqueColor(cssColor: string): string {
  const c = cssColor.trim()
  if (c === '') return '#ffffff'
  // #RRGGBBAA / #RGBA → 去掉 alpha 位
  if (/^#[0-9a-fA-F]{8}$/.test(c)) return c.slice(0, 7)
  if (/^#[0-9a-fA-F]{4}$/.test(c)) return c.slice(0, 4)
  // rgb() / rgba() 形式
  const rgbMatch = c.match(/rgba?\(\s*([^)]+)\)/)
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((s) => s.trim())
    if (parts.length >= 3) return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`
  }
  // color(srgb r g b / a) 形式（新式浏览器对 alpha 色返回此格式）
  const srgbMatch = c.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\)/)
  if (srgbMatch) {
    const to255 = (n: string) => Math.round(parseFloat(n) * 255)
    return `rgb(${to255(srgbMatch[1])}, ${to255(srgbMatch[2])}, ${to255(srgbMatch[3])})`
  }
  return c
}

/** 读取主题 layer-2 的 token 字符串（含皮肤覆盖，如 #ebf2fa85）。不创建 DOM 节点，避免触发 observer。 */
function resolveLayer2(): string {
  const token = getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-layer-2').trim()
  return token || '#ffffff'
}

/**
 * 把「背景不透明」设置应用到当前挂载的设置面板（幂等）。
 * 打开：面板变成透明强制使用去 alpha 的 layer-2（不透明），覆盖皮肤/主题的透明；
 * 关闭：清空内联背景，完全跟随皮肤/主题。
 */
export function applyOpaqueBg(): void {
  const opaque = readStoredOpaqueBg()
  // 精确匹配官方设置面板（依据 isSettingsPanel 判定，避免误伤其他 dialog）
  const candidates = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
  let panel: HTMLElement | null = null
  for (const el of candidates) {
    if (isSettingsPanel(el)) {
      panel = el
      break
    }
  }
  if (panel === null) return
  const mask = panel.parentElement?.firstElementChild
  if (opaque) {
    const bg = opaqueColor(resolveLayer2())
    panel.style.backgroundColor = bg
    if (mask instanceof HTMLElement) mask.style.background = bg
  } else {
    panel.style.backgroundColor = ''
    if (mask instanceof HTMLElement) mask.style.background = ''
  }
}

/** 全屏设置页导航栏宽度（px，官方弹窗为 188）。 */
const NAV_WIDTH = 240
/** 全屏设置页内容区水平内边距（px，官方为 24）。 */
const CONTENT_PAD = 32
/** 入场动画时长（ms）。 */
const OPEN_MS = 180

/** 官方设置面板标题候选文案（zh / en），命中才判定为设置面板。 */
const SETTINGS_TITLES = new Set(['设置', 'Settings'])

/** 官方 SettingsPanel 的 DOM 部件定位结果。 */
interface SettingsChrome {
  overlay: HTMLElement
  /** 遮罩（overlay 的第一个子元素，官方 JSX 保证存在）。 */
  mask: HTMLElement
  panel: HTMLElement
  nav: HTMLElement | null
  content: HTMLElement | null
  header: HTMLElement | null
  options: HTMLElement | null
}

/**
 * 判定一个 modal 对话框是不是官方设置面板。
 * 依据：role=dialog + aria-modal + aria-labelledby 指向的标题文本命中设置文案。
 * 其他模态（权限确认等）标题不同，不会误匹配。
 */
function isSettingsPanel(el: Element): el is HTMLElement {
  if (el instanceof HTMLElement === false) return false
  const panel = el as HTMLElement
  if (panel.getAttribute('role') !== 'dialog') return false
  if (panel.getAttribute('aria-modal') !== 'true') return false
  const labelledBy = panel.getAttribute('aria-labelledby')
  if (!labelledBy) return false
  const title = document.getElementById(labelledBy)
  if (!title) return false
  return SETTINGS_TITLES.has((title.textContent ?? '').trim())
}

/**
 * 依据官方 SettingsPanel 的子 DOM 顺序定位各部件：
 *   overlay > [mask, panel[ nav, content[ header, options ] ] ]
 * 不依赖 hash 类名，纯结构定位（官方 JSX 保证顺序稳定）。
 */
function locateChrome(panel: HTMLElement): SettingsChrome {
  const overlay = panel.parentElement ?? panel
  // 官方 JSX：overlay 第一个子元素固定是遮罩 mask；缺位时退回 overlay 自身（不崩）。
  const mask = overlay.firstElementChild as HTMLElement | null
  return {
    overlay,
    mask: mask ?? overlay,
    panel,
    nav: panel.firstElementChild as HTMLElement | null,
    content: panel.lastElementChild as HTMLElement | null,
    header: (panel.lastElementChild?.firstElementChild ?? null) as HTMLElement | null,
    options: (panel.lastElementChild?.lastElementChild ?? null) as HTMLElement | null,
  }
}

/** 把弹窗覆盖成「全屏页面」形态（幂等，可重复执行）。 */
function applyFullscreen(chrome: SettingsChrome): void {
  const { overlay, panel, nav, content, options } = chrome

  // 面板：撑满视口，去圆角 / 阴影 / 居中约束
  panel.style.width = '100vw'
  panel.style.height = '100vh'
  panel.style.maxWidth = 'none'
  panel.style.maxHeight = 'none'
  panel.style.borderRadius = '0'
  panel.style.boxShadow = 'none'
  overlay.style.alignItems = 'stretch'
  overlay.style.justifyContent = 'stretch'

  // 背景不透明开关（跟随用户偏好，覆盖皮肤/主题的透明）
  applyOpaqueBg()

  // 左侧导航加宽，更有「设置页」观感
  if (nav !== null) {
    nav.style.width = `${NAV_WIDTH}px`
    nav.style.flex = 'none'
  }

  // 内容区撑满剩余宽度并加大留白
  if (content !== null) {
    content.style.flex = '1'
    content.style.minWidth = '0'
  }
  if (options !== null) {
    options.style.flex = '1'
    options.style.padding = `0 ${CONTENT_PAD}px ${CONTENT_PAD}px`
  }
}

/** 入场动画：淡入 + 轻微上浮（WAAPI 驱动，无视 CSS 优先级覆盖；尊重减少动态）。 */
function playOpen(panel: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  panel.animate(
    [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0px)' },
    ],
    { duration: OPEN_MS, easing: 'ease-out' },
  )
}

/**
 * 浏览器侧装配「设置页全屏化」。
 * 官方设置面板出现时执行覆盖，卸载时随 DOM 消失；observer 生命周期挂在
 * ctx.effect 上，插件卸载即断开。
 * @param ctx - client 根上下文。
 */
export function applySettingsPage(ctx: ClientContext): void {
  if (typeof document === 'undefined') return

  ctx.effect(() => {
    /** 找到当前挂载的官方设置面板（无则 null）。 */
    const findPanel = (): HTMLElement | null => {
      const candidates = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      for (const el of candidates) {
        if (isSettingsPanel(el)) return el
      }
      return null
    }

    /** 上一次见过的设置面板元素（用于区分「重挂载」与「面板内普通 DOM 变化」）。 */
    let seenPanel: HTMLElement | null = null

    /** 对当前挂载的设置面板执行一次全屏覆盖（幂等）。 */
    const refresh = (): void => {
      const panel = findPanel()
      if (panel === null) {
        seenPanel = null
        return
      }
      // 幂等覆盖：面板还在则只补样式不重放动画
      applyFullscreen(locateChrome(panel))
      // 只有「新挂载的面板」才播入场动画，避免滚动/展开等 DOM 变化反复触发
      if (panel !== seenPanel) {
        seenPanel = panel
        playOpen(panel)
      }
    }

    // 首次挂载时面板可能已在 DOM（插件热更新），先同步执行一次
    refresh()

    // 之后监听设置面板挂载/重挂载（折叠侧栏、会话切换导致的重新渲染）
    const observer = new MutationObserver(() => refresh())
    observer.observe(document.documentElement, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      seenPanel = null
    }
  }, 'settings-page: fullscreen settings page')
}
