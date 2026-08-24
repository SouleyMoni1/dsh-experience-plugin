/**
 * timeline-rail —— browser 半区：对话页左侧「消息时间轴标记条」。
 *
 * 复刻 codex / zcode 桌面端交互：对话内容区左侧有一条竖向窄轨，轨道上按
 * 顺序排列短横线，每条 = 一条用户消息，位置与对应消息在对话中的纵向位置
 * 一致（轨道随内容滚动）。hover 时横线变长加深并弹出预览（该消息 + 回复
 * 片段），点击横线把对话滚动到对应消息位置。
 *
 * 实现方式（纯 DOM 浮层，零布局侵入）：
 *  - 宿主：官方滚动容器 .wSkVaW_scrollBody。给它设 position:relative 仅作为
 *    定位上下文。
 *  - 轨道 absolute 挂在滚动容器最左，高度 = 内容总高 scrollHeight，随内容滚动，
 *    视觉上与每条消息垂直对齐。
 *  - 每条短横线 top = 用户消息行 offsetTop（相对滚动容器内容）。
 *  - 监听 scroll / resize / MutationObserver 重绘。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** 轨道根节点标记。 */
const ROOT_MARK = 'data-dsh-timeline-rail'
const ROOT_CLASS = 'dsh-timeline-rail'
const TRACK_CLASS = 'dsh-timeline-track'
const ITEM_CLASS = 'dsh-timeline-item'
const TIP_CLASS = 'dsh-timeline-tip'
const CSS_TAG = 'dsh-experience/timeline-rail.css'

/** 轨道宽度。 */
const RAIL_W = 16
/** 正常短横线长度。 */
const TICK_LEN = 6
/** hover 伸长后长度。 */
const TICK_LEN_HOVER = 12
/** 点击滚动时的顶部留白（px）。 */
const SCROLL_PAD = 120

/** 注入样式。 */
function injectCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-dsh-css=${JSON.stringify(CSS_TAG)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-experience-plugin'
  tag.dataset.pluginCss = CSS_TAG
  tag.textContent = [
    /* 轨道浮层：挂在滚动容器内最左，高度=内容总高，随内容滚动 */
    `.${ROOT_CLASS}{`,
    'position:absolute;left:0;top:0;',
    `width:${RAIL_W}px;`,
    'pointer-events:none;z-index:50;',
    '}',
    /* 轨道本体 */
    `.${TRACK_CLASS}{position:relative;width:100%;height:100%;}`,
    /* 单条短横线 */
    `.${ITEM_CLASS}{`,
    'position:absolute;left:3px;',
    `width:${TICK_LEN}px;height:2px;`,
    'border-radius:1px;',
    'background:var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.35));',
    'cursor:pointer;pointer-events:auto;padding:0;border:none;',
    'transition:width .12s ease,background .12s ease,box-shadow .12s ease;',
    '}',
    /* hover：加长加深 */
    `.${ITEM_CLASS}:hover{`,
    `width:${TICK_LEN_HOVER}px;`,
    'background:var(--dsw-alias-state-info-primary,#4ea1ff);',
    'box-shadow:0 0 4px rgba(78,161,255,.6);',
    '}',
    /* 预览 tooltip */
    `.${TIP_CLASS}{`,
    'position:fixed;z-index:9999;pointer-events:none;',
    'padding:8px 10px;border-radius:8px;font-size:12px;line-height:1.5;',
    'background:var(--dsw-alias-tooltip-bg,rgba(30,30,30,.96));',
    'color:var(--dsw-alias-tooltip-fg,#f0f0f0);',
    'box-shadow:var(--dsw-shadow-lv2,0 4px 16px rgba(0,0,0,.22));',
    'max-width:360px;max-height:200px;overflow:hidden;',
    'white-space:pre-wrap;word-break:break-word;',
    '}',
    `${TIP_CLASS} .dsh-timeline-tip-q{`,
    'color:var(--dsw-alias-state-info-primary,#4ea1ff);font-weight:600;margin-bottom:4px;',
    'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;',
    '}',
    `${TIP_CLASS} .dsh-timeline-tip-a{`,
    'color:var(--dsw-alias-foreground-l2-normal,rgba(255,255,255,.75));',
    'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;',
    '}'
  ].join('')
  document.head.appendChild(tag)
}

/** 从一条用户消息行提取提问文本。 */
function extractQuestion(row: HTMLElement): string {
  const bubble = row.querySelector('.gdEzaW_bubble, [class*="bubble"]')
  const textEl = bubble?.querySelector('._text_1pfhk_1, [class*="_text_"]')
  const raw = textEl?.textContent ?? bubble?.textContent ?? row.textContent ?? ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** 从一条用户消息行之后取回复片段（紧跟的助手消息文本）。 */
function extractReply(row: HTMLElement): string {
  // 向上找该用户行所在的 flowItem（每条消息一个）
  let flowItem: HTMLElement | null = row.parentElement
  for (let i = 0; i < 6 && flowItem; i++) {
    const cls = flowItem.className?.toString?.() ?? ''
    if (cls.includes('Md3f7G_flowItem')) break
    flowItem = flowItem.parentElement
  }
  if (flowItem === null) return ''
  // flowItem 的父级是消息列容器（包含所有 flowItem）
  const column = flowItem.parentElement
  if (column === null) return ''
  const items = Array.from(column.querySelectorAll<HTMLElement>('.Md3f7G_flowItem'))
  const idx = items.indexOf(flowItem)
  // 取该 flowItem 之后第一个含 markdown 的 flowItem（即这条消息的回复）
  for (let k = idx + 1; k < items.length; k++) {
    const md = items[k].querySelector<HTMLElement>('._markdown_1nba0_5, [class*="markdown"]')
    if (md !== null) return (md.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  }
  return ''
}

/**
 * 在浏览器侧装配「消息时间轴标记条」。
 * 只依赖 DOM：官方滚动容器 .wSkVaW_scrollBody、用户消息行 .gdEzaW_userRow。
 * @param ctx - client 根上下文。
 */
export function applyTimelineRail(ctx: ClientContext): void {
  if (typeof document === 'undefined') return
  injectCss()

  let railEl: HTMLElement | null = null
  let scrollEl: HTMLElement | null = null
  let tipEl: HTMLElement | null = null
  let raf = 0

  /** 确保轨道挂在滚动容器内。 */
  const ensureRail = (): { rail: HTMLElement; scroll: HTMLElement } | null => {
    if (railEl !== null && railEl.isConnected && scrollEl !== null && scrollEl.isConnected) {
      return { rail: railEl, scroll: scrollEl }
    }
    const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
    if (scroll === null) return null
    if (getComputedStyle(scroll).position === 'static') scroll.style.position = 'relative'
    scrollEl = scroll
    const el = document.createElement('div')
    el.className = ROOT_CLASS
    el.setAttribute(ROOT_MARK, '1')
    el.setAttribute('aria-label', '消息时间轴')
    const track = document.createElement('div')
    track.className = TRACK_CLASS
    el.appendChild(track)
    scroll.insertBefore(el, scroll.firstChild)
    railEl = el
    return { rail: el, scroll }
  }

  /** 收集所有用户消息行信息（位置相对滚动容器内容）。 */
  const collectTicks = (scroll: HTMLElement): Array<{ row: HTMLElement; top: number; question: string; reply: string }> => {
    const rows = Array.from(scroll.querySelectorAll<HTMLElement>('.gdEzaW_userRow'))
    return rows.map((row) => ({
      row,
      top: row.offsetTop,
      question: extractQuestion(row),
      reply: extractReply(row)
    }))
  }

  /** 重绘所有短横线。 */
  const render = (): void => {
    const ctx2 = ensureRail()
    if (ctx2 === null) return
    const { rail, scroll } = ctx2
    const track = rail.querySelector<HTMLElement>(`.${TRACK_CLASS}`)
    if (track === null) return
    // 轨道高度 = 内容总高，随内容滚动
    rail.style.height = `${scroll.scrollHeight || 1}px`
    const ticks = collectTicks(scroll)
    const keep = new Set<HTMLElement>()
    for (const tick of ticks) {
      const key = String(tick.top)
      let el = track.querySelector<HTMLButtonElement>(`.${ITEM_CLASS}[data-top="${key}"]`)
      if (el === null) {
        el = document.createElement('button')
        el.type = 'button'
        el.className = ITEM_CLASS
        el.dataset.top = key
        el.style.top = `${tick.top}px`
        el.addEventListener('mouseenter', () => showTip(tick, el as HTMLButtonElement))
        el.addEventListener('mouseleave', () => hideTip())
        el.addEventListener('click', () => {
          if (scrollEl === null) return
          const target = tick.row.offsetTop - SCROLL_PAD
          scrollEl.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
        })
        track.appendChild(el)
      }
      el.setAttribute('aria-label', tick.question)
      el.title = tick.question
      keep.add(el)
    }
    // 移除多余横线
    for (const el of Array.from(track.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`))) {
      if (!keep.has(el)) el.remove()
    }
  }

  /** 显示预览 tooltip（定位到触发 tick 右侧）。 */
  const showTip = (tick: { question: string; reply: string }, anchor: HTMLElement): void => {
    hideTip()
    const tip = document.createElement('div')
    tip.className = TIP_CLASS
    const q = document.createElement('div')
    q.className = 'dsh-timeline-tip-q'
    q.textContent = tick.question
    tip.appendChild(q)
    if (tick.reply) {
      const a = document.createElement('div')
      a.className = 'dsh-timeline-tip-a'
      a.textContent = tick.reply
      tip.appendChild(a)
    }
    document.body.appendChild(tip)
    // 定位到 tick 右侧
    const ar = anchor.getBoundingClientRect()
    tip.style.left = `${ar.right + 8}px`
    tip.style.top = `${Math.max(4, ar.top - 20)}px`
    tipEl = tip
  }

  /** 隐藏预览 tooltip。 */
  const hideTip = (): void => {
    tipEl?.remove()
    tipEl = null
  }

  /** 合并滚动 + resize 的节流重绘。 */
  const schedule = (): void => {
    if (raf !== 0) return
    raf = requestAnimationFrame(() => {
      raf = 0
      render()
    })
  }

  ctx.effect(() => {
    render()
    if (scrollEl !== null) {
      scrollEl.addEventListener('scroll', schedule, { passive: true })
      window.addEventListener('resize', schedule)
    }
    // 消息新增 / 切换会话 / DOM 变化时重挂 + 重绘
    const observer = new MutationObserver(() => {
      if (railEl === null || !railEl.isConnected) {
        render()
      } else {
        schedule()
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      hideTip()
      scrollEl?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
      railEl?.remove()
      railEl = null
      scrollEl = null
    }
  }, 'timeline-rail: message timeline marks')
}
