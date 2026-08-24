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
/** 自动补载历史的最大点击次数。
 *  实测根因：补载找不到用户消息（历史全被压缩成 compactionRow）时会疯狂点
 *  「加载更早」直到把整个会话拖进 DOM → DOM 爆炸 → 帧数暴跌。
 *  设小额 + loadMoreHistory 内的 flowItem 总量上限（>MAX_FLOW_ITEMS 拒绝），
 *  双保险防全量加载。用户也可手动点 rail 顶部「加载更早」按需补载。 */
const MAX_LOAD_MORE = 3
/** 会话 flowItem 总量上限：超过即停止自动补载（防 DOM 爆炸，保帧率）。 */
const MAX_FLOW_ITEMS = 400
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
       width/height 加 transition：hover 加长/移出缩短平滑过渡，不生硬。 */
    `.${ITEM_CLASS}::before{`,
    'content:"";position:absolute;top:50%;',
    `left:${TICK_LEFT}px;`,
    `width:${TICK_LEN}px;height:2px;`,
    'transform:translateY(-50%);',
    'border-radius:1.5px;',
    'background:var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.35));',
    'transition:width .18s ease,height .18s ease,background .12s ease,box-shadow .18s ease;',
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
  /** 预览卡片延迟显示计时器：快速划过横线时不弹卡片，停住才显示。 */
  let tipTimer = 0
  /** 预览卡片延迟显示时长 ms。 */
  const TIP_DELAY_MS = 250
  /** 是否正在自动补载历史（防止并发点击）。 */
  let loadingHistory = false
  /** 当前会话已自动补载的次数（防止死循环，会话切换时重置）。 */
  let autoLoadCount = 0

  /** 当前数据缓存（供 hover/active 计算）。 */
  let ticksCache: Array<{ row: HTMLElement; rowTop: number; top: number; question: string; reply: string }> = []
  /** 文本提取缓存：行元素 → { q, r }，行没变不重算（省掉大量 querySelector/textContent）。 */
  const textCache = new Map<HTMLElement, { q: string; r: string }>()
  /** 上一次渲染的消息行签名（数量 + 首尾消息 offsetTop），用于跳过无变化时的全量重绘。 */
  let lastSig = ''
  /** 与 lastSig 对应的消息行数组（滚动时复用，避免反复全量扫描）。 */
  let lastRows: HTMLElement[] = []
  /** 上次计算的 active 索引（滚动时没变就零写入，省 DOM 操作）。 */
  let lastActiveIdx = -1
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

  /** 收集横线信息（按顺序，聚合排列；消息多时自动缩间距防溢出；文本走缓存）。
   *  每条横线记录 rowTop（消息行在滚动内容里的文档坐标，滚动不变化），
   *  供滚动热路径用 scrollTop 判定可见性，不依赖行是否还在 DOM（虚拟滚动安全）。 */
  const collectTicks = (scroll: HTMLElement, trackH: number): Array<{ row: HTMLElement; rowTop: number; top: number; question: string; reply: string }> => {
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
        rowTop: row.offsetTop,
        top: startTop + i * gap,
        question: cached.q,
        reply: cached.r
      }
    })
  }

  /** 计算当前会话停留的横线索引。
   *  用 scrollTop（滚动坐标）对每条横线记录的 rowTop（文档坐标，滚动不变）判定：
   *  ① 视口内可见的消息 → 取最靠下的那条；
   *  ② 视口内没有（中间全是思考/工具调用行）→ 取视口上方最近的那条；
   *  ③ 连上方都没有（滚到最顶）→ 取最旧一条。
   *  全程零 DOM 查询、零 getBoundingClientRect，虚拟滚动卸载行也不影响。 */
  const activeIndex = (scroll: HTMLElement, ticks: Array<{ rowTop: number }>): number => {
    const st = scroll.scrollTop
    const viewBottom = st + (scroll.clientHeight || 1) - 40
    let visibleIdx = -1
    let aboveIdx = -1
    for (let i = 0; i < ticks.length; i++) {
      const rt = ticks[i].rowTop
      if (rt <= viewBottom) visibleIdx = i
      if (rt < st) aboveIdx = i
    }
    if (visibleIdx !== -1) return visibleIdx
    if (aboveIdx !== -1) return aboveIdx
    return ticks.length > 0 ? 0 : -1
  }

  /** 官方「加载更早」按钮是否存在：只查 .Md3f7G_older 容器（廉价，不扫全部 button）。 */
  const findOlderButton = (scroll: HTMLElement): HTMLButtonElement | null => {
    const older = scroll.querySelector<HTMLElement>('.Md3f7G_older')
    if (older === null) return null
    return older.querySelector<HTMLButtonElement>('button')
  }

  /** 触发官方「加载更早」，轮询等待内容插入后用视口坐标锚点补偿滚动位置（视口不跳）。
   *  带 flowItem 总量保护：会话行数超过 MAX_FLOW_ITEMS 拒绝补载（防 DOM 爆炸保帧率）。 */
  const loadMoreHistory = (): void => {
    const scroll = scrollEl
    if (scroll === null || loadingHistory) return
    // DOM 总量保护：会话已很大时不再补载（帧率优先）
    if (scroll.querySelectorAll<HTMLElement>('.Md3f7G_flowItem').length >= MAX_FLOW_ITEMS) return
    const btn = findOlderButton(scroll)
    if (btn === null) return
    // 锚点：取视口内第一条可见消息（flowItem）作为视觉锚（视口坐标）
    const sRect = scroll.getBoundingClientRect()
    const viewBottom = sRect.bottom
    const candidates = Array.from(scroll.querySelectorAll<HTMLElement>('.Md3f7G_flowItem')).filter((f) => {
      const r = f.getBoundingClientRect()
      return r.top >= sRect.top && r.top <= viewBottom - 10
    })
    const anchor = candidates[0] ?? null
    const anchorViewY = anchor !== null ? anchor.getBoundingClientRect().top - sRect.top : 0
    const beforeH = scroll.scrollHeight
    loadingHistory = true
    btn.click()
    // 轮询：内容插入（scrollHeight 变化）后补偿滚动位置
    let tries = 0
    const poll = (): void => {
      tries++
      if (scroll.scrollHeight !== beforeH || tries > 40) {
        if (anchor !== null && anchor.isConnected) {
          const ar = anchor.getBoundingClientRect()
          scroll.scrollTop = Math.max(0, scroll.scrollTop + (ar.top - sRect.top) - anchorViewY)
        }
        loadingHistory = false
        renderFull()
        return
      }
      setTimeout(poll, 120)
    }
    setTimeout(poll, 120)
  }

  /** 全量重绘：DOM 变化时（observer）才调用。扫描消息行 + 重建横线 + 同步补载触发器。 */
  const renderFull = (): void => {
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
      // 全量重建：先清空旧横线，再按数组顺序重建。
      // 不依赖 data-top key 复用（两个 tick.top 舍入成同 key 会导致 idx 错位），
      // 30 个元素成本 <1ms，idx 永远 = 数组索引，彻底根治高亮错位。
      // 高亮不在此处设置（全 false）——统一由下方 updateActive 单一数据源计算，
      // 避免与滚动路径双源打架、覆盖正确高亮。
      for (const old of Array.from(track.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`))) {
        old.remove()
      }
      ticks.forEach((tick, i) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = ITEM_CLASS
        el.dataset.top = String(Math.round(tick.top))
        el.dataset.idx = String(i)
        el.style.top = `${tick.top}px`
        el.addEventListener('mouseenter', () => onHover(el as HTMLButtonElement, i))
        el.addEventListener('mouseleave', () => onLeave())
        el.addEventListener('click', () => {
          if (scrollEl === null) return
          const target = tick.rowTop - SCROLL_PAD
          scrollEl.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
        })
        el.dataset.active = 'false'
        el.setAttribute('aria-label', tick.question)
        el.title = tick.question
        track.appendChild(el)
      })
      // 重建完统一由单一数据源设置高亮
      updateActive(track, scroll)
    } else {
      // 行集合没变：只更新 active 高亮（跟随滚动），不重建横线
      updateActive(track, scroll)
    }
    // 顶部「加载更早」触发器：有历史可加载时显示（每次渲染都同步）
    let moreEl = track.querySelector<HTMLButtonElement>(`.${MORE_CLASS}`)
    if (findOlderButton(scroll) !== null) {
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
      findOlderButton(scroll) !== null
    ) {
      autoLoadCount++
      window.setTimeout(() => loadMoreHistory(), 300)
    }
  }

  /** 轻量更新（滚动热路径）：零 DOM 扫描，只更新 active 高亮。
   *  行集合与横线都来自缓存，滚动时完全不碰 querySelectorAll。 */
  const renderLight = (): void => {
    const ctx2 = ensureRail()
    if (ctx2 === null) return
    const { rail, scroll } = ctx2
    const track = rail.querySelector<HTMLElement>(`.${TRACK_CLASS}`)
    if (track === null) return
    updateActive(track, scroll)
  }

  /** 只更新 active 高亮（滚动热路径）。
   *  实时 collectUserMessages（fast-path 单查询 + slice(30)）拿当前 DOM 行，
   *  用 offsetTop（文档坐标，不随滚动变）+ scrollTop 判定可见性。
   *  ——单一数据源：与 renderFull 重建一致，无双源冲突。
   *  虚拟滚动重挂行瞬间行可能为 0，此时跳过（保留现有高亮，等行回来再算），
   *  避免重建把正确高亮覆盖成空。每帧成本 <0.5ms。 */
  const updateActive = (track: HTMLElement, scroll: HTMLElement): void => {
    const rows = collectUserMessages(scroll)
    if (rows.length === 0) return // 虚拟滚动重挂瞬间，跳过保留现状
    const activeIdx = activeIndex(scroll, rows.map((r) => ({ rowTop: r.offsetTop })))
    lastActiveIdx = activeIdx
    const items = track.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`)
    for (const el of items) {
      el.dataset.active = String(hoverIdx === -1 && Number(el.dataset.idx ?? -1) === activeIdx)
    }
  }

  /** hover 进入：级联加长（3 / 2 / 1.5 倍），延迟弹出预览卡片，隐藏 active 高亮。 */
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
    // 预览卡片延迟显示：快速划过横线（<250ms 就移走）不弹卡片，停住才显示。
    // 延迟期间若 hover 到别的横线，旧计时器被取消，只保留最新的。
    if (tipTimer !== 0) clearTimeout(tipTimer)
    tipTimer = window.setTimeout(() => {
      tipTimer = 0
      // 只有仍 hover 在同一横线才弹（防延迟期间已移走/切到别的横线）
      if (hoverIdx !== idx) return
      const tick = ticksCache[idx]
      if (tick !== undefined) showTip(tick, anchor)
    }, TIP_DELAY_MS)
  }

  /** hover 离开：取消延迟计时器，立即移除预览卡片，恢复当前会话高亮。 */
  const onLeave = (): void => {
    hoverIdx = -1
    // 取消延迟显示计时器：延迟内移走 → 不弹卡片
    if (tipTimer !== 0) {
      clearTimeout(tipTimer)
      tipTimer = 0
    }
    // 立即移除卡片（不淡出）：快速移动时旧卡片若淡出会与下一张重叠
    const tip = tipEl
    tipEl = null
    if (tip !== null) tip.remove()
    const track = railEl?.querySelector<HTMLElement>(`.${TRACK_CLASS}`)
    if (!track) return
    const items = Array.from(track.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`))
    for (const el of items) {
      el.classList.remove('dsh-timeline-hover-self', 'dsh-timeline-hover-1', 'dsh-timeline-hover-2')
    }
    // 恢复当前会话高亮（基于缓存数据；强制重算）
    if (scrollEl !== null && ticksCache.length > 0) {
      lastActiveIdx = -1
      updateActive(track, scrollEl)
    }
  }

  /** 显示预览卡片（白色圆角，消息 + 回复）。淡入 + 轻微上浮动画。 */
  const showTip = (tick: { question: string; reply: string }, anchor: HTMLElement): void => {
    // 立即移除旧卡片（不淡出）：快速 hover 到另一条横线时，旧卡片淡出中会与新卡片重叠
    const old = tipEl
    tipEl = null
    if (old !== null) old.remove()
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
    // 淡入 + 轻微上浮（WAAPI 驱动，无视 CSS 优先级覆盖）
    tip.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0px)' },
      ],
      { duration: 160, easing: 'ease-out' },
    )
    tipEl = tip
  }

  /** 隐藏预览卡片。淡出 + 轻微下沉动画后移除。 */
  const hideTip = (): void => {
    const tip = tipEl
    tipEl = null
    if (tip === null) return
    const anim = tip.animate(
      [
        { opacity: 1, transform: 'translateY(0px)' },
        { opacity: 0, transform: 'translateY(4px)' },
      ],
      { duration: 120, easing: 'ease-in' },
    )
    anim.onfinish = () => tip.remove()
    // 兜底：动画被中断（如页面隐藏）时也确保移除
    window.setTimeout(() => {
      if (tip.isConnected) tip.remove()
    }, 200)
  }

  /** 滚动 + resize 热路径。
   *  DSH 是虚拟滚动：scroll 事件触发时行可能尚未重挂，即时 updateActive 用旧行算不准；
   *  因此先即时更新（流畅反馈），再延迟 150ms 重算一次（等虚拟滚动重挂行，修正精确值）。
   *  不用 rAF（后台/headless 不执行会丢事件）。 */
  let settleTimer = 0
  const schedule = (): void => {
    if (raf !== 0) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    renderLight()
    if (settleTimer !== 0) clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      settleTimer = 0
      renderLight()
    }, 150)
  }

  ctx.effect(() => {
    renderFull()
    // 滚动监听绑 document（capture）而非死绑 scrollEl：
    // DSH 虚拟滚动会替换/重建 .wSkVaW_scrollBody，死绑旧元素会收不到
    // 新元素的滚动 → active 卡旧值。capture 捕获任何元素的滚动。
    document.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    // 消息新增 / 切换会话 / DOM 变化：防抖 250ms 合并高频变更（工具调用、流式输出），
    // 避免每帧都全量 render。rail 失联时立即重建。
    const observer = new MutationObserver(() => {
      if (railEl === null || !railEl.isConnected) {
        renderFull()
        return
      }
      if (obsTimer !== 0) return
      obsTimer = window.setTimeout(() => {
        obsTimer = 0
        renderFull()
      }, OBS_DEBOUNCE_MS)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      if (obsTimer !== 0) {
        clearTimeout(obsTimer)
        obsTimer = 0
      }
      if (settleTimer !== 0) {
        clearTimeout(settleTimer)
        settleTimer = 0
      }
      // 取消延迟显示计时器 + 立即移除卡片
      if (tipTimer !== 0) {
        clearTimeout(tipTimer)
        tipTimer = 0
      }
      const tip = tipEl
      tipEl = null
      if (tip !== null) tip.remove()
      document.removeEventListener('scroll', schedule, true)
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
      lastActiveIdx = -1
      hoverIdx = -1
      loadingHistory = false
      autoLoadCount = 0
    }
  }, 'timeline-rail: message timeline marks')
}
