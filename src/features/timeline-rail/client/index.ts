/**
 * timeline-rail —— browser 半区：对话页左侧「消息时间轴标记条」。
 *
 * 复刻 codex / zcode 桌面端交互：对话内容区左侧有一条竖向窄轨，轨道上**聚合**
 * 排列短横线（一组、上下居中），每条 = 一条用户消息，从上到下按消息先后排序。
 *
 * 交互：
 *  - hover：选中横线 2 倍加长 + 加深加粗，上下相邻 1.75 倍、隔一个 1.4 倍
 *    （再远不加长，样式不变），并弹出白色圆角预览卡片（消息 + 回复片段）。
 *  - 非 hover：根据当前会话停留位置（视口内最靠下的可见用户消息）给对应横线
 *    加深颜色。
 *  - click：把对话平滑滚动到对应消息位置。
 *
 * 实现方式（纯 DOM 浮层，零布局侵入）：
 *  - 宿主：官方对话容器 .wSkVaW_root（不滚动）。position:relative 仅作定位上下文。
 *  - 轨道 absolute 钉在对话区左侧，top/height 与滚动区可视区对齐，不随内容滚动。
 *  - 横线聚合：固定间距排列成一组，整组上下居中。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** 轨道根节点标记。 */
const ROOT_MARK = 'data-dsh-timeline-rail'
const ROOT_CLASS = 'dsh-timeline-rail'
const TRACK_CLASS = 'dsh-timeline-track'
const ITEM_CLASS = 'dsh-timeline-item'
const TIP_CLASS = 'dsh-timeline-tip'
const MORE_CLASS = 'dsh-timeline-more'
const CSS_TAG = 'dsh-experience/timeline-rail.css'

/** 轨道宽度（容纳右侧 3 倍加长 + 右移 10px）。 */
const RAIL_W = 56
/** 正常短横线长度（2 倍）。 */
const TICK_LEN = 12
/** 横线左侧固定点（相对轨道左缘，= 原左缘 6px + 右移 10px）。 */
const TICK_LEFT = 16
/** 横线之间的固定间距（+2px）。 */
const TICK_GAP = 12
/** 点击滚动时的顶部留白（px）。 */
const SCROLL_PAD = 120
/** 时间轴最多显示的用户消息条数（从最新往前数）。 */
const MAX_TICKS = 30
/** 自动补载历史的最大点击次数（防止死循环）。 */
const MAX_LOAD_MORE = 15
/** DOM 观察器防抖间隔（ms），压制会话内高频变更导致的重复渲染。 */
const OBS_DEBOUNCE_MS = 250

/** 注入样式（先移除旧版同 key 标签，保证热更新后新样式生效）。 */
function injectCss(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll(`style[data-dsh-css=${JSON.stringify(CSS_TAG)}]`).forEach((s) => s.remove())
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-experience-plugin'
  tag.dataset.dshCss = CSS_TAG
  tag.textContent = [
    /* 轨道浮层：钉在对话区左侧、与滚动区可视区对齐，不随内容滚动 */
    `.${ROOT_CLASS}{`,
    'position:absolute;left:0;',
    `width:${RAIL_W}px;`,
    'pointer-events:none;z-index:50;',
    '}',
    /* 轨道本体 */
    `.${TRACK_CLASS}{position:relative;width:100%;height:100%;}`,
    /* 单条短横线：按钮本体是加大一倍的热区（横向 24px），视觉横线用 ::before 画 */
    `.${ITEM_CLASS}{`,
    'position:absolute;',
    'left:0;',
    `width:${RAIL_W}px;height:${TICK_GAP}px;`,
    'background:transparent;',
    'cursor:pointer;pointer-events:auto;padding:0;border:none;',
    '}',
    /* 视觉横线（左锚定，向右加长；整条相对轨道右移 10px）。
       width/height 不加 transition：hover 时立即变长，避免动画推进依赖。 */
    `.${ITEM_CLASS}::before{`,
    'content:"";position:absolute;top:50%;',
    `left:${TICK_LEFT}px;`,
    `width:${TICK_LEN}px;height:2px;`,
    'transform:translateY(-50%);',
    'border-radius:1.5px;',
    'background:var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.35));',
    'transition:background .12s ease,box-shadow .12s ease;',
    '}',
    /* 当前会话停留的高亮（非 hover 时加深） */
    `.${ITEM_CLASS}[data-active="true"]::before{`,
    'background:var(--dsw-alias-state-info-primary,rgba(78,161,255,.75));',
    '}',
    /* hover：选中横线 —— 3 倍加长 + 加深加粗 */
    `.${ITEM_CLASS}.dsh-timeline-hover-self::before{`,
    `width:${TICK_LEN * 3}px;`,
    'height:3px;',
    'background:var(--dsw-alias-state-info-primary,#4ea1ff);',
    'box-shadow:0 0 5px rgba(78,161,255,.65);',
    '}',
    /* hover：上下相邻 —— 2 倍，样式不变 */
    `.${ITEM_CLASS}.dsh-timeline-hover-1::before{`,
    `width:${TICK_LEN * 2}px;`,
    '}',
    /* hover：上下第二个 —— 1.5 倍，样式不变 */
    `.${ITEM_CLASS}.dsh-timeline-hover-2::before{`,
    `width:${Math.round(TICK_LEN * 1.5)}px;`,
    '}',
    /* 预览卡片（白色圆角，复刻 codex 样式） */
    `.${TIP_CLASS}{`,
    'position:fixed;z-index:9999;pointer-events:none;',
    'padding:10px 12px;border-radius:10px;',
    'font-size:12px;line-height:1.55;',
    'background:#fff;color:#1f2328;',
    'box-shadow:0 4px 20px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.06);',
    'max-width:380px;max-height:220px;overflow:hidden;',
    'white-space:pre-wrap;word-break:break-word;',
    '}',
    /* 消息文本：字体稍大，最多 2 行省略 */
    `.${TIP_CLASS} .dsh-timeline-tip-q{`,
    'color:#1f2328;font-weight:600;font-size:13px;margin-bottom:6px;',
    'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;',
    '}',
    `.${TIP_CLASS} .dsh-timeline-tip-divider{`,
    'height:1px;background:rgba(31,35,40,.1);margin:6px 0;',
    '}',
    /* 回复片段：字体变淡，最多 3 行省略 */
    `.${TIP_CLASS} .dsh-timeline-tip-a{`,
    'color:rgba(87,96,106,.8);font-size:12px;',
    'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;',
    '}',
    /* 顶部「加载更早」触发器（省略号按钮） */
    `.${MORE_CLASS}{`,
    'position:absolute;top:2px;left:0;',
    'width:100%;height:24px;',
    'display:flex;align-items:center;justify-content:center;',
    'background:transparent;border:none;padding:0;',
    'cursor:pointer;pointer-events:auto;',
    'color:rgba(127,127,127,.8);font-size:16px;line-height:1;',
    'transition:color .12s ease;',
    '}',
    `.${MORE_CLASS}:hover{color:var(--dsw-alias-state-info-primary,#4ea1ff);}`,
    `.${MORE_CLASS}::before{content:"⋯";}`,
  ].join('')
  document.head.appendChild(tag)
}

/** 从一条消息块提取文本：助手 markdown 优先，其次用户气泡。 */
function extractQuestion(row: HTMLElement): string {
  const md = row.querySelector<HTMLElement>('._markdown_1nba0_5, [class*="markdown"]')
  if (md !== null) return (md.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const bubble = row.querySelector('.gdEzaW_bubble, [class*="bubble"]')
  const textEl = bubble?.querySelector('._text_1pfhk_1, [class*="_text_"]')
  const raw = textEl?.textContent ?? bubble?.textContent ?? row.textContent ?? ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** 从一条用户消息行之后取回复片段（紧跟的助手消息文本）。助手消息块自身返回空。 */
function extractReply(row: HTMLElement): string {
  // 助手回复块本身就是“回复”，无需再找后续
  if (row.querySelector('._markdown_1nba0_5, [class*="markdown"]') !== null) return ''
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
    if (md !== null) return (md.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)
  }
  return ''
}

/**
 * 在浏览器侧装配「消息时间轴标记条」。
 * 只依赖 DOM：官方滚动容器 .wSkVaW_scrollBody、对话容器 .wSkVaW_root、
 * 用户消息行 .gdEzaW_userRow。
 * @param ctx - client 根上下文。
 */
export function applyTimelineRail(ctx: ClientContext): void {
  if (typeof document === 'undefined') return
  injectCss()

  let railEl: HTMLElement | null = null
  let hostEl: HTMLElement | null = null
  let scrollEl: HTMLElement | null = null
  let tipEl: HTMLElement | null = null
  let raf = 0
  /** 当前 hover 的横线索引（-1 = 未 hover）。hover 期间不显示 active 高亮。 */
  let hoverIdx = -1
  /** 是否正在自动补载历史（防止并发点击）。 */
  let loadingHistory = false
  /** 当前会话已自动补载的次数（防止死循环，会话切换时重置）。 */
  let autoLoadCount = 0

  /** 当前数据缓存（供 hover/active 计算）。 */
  let ticksCache: Array<{ row: HTMLElement; top: number; question: string; reply: string }> = []
  /** 文本提取缓存：行元素 → { q, r }，行没变不重算（省掉大量 querySelector/textContent）。 */
  const textCache = new Map<HTMLElement, { q: string; r: string }>()
  /** 上一次渲染的消息行签名（数量 + 首尾消息 offsetTop），用于跳过无变化时的全量重绘。 */
  let lastSig = ''
  /** 与 lastSig 对应的消息行数组（滚动时复用，避免反复全量扫描）。 */
  let lastRows: HTMLElement[] = []
  /** MutationObserver 防抖计时器。 */
  let obsTimer = 0

  /**
   * 定位轨道：挂在 .wSkVaW_root（不滚动）里，钉在对话区左侧、与滚动区对齐。
   */
  const ensureRail = (): { rail: HTMLElement; scroll: HTMLElement } | null => {
    if (railEl !== null && railEl.isConnected && scrollEl !== null && scrollEl.isConnected) {
      return { rail: railEl, scroll: scrollEl }
    }
    const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
    let host = document.querySelector<HTMLElement>('.wSkVaW_root')
    if (scroll === null) return null
    if (host === null) host = scroll.parentElement // 兜底
    if (host === null) return null
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const sr = scroll.getBoundingClientRect()
    const hr = host.getBoundingClientRect()
    const top = sr.top - hr.top
    const height = sr.height
    scrollEl = scroll
    hostEl = host
    const el = document.createElement('div')
    el.className = ROOT_CLASS
    el.setAttribute(ROOT_MARK, '1')
    el.setAttribute('aria-label', '消息时间轴')
    el.style.top = `${top}px`
    el.style.height = `${height}px`
    const track = document.createElement('div')
    track.className = TRACK_CLASS
    el.appendChild(track)
    host.appendChild(el)
    railEl = el
    return { rail: el, scroll }
  }

  /** 只收集「主人发送的用户消息」：优先 .gdEzaW_userRow（一次原生查询，最快），
   *  找不到才走 flowItem 结构判定兜底。最多保留最新的 MAX_TICKS 条。 */
  const collectUserMessages = (scroll: HTMLElement): HTMLElement[] => {
    const direct = Array.from(scroll.querySelectorAll<HTMLElement>('.gdEzaW_userRow'))
    const all = direct.length > 0
      ? direct
      : Array.from(scroll.querySelectorAll<HTMLElement>('.Md3f7G_flowItem')).filter((f) => {
          // 用户消息特征：含用户气泡（gdEzaW_bubble / userRow）
          const hasUserRow = f.querySelector('.gdEzaW_userRow') !== null
          const hasBubble = f.querySelector('.gdEzaW_bubble, [class*="bubble"]') !== null
          // 助手回复块特征（含 markdown 或 Sxvs8a 回复体）→ 排除
          const hasMarkdown = f.querySelector('._markdown_1nba0_5, [class*="markdown"]') !== null
          const hasReplyBody = f.querySelector('[class*="Sxvs8a_root"], [class*="Sxvs8a_body"]') !== null
          // 工具调用行 → 排除
          const hasCall = f.querySelector('[class*="ztWv_q_callRow"]') !== null
          if (hasCall) return false
          return (hasUserRow || hasBubble) && !hasMarkdown && !hasReplyBody
        })
    // 取最新的 MAX_TICKS 条（DOM 顺序即时间顺序，末尾最新）
    return all.slice(-MAX_TICKS)
  }

  /** 收集横线信息（按顺序，聚合排列；消息多时自动缩间距防溢出；文本走缓存）。 */
  const collectTicks = (scroll: HTMLElement, trackH: number): Array<{ row: HTMLElement; top: number; question: string; reply: string }> => {
    const rows = collectUserMessages(scroll)
    const n = rows.length
    if (n === 0) return []
    // 聚合：固定间距排成一组，整组上下居中
    const gap = Math.min(TICK_GAP, n > 1 ? Math.floor((trackH - 20) / (n - 1)) : TICK_GAP)
    const totalH = (n - 1) * gap
    const startTop = Math.max(0, (trackH - totalH) / 2)
    return rows.map((row, i) => {
      // 文本提取缓存：行还在且未变 → 复用，省 querySelector/textContent
      let cached = textCache.get(row)
      if (cached === undefined) {
        cached = { q: extractQuestion(row), r: extractReply(row) }
        textCache.set(row, cached)
      }
      return {
        row,
        top: startTop + i * gap,
        question: cached.q,
        reply: cached.r
      }
    })
  }

  /** 计算当前会话停留的横线索引（视口内最靠下的可见用户消息）。
   *  直接吃已收集的行数组，避免重复全量扫描。 */
  const activeIndex = (rows: HTMLElement[], st: number, viewBottom: number): number => {
    let idx = -1
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].offsetTop <= viewBottom - 40) idx = i
    }
    return idx
  }

  /** 官方「加载更早」按钮是否存在。 */
  const hasOlderButton = (scroll: HTMLElement): boolean => {
    const btn = Array.from(scroll.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      /加载更早/.test((b.textContent ?? '') + (b.getAttribute('aria-label') ?? '')))
    return btn !== undefined
  }

  /** 触发官方「加载更早」，轮询等待内容插入后用锚点补偿滚动位置（视口不跳）。 */
  const loadMoreHistory = (): void => {
    const scroll = scrollEl
    if (scroll === null || loadingHistory) return
    const btn = Array.from(scroll.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      /加载更早/.test((b.textContent ?? '') + (b.getAttribute('aria-label') ?? '')))
    if (btn === undefined) return
    // 锚点：取视口内第一条可见消息（flowItem）作为视觉锚
    const viewTop = scroll.scrollTop
    const viewBottom = viewTop + (scroll.clientHeight || 1)
    const candidates = Array.from(scroll.querySelectorAll<HTMLElement>('.Md3f7G_flowItem')).filter((f) => {
      const t = f.offsetTop
      return t >= viewTop && t <= viewBottom - 10
    })
    const anchor = candidates[0] ?? null
    const anchorViewY = anchor !== null ? anchor.offsetTop - viewTop : 0
    const beforeH = scroll.scrollHeight
    loadingHistory = true
    btn.click()
    // 轮询：内容插入（scrollHeight 变化）后补偿滚动位置
    let tries = 0
    const poll = (): void => {
      tries++
      if (scroll.scrollHeight !== beforeH || tries > 40) {
        if (anchor !== null && anchor.isConnected) {
          scroll.scrollTop = Math.max(0, anchor.offsetTop - anchorViewY)
        }
        loadingHistory = false
        render()
        return
      }
      setTimeout(poll, 120)
    }
    setTimeout(poll, 120)
  }

  /** 重绘所有短横线。 */
  const render = (): void => {
    const ctx2 = ensureRail()
    if (ctx2 === null) return
    const { rail, scroll } = ctx2
    const track = rail.querySelector<HTMLElement>(`.${TRACK_CLASS}`)
    if (track === null) return
    const trackH = rail.clientHeight || 1
    // 消息集合签名：数量 + 首个/末个用户消息 offsetTop（判断是否需要重建横线）
    const rows = collectUserMessages(scroll)
    const sigParts: string[] = [String(rows.length)]
    if (rows.length > 0) {
      sigParts.push(String(rows[0].offsetTop), String(rows[rows.length - 1].offsetTop))
    }
    const sig = sigParts.join(':')
    if (sig !== lastSig) {
      lastSig = sig
      lastRows = rows
      // 清理过期缓存（行已不在 DOM）
      if (textCache.size > 0) {
        for (const k of textCache.keys()) {
          if (!k.isConnected) textCache.delete(k)
        }
      }
      const ticks = collectTicks(scroll, trackH)
      ticksCache = ticks
      const activeIdx = activeIndex(lastRows, scroll.scrollTop, scroll.scrollTop + (scroll.clientHeight || 1))
      const keep = new Set<HTMLElement>()
      ticks.forEach((tick, i) => {
        const key = String(Math.round(tick.top))
        let el = track.querySelector<HTMLButtonElement>(`.${ITEM_CLASS}[data-top="${key}"]`)
        if (el === null) {
          el = document.createElement('button')
          el.type = 'button'
          el.className = ITEM_CLASS
          el.dataset.top = key
          el.dataset.idx = String(i)
          el.style.top = `${tick.top}px`
          el.addEventListener('mouseenter', () => onHover(el as HTMLButtonElement, i))
          el.addEventListener('mouseleave', () => onLeave())
          el.addEventListener('click', () => {
            if (scrollEl === null) return
            const target = tick.row.offsetTop - SCROLL_PAD
            scrollEl.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
          })
          track.appendChild(el)
        } else {
          el.dataset.idx = String(i)
        }
        // 当前会话高亮（仅非 hover 时）
        el.dataset.active = String(hoverIdx === -1 && i === activeIdx)
        el.setAttribute('aria-label', tick.question)
        el.title = tick.question
        keep.add(el)
      })
      // 移除多余横线
      for (const el of Array.from(track.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`))) {
        if (!keep.has(el)) el.remove()
      }
    } else {
      // 行集合没变：只更新 active 高亮（跟随滚动），不重建横线
      const activeIdx = activeIndex(lastRows, scroll.scrollTop, scroll.scrollTop + (scroll.clientHeight || 1))
      const items = track.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`)
      for (const el of items) {
        el.dataset.active = String(hoverIdx === -1 && Number(el.dataset.idx ?? -1) === activeIdx)
      }
    }
    // 顶部「加载更早」触发器：有历史可加载时显示（每次渲染都同步）
    let moreEl = track.querySelector<HTMLButtonElement>(`.${MORE_CLASS}`)
    if (hasOlderButton(scroll)) {
      if (moreEl === null) {
        moreEl = document.createElement('button')
        moreEl.type = 'button'
        moreEl.className = MORE_CLASS
        moreEl.setAttribute('aria-label', '加载更早的消息')
        moreEl.title = '加载更早的消息'
        moreEl.addEventListener('click', () => loadMoreHistory())
        track.appendChild(moreEl)
      }
    } else if (moreEl !== null) {
      moreEl.remove()
    }
    // 自动补载历史：横线还没集满 30 条、预算未用完、且有更早可加载 → 补一次。
    // 放 setTimeout 避免与 MutationObserver 在同一轮互相触发。
    if (
      (ticksCache?.length ?? 0) < MAX_TICKS &&
      autoLoadCount < MAX_LOAD_MORE &&
      !loadingHistory &&
      hasOlderButton(scroll)
    ) {
      autoLoadCount++
      window.setTimeout(() => loadMoreHistory(), 300)
    }
  }

  /** hover 进入：级联加长（3 / 2 / 1.5 倍），弹出预览卡片，隐藏 active 高亮。 */
  const onHover = (anchor: HTMLButtonElement, idx: number): void => {
    hoverIdx = idx
    const track = railEl?.querySelector<HTMLElement>(`.${TRACK_CLASS}`)
    if (!track) return
    const items = Array.from(track.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`))
    for (const el of items) {
      el.classList.remove('dsh-timeline-hover-self', 'dsh-timeline-hover-1', 'dsh-timeline-hover-2')
      el.dataset.active = 'false'
    }
    for (const el of items) {
      const ei = Number(el.dataset.idx ?? -1)
      if (ei === idx) el.classList.add('dsh-timeline-hover-self')
      else if (ei === idx - 1 || ei === idx + 1) el.classList.add('dsh-timeline-hover-1')
      else if (ei === idx - 2 || ei === idx + 2) el.classList.add('dsh-timeline-hover-2')
    }
    // 弹出预览卡片
    const tick = ticksCache[idx]
    if (tick !== undefined) showTip(tick, anchor)
  }

  /** hover 离开：移除级联 class，隐藏预览卡片，恢复当前会话高亮。 */
  const onLeave = (): void => {
    hoverIdx = -1
    hideTip()
    const track = railEl?.querySelector<HTMLElement>(`.${TRACK_CLASS}`)
    if (!track) return
    const items = Array.from(track.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`))
    for (const el of items) {
      el.classList.remove('dsh-timeline-hover-self', 'dsh-timeline-hover-1', 'dsh-timeline-hover-2')
    }
    // 重新计算 active（基于缓存数据）
    if (scrollEl !== null && lastRows.length > 0) {
      const activeIdx = activeIndex(lastRows, scrollEl.scrollTop, scrollEl.scrollTop + (scrollEl.clientHeight || 1))
      for (const el of items) {
        el.dataset.active = String(Number(el.dataset.idx ?? -1) === activeIdx)
      }
    }
  }

  /** 显示预览卡片（白色圆角，消息 + 回复）。 */
  const showTip = (tick: { question: string; reply: string }, anchor: HTMLElement): void => {
    hideTip()
    const tip = document.createElement('div')
    tip.className = TIP_CLASS
    const q = document.createElement('div')
    q.className = 'dsh-timeline-tip-q'
    q.textContent = tick.question
    tip.appendChild(q)
    if (tick.reply) {
      const divider = document.createElement('div')
      divider.className = 'dsh-timeline-tip-divider'
      tip.appendChild(divider)
      const a = document.createElement('div')
      a.className = 'dsh-timeline-tip-a'
      a.textContent = tick.reply
      tip.appendChild(a)
    }
    document.body.appendChild(tip)
    // 定位到 tick 右侧
    const ar = anchor.getBoundingClientRect()
    tip.style.left = `${ar.right + 8}px`
    tip.style.top = `${Math.max(4, ar.top - 24)}px`
    tipEl = tip
  }

  /** 隐藏预览卡片。 */
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
    // 消息新增 / 切换会话 / DOM 变化：防抖 250ms 合并高频变更（工具调用、流式输出），
    // 避免每帧都全量 render。rail 失联时立即重建。
    const observer = new MutationObserver(() => {
      if (railEl === null || !railEl.isConnected) {
        render()
        return
      }
      if (obsTimer !== 0) return
      obsTimer = window.setTimeout(() => {
        obsTimer = 0
        render()
      }, OBS_DEBOUNCE_MS)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      if (obsTimer !== 0) {
        clearTimeout(obsTimer)
        obsTimer = 0
      }
      hideTip()
      scrollEl?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
      textCache.clear()
      railEl?.remove()
      railEl = null
      hostEl = null
      scrollEl = null
      ticksCache = []
      lastRows = []
      lastSig = ''
      hoverIdx = -1
      loadingHistory = false
      autoLoadCount = 0
    }
  }, 'timeline-rail: message timeline marks')
}
