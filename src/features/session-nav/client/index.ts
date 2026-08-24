/**
 * session-nav —— browser 半区：会话页面左侧「会话快捷导航条」。
 *
 * 复刻 zcode / codex 桌面端的交互：在页面最左侧有一个竖向快捷导航条，
 * 列出最近若干个会话（图标 + tooltip），点击即可快速切换到对应会话，
 * 当前会话高亮。
 *
 * 实现方式：
 *  - 把官方布局容器 .pI_x6G_frame 的 grid 改成「48px 窄条 + 原列」，导航条
 *    作为第一列，不挤占官方侧边栏（会话树）。
 *  - 读取官方 ctx.sessions.list（可订阅的会话列表快照），实时反映会话变化。
 *  - 点击条目调用 ctx.sessions.open(id) 切换会话。
 *  - 只展示最近 N 个会话（默认 12），避免窄条被历史会话淹没。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * session-nav 需要的最小会话服务面。
 * 运行时在浏览器里就是 client 侧的 ctx.sessions（SessionRuntime：list 快照 +
 * open 切换）；不直接依赖 ISessions 类型，避开 dsh-session 在 host 侧对
 * cordis Context 的同名声明合并冲突。
 */
export interface SessionNavService {
  list: {
    getSnapshot(): SessionListState
    subscribe(fn: () => void): () => void
  }
  open(id: string): void
}

/** 导航条根节点标记（防重复注入）。 */
const ROOT_MARK = 'data-dsh-session-nav'
const ROOT_CLASS = 'dsh-session-nav'
const ITEM_CLASS = 'dsh-session-nav-item'
const CSS_TAG = 'dsh-experience/session-nav.css'

/** 窄条宽度（px）。 */
const RAIL_WIDTH = 48
/** 最多展示的会话数。 */
const MAX_SESSIONS = 12

/** 会话图标（消息气泡，与官方 IconMessage 同构）。 */
const CHAT_ICON_SVG = [
  '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
  '<path d="M8 1C4.13401 1 1 3.80558 1 7.2C1 8.88422 1.73534 10.425 2.95411 11.5558L2.2 14.4L5.23109 12.9C6.09374 13.1542 7.01933 13.2927 8 13.2927C8.97766 13.2927 9.90025 13.1552 10.7619 12.9029L13.8 14.4L13.0459 11.5558C14.2647 10.425 15 8.88422 15 7.2C15 3.80558 11.866 1 8 1Z" fill="currentColor"/>',
  '</svg>'
].join('')

/** 当前会话小圆点。 */
const DOT_SVG = '<svg width="6" height="6" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="3" cy="3" r="3" fill="currentColor"/></svg>'

/** 注入导航条样式。 */
function injectCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-dsh-css=${JSON.stringify(CSS_TAG)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-experience-plugin'
  tag.dataset.pluginCss = CSS_TAG
  tag.textContent = [
    /* 竖向导航条根容器 */
    `.${ROOT_CLASS}{`,
    'display:flex;flex-direction:column;align-items:center;gap:2px;',
    'padding:8px 0;overflow-y:auto;overflow-x:hidden;',
    `width:${RAIL_WIDTH}px;`,
    'background:var(--dsw-alias-bg-l2,transparent);',
    'border-right:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.14));',
    '}',
    /* 单个会话条目 */
    `.${ITEM_CLASS}{`,
    'position:relative;display:flex;align-items:center;justify-content:center;',
    `width:${RAIL_WIDTH - 12}px;height:${RAIL_WIDTH - 12}px;flex:none;`,
    'border:none;background:transparent;color:var(--dsw-alias-foreground-l2-normal,rgba(255,255,255,.66));',
    'border-radius:8px;cursor:pointer;padding:0;margin:1px 0;',
    'transition:background .12s ease,color .12s ease;',
    '}',
    `.${ITEM_CLASS}:hover{`,
    'background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));',
    'color:var(--dsw-alias-foreground-l2-hover,#fff);',
    '}',
    /* 当前会话高亮 */
    `.${ITEM_CLASS}[data-active="true"]{`,
    'background:var(--dsw-alias-interactive-bg-selected,rgba(127,127,127,.22));',
    'color:var(--dsw-alias-state-info-primary,#4ea1ff);',
    '}',
    `.${ITEM_CLASS} svg{width:18px;height:18px;display:block;}`,
    /* 运行中会话：左下角绿色小点 */
    `.${ITEM_CLASS}[data-running="true"]::after{`,
    'content:"";position:absolute;left:6px;bottom:6px;width:6px;height:6px;border-radius:50%;',
    'background:var(--dsw-alias-state-success-primary,#3fb950);',
    '}',
    /* tooltip */
    `.dsh-session-nav-tip{`,
    'position:fixed;z-index:9999;pointer-events:none;',
    'padding:4px 8px;border-radius:6px;font-size:12px;line-height:1.4;',
    'background:var(--dsw-alias-tooltip-bg,rgba(30,30,30,.95));',
    'color:var(--dsw-alias-tooltip-fg,#f0f0f0);',
    'box-shadow:var(--dsw-shadow-lv2,0 4px 16px rgba(0,0,0,.18));',
    'max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
    '}'
  ].join('')
  document.head.appendChild(tag)
}

/** 创建会话条目按钮。 */
function createItem(id: string, label: string, active: boolean, running: boolean): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = ITEM_CLASS
  btn.dataset.id = id
  btn.dataset.active = String(active)
  btn.dataset.running = String(running)
  btn.title = label
  btn.setAttribute('aria-label', label)
  btn.setAttribute('aria-current', active ? 'true' : 'false')
  const icon = document.createElement('span')
  icon.innerHTML = CHAT_ICON_SVG
  btn.appendChild(icon.firstElementChild ?? document.createElement('span'))
  if (active) {
    const dot = document.createElement('span')
    dot.className = 'dsh-session-nav-dot'
    dot.style.cssText = 'position:absolute;right:6px;top:6px;width:6px;height:6px;border-radius:50%;background:currentColor;'
    dot.innerHTML = DOT_SVG
    btn.appendChild(dot)
  }
  return btn
}

/** 显示 tooltip（固定显示在条目右侧）。 */
function showTooltip(label: string, anchor: HTMLElement): void {
  const tip = document.createElement('div')
  tip.className = 'dsh-session-nav-tip'
  tip.textContent = label
  document.body.appendChild(tip)
  const r = anchor.getBoundingClientRect()
  tip.style.left = `${r.right + 8}px`
  tip.style.top = `${Math.max(4, r.top + r.height / 2 - tip.offsetHeight / 2)}px`
  anchor.addEventListener('mouseleave', () => tip.remove(), { once: true })
}

/**
 * 在浏览器侧装配「会话快捷导航条」。
 * @param ctx - client 根上下文。
 * @param sessions - 官方 sessions 服务（list 快照 + open 切换）。
 */
export function applySessionNav(ctx: ClientContext, sessions: SessionNavService | undefined): void {
  if (typeof document === 'undefined' || sessions === undefined) return
  injectCss()

  /** 当前导航条根节点 + 是否已改布局。 */
  let rootEl: HTMLElement | null = null
  let layoutPatched = false

  /**
   * 把官方布局 grid 改成「48px 窄条 + 原列」。
   * 返回 frame 容器；改不动就返回 null（导航条不挂）。
   */
  const patchLayout = (): HTMLElement | null => {
    const frame = document.querySelector<HTMLElement>('.pI_x6G_frame')
    if (frame === null) return null
    if (!layoutPatched) {
      const cols = getComputedStyle(frame).gridTemplateColumns.split(/\s+/).filter(Boolean)
      // 只在尚未插列时改一次
      if (cols.length > 0 && !cols[0].startsWith(`${RAIL_WIDTH}`)) {
        frame.style.gridTemplateColumns = `${RAIL_WIDTH}px ${cols.join(' ')}`
      }
      layoutPatched = true
    }
    return frame
  }

  /** 确保导航条挂在 frame 第一列（最左侧）。 */
  const ensureRoot = (): HTMLElement | null => {
    if (rootEl !== null && rootEl.isConnected) return rootEl
    const frame = patchLayout()
    if (frame === null) return null
    const el = document.createElement('div')
    el.className = ROOT_CLASS
    el.setAttribute(ROOT_MARK, '1')
    el.setAttribute('aria-label', '会话快捷导航')
    frame.insertBefore(el, frame.firstChild)
    rootEl = el
    return el
  }

  /** 用当前快照重绘导航条（只显示最近 N 个）。 */
  const render = (state: SessionListState): void => {
    const root = ensureRoot()
    if (root === null) return

    // 收集候选会话（跳过空白/子代理），按 updatedAt 取最近 MAX_SESSIONS 个。
    const candidates: Array<{ id: string; label: string; running: boolean; updatedAt: number }> = []
    for (const id of state.ids) {
      const summary = state.byId[id]
      if (summary === undefined) continue
      if (summary.blank === true) continue
      if (summary.parentId !== undefined) continue
      candidates.push({
        id,
        label: summary.displayTitle || summary.id,
        running: summary.running === true,
        updatedAt: summary.updatedAt
      })
    }
    // 按更新时间倒序取最新的一批。
    const byUpdated = candidates
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS)

    const shown = new Set(byUpdated.map((c) => c.id))
    const current = state.current

    // 移除不再展示的条目
    const existing = Array.from(root.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`))
    for (const el of existing) {
      if (el.dataset.id !== undefined && !shown.has(el.dataset.id)) el.remove()
    }
    // 逐个更新或追加
    let anchor: HTMLElement | null = null
    for (const { id, label, running } of byUpdated) {
      const active = current === id
      let el = root.querySelector<HTMLElement>(`.${ITEM_CLASS}[data-id="${id}"]`)
      if (el === null) {
        el = createItem(id, label, active, running)
        el.addEventListener('click', () => {
          try { sessions.open(id) } catch (err) { console.error('[session-nav] open failed:', err) }
        })
        el.addEventListener('mouseenter', () => showTooltip(label, el as HTMLElement))
        if (anchor !== null) anchor.after(el)
        else root.insertBefore(el, root.firstChild)
      } else {
        const wasActive = el.dataset.active === 'true'
        if (wasActive !== active) {
          el.dataset.active = String(active)
          el.setAttribute('aria-current', active ? 'true' : 'false')
          el.querySelector('.dsh-session-nav-dot')?.remove()
          if (active) {
            const dot = document.createElement('span')
            dot.className = 'dsh-session-nav-dot'
            dot.style.cssText = 'position:absolute;right:6px;top:6px;width:6px;height:6px;border-radius:50%;background:currentColor;'
            dot.innerHTML = DOT_SVG
            el.appendChild(dot)
          }
        }
        const wasRunning = el.dataset.running === 'true'
        if (wasRunning !== running) el.dataset.running = String(running)
        if (el.title !== label) { el.title = label; el.setAttribute('aria-label', label) }
      }
      anchor = el
    }
  }

  ctx.effect(() => {
    render(sessions.list.getSnapshot())
    const unsubscribe = sessions.list.subscribe(() => {
      render(sessions.list.getSnapshot())
    })
    // 布局/侧边栏可能晚挂载，用 MutationObserver 兜底重挂
    const observer = new MutationObserver(() => {
      if (rootEl === null || !rootEl.isConnected) {
        render(sessions.list.getSnapshot())
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      unsubscribe()
      observer.disconnect()
      // 还原布局 + 移除导航条
      if (rootEl !== null) rootEl.remove()
      rootEl = null
      if (layoutPatched) {
        const frame = document.querySelector<HTMLElement>('.pI_x6G_frame')
        if (frame !== null) {
          const cols = getComputedStyle(frame).gridTemplateColumns.split(/\s+/).filter(Boolean)
          if (cols[0] === `${RAIL_WIDTH}px`) frame.style.gridTemplateColumns = cols.slice(1).join(' ')
        }
        layoutPatched = false
      }
    }
  }, 'session-nav: quick nav bar')
}
