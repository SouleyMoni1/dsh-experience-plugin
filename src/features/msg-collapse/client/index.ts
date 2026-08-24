/**
 * msg-collapse —— browser 半区：AI 回复上方的「工作过程折叠横条」。
 *
 * 每个「用户提问 → AI 工作过程 → AI 最终回复」为一个回合（round）。
 * 在**AI 最终回复上方**插入一条浅色分割线横条，横条上放
 * 「已工作 X 分 X 秒 ›」总结按钮：
 *  - 点击折叠：隐藏本回合的工作过程（Think / 工具调用 / 上下文注入），
 *    只保留用户消息 + AI 最终回复（隐藏其 Think 标题，只留干净正文）+ 状态行。
 *  - 再次点击展开：恢复全部工作过程。
 *
 * 实现：纯 DOM 操作，不改 DSH 内部状态。
 *  - 回合边界：相邻两条 .gdEzaW_userRow 之间的 flowItem 为一个回合。
 *  - 工作过程 = 回合内所有含 .Sxvs8a_root / .ztWv_q_callRow / 上下文注入 的 flowItem
 *    （不含最后一个 Sxvs8a 最终回复块）。
 *  - AI 最终回复 = 回合内最后一个 Sxvs8a 块。
 *  - 横条插入位置 = 最终回复 flowItem 内部、Sxvs8a_root 之前。
 *  - 时长从状态行「用时 X分X秒」正则提取，兜底用工作步数。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** 横条根节点 class。 */
const BAR_CLASS = 'dsh-msg-collapse-bar'
/** 横条上的按钮 class。 */
const TOGGLE_CLASS = 'dsh-msg-collapse-toggle'
/** 箭头 class。 */
const ARROW_CLASS = 'dsh-msg-collapse-arrow'
/** 已折叠状态的标记 class。 */
const COLLAPSED_CLASS = 'dsh-msg-collapse-collapsed'
/** 工作过程标记 class。 */
const WORK_CLASS = 'dsh-msg-collapse-work'
/** 样式标签 key。 */
const CSS_TAG = 'dsh-experience/msg-collapse.css'

/** 注入样式。 */
function injectCss(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll(`style[data-dsh-css=${JSON.stringify(CSS_TAG)}]`).forEach((s) => s.remove())
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-experience-plugin'
  tag.dataset.dshCss = CSS_TAG
  tag.textContent = [
    /* 横条：浅色分割线 + 右侧「已工作」按钮，横跨整个回复区 */
    `.${BAR_CLASS}{`,
    'display:flex;align-items:center;gap:10px;',
    'padding:6px 4px 2px;',
    'user-select:none;',
    '}',
    /* 浅色分割线 */
    `.${BAR_CLASS}::before{`,
    'content:"";flex:1;height:1px;',
    'background:var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.18));',
    '}',
    /* 按钮：浅灰小字，hover 加深 */
    `.${TOGGLE_CLASS}{`,
    'display:inline-flex;align-items:center;gap:4px;',
    'padding:2px 8px;border:none;background:transparent;',
    'font-size:11px;line-height:1.4;color:rgba(127,127,127,.65);',
    'cursor:pointer;white-space:nowrap;',
    'transition:color .12s ease;',
    '}',
    `.${TOGGLE_CLASS}:hover{color:var(--dsw-alias-state-info-primary,#4ea1ff);}`,
    `.${ARROW_CLASS}{`,
    'display:inline-block;font-size:10px;',
    'transform:rotate(0deg);transition:transform .15s ease;',
    '}',
    /* 折叠后箭头朝右 */
    `.${COLLAPSED_CLASS} .${ARROW_CLASS}{transform:rotate(90deg);}`,
  ].join('\n')
  document.head.appendChild(tag)
}

/** 判断一个 flowItem 是否属于「工作过程」（可折叠隐藏）。 */
function isWorkItem(el: HTMLElement): boolean {
  if (el.querySelector('.gdEzaW_userRow') !== null) return false // 用户消息本身
  if (el.querySelector('[class*="Sxvs8a_root"]') !== null) return true // Think / 回复块
  if (el.querySelector('[class*="ztWv_q_callRow"]') !== null) return true // 工具调用
  const txt = (el.textContent || '').trim()
  if (txt.startsWith('上下文注入')) return true
  return false
}

/** 收集一个回合里所有工作过程 flowItem（不含用户消息、不含最终回复、不含状态行）。 */
function collectWorkItems(start: number, end: number, items: HTMLElement[]): HTMLElement[] {
  const out: HTMLElement[] = []
  for (let i = start + 1; i <= end; i++) {
    const el = items[i]
    if (el.querySelector('.gdEzaW_userRow') !== null) continue
    if (el.querySelector('[class*="Sxvs8a_root"]') !== null) {
      // 保留最后一个 Sxvs8a（AI 最终回复）
      let isLast = true
      for (let j = i + 1; j <= end; j++) {
        if (items[j].querySelector('[class*="Sxvs8a_root"]') !== null) { isLast = false; break }
      }
      if (isLast) continue // 最终回复不隐藏
    }
    if (isWorkItem(el)) out.push(el)
  }
  return out
}

/** 计算回合里工作过程数量（用于兜底文案）。 */
function workCount(start: number, end: number, items: HTMLElement[]): number {
  let n = 0
  for (let i = start + 1; i <= end; i++) {
    const el = items[i]
    if (el.querySelector('.gdEzaW_userRow') !== null) continue
    if (el.querySelector('[class*="Sxvs8a_root"]') !== null) {
      let isLast = true
      for (let j = i + 1; j <= end; j++) {
        if (items[j].querySelector('[class*="Sxvs8a_root"]') !== null) { isLast = false; break }
      }
      if (isLast) continue
    }
    if (isWorkItem(el)) n++
  }
  return n
}

/** 找到回合内 AI 最终回复的 flowItem（最后一个 Sxvs8a），没有则 null。 */
function findFinalReply(start: number, end: number, items: HTMLElement[]): HTMLElement | null {
  for (let i = end; i > start; i--) {
    if (items[i].querySelector('[class*="Sxvs8a_root"]') !== null) return items[i]
  }
  return null
}

/** 从状态行文本提取「X分X秒」用时；失败返回 null。 */
function extractDuration(items: HTMLElement[], start: number, end: number): string | null {
  // 状态行通常在回合末尾，含「用时 X分X秒」
  for (let i = end; i > start; i--) {
    const txt = (items[i].textContent || '').trim()
    const m = txt.match(/用时\s*([0-9]+(?:\.[0-9]+)?)\s*(小时|分钟|分|秒)/)
    if (m) {
      const num = m[1]
      const unit = m[2] === '分钟' ? '分' : m[2] === '小时' ? '小时' : m[2]
      return `${num} ${unit}`
    }
  }
  return null
}

/** 给一个回合注入折叠横条（插在 AI 最终回复上方）。 */
function setupRound(start: number, end: number, items: HTMLElement[]): void {
  const finalReply = findFinalReply(start, end, items)
  if (finalReply === null) return // 没有 AI 回复，跳过
  if (finalReply.querySelector(`.${BAR_CLASS}`) !== null) return // 已注入
  const n = workCount(start, end, items)
  if (n === 0) return // 没有工作过程，不需要折叠

  // 横条
  const bar = document.createElement('div')
  bar.className = BAR_CLASS

  // 按钮
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = TOGGLE_CLASS
  const arrow = document.createElement('span')
  arrow.className = ARROW_CLASS
  arrow.textContent = '›'
  const label = document.createElement('span')
  label.className = 'dsh-msg-collapse-label'
  // 文案：优先用时，兜底步数
  const dur = extractDuration(items, start, end)
  const base = dur !== null ? `已工作 ${dur}` : `已工作 ${n} 步`
  label.textContent = base
  btn.append(arrow, label)
  bar.appendChild(btn)

  // 插到 Sxvs8a_root 之前
  const sx = finalReply.querySelector<HTMLElement>('[class*="Sxvs8a_root"]')
  if (sx !== null && sx.parentElement !== null) {
    sx.parentElement.insertBefore(bar, sx)
  } else {
    finalReply.appendChild(bar)
  }

  let collapsed = false
  const apply = () => {
    const work = collectWorkItems(start, end, items)
    for (const w of work) {
      w.classList.toggle(WORK_CLASS, collapsed)
      w.style.display = collapsed ? 'none' : ''
    }
    // 最终回复块：折叠时隐藏其 Think 标题，只留干净正文
    const qw = finalReply.querySelector<HTMLElement>('[class*="QWLzlG_root"]')
    if (qw !== null) qw.style.display = collapsed ? 'none' : ''
    bar.classList.toggle(COLLAPSED_CLASS, collapsed)
    label.textContent = collapsed ? `${base} · 展开` : base
  }
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    collapsed = !collapsed
    apply()
  })
  // 初始标记工作过程 class（不隐藏）
  const work = collectWorkItems(start, end, items)
  for (const w of work) w.classList.add(WORK_CLASS)
}

/** 主装配：扫描会话，为每个回合的 AI 回复上方设置折叠横条。 */
function applyCollapse(): void {
  const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
  if (scroll === null) return
  const items = Array.from(scroll.querySelectorAll<HTMLElement>('.Md3f7G_flowItem'))
  if (items.length === 0) return
  // 找所有用户消息行
  const userIdxs: number[] = []
  items.forEach((f, i) => { if (f.querySelector('.gdEzaW_userRow') !== null) userIdxs.push(i) })
  // 清理已不存在的横条（会话切换 / 行被虚拟滚动卸载时）
  scroll.querySelectorAll(`.${BAR_CLASS}`).forEach((b) => {
    if (!b.isConnected) b.remove()
  })
  for (let k = 0; k < userIdxs.length; k++) {
    const start = userIdxs[k]
    const end = k + 1 < userIdxs.length ? userIdxs[k + 1] - 1 : items.length - 1
    setupRound(start, end, items)
  }
}

/**
 * 浏览器侧入口。
 * @param ctx - client 上下文。
 */
export function applyMsgCollapse(ctx: ClientContext): void {
  ctx.effect(() => {
    injectCss()
    // 首次扫描
    applyCollapse()
    // 会话切换 / 消息新增：防抖扫描（DSH 虚拟滚动会重建 DOM）
    let timer = 0
    const observer = new MutationObserver(() => {
      if (timer !== 0) return
      timer = window.setTimeout(() => {
        timer = 0
        applyCollapse()
      }, 300)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    // 滚动时虚拟滚动可能卸载/重挂行，轻量清理失联横条
    const onScroll = () => {
      if (timer !== 0) return
      timer = window.setTimeout(() => {
        timer = 0
        const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
        if (scroll) {
          scroll.querySelectorAll(`.${BAR_CLASS}`).forEach((b) => {
            if (!b.isConnected) b.remove()
          })
        }
      }, 300)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      if (timer !== 0) clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener('scroll', onScroll, true)
      document.querySelectorAll(`.${BAR_CLASS}`).forEach((b) => b.remove())
    }
  }, 'dsh-experience-plugin: msg-collapse')
}
