/**
 * msg-collapse —— browser 半区：会话消息回合折叠。
 *
 * 每个「用户提问 → AI 工作过程 → AI 最终回复」为一个回合（round）。
 * 默认展开；点用户消息右上角的折叠按钮可收起：
 *  - 收起时：隐藏本回合的工作过程（Think / 工具调用 / 上下文注入），
 *    只保留用户消息 + AI 最终回复（最后一个非 Think 的 Sxvs8a 块）。
 *  - 再次点击展开，恢复全部工作过程。
 *
 * 实现：纯 DOM 操作，不改 DSH 内部状态。
 *  - 回合边界：相邻两条 .gdEzaW_userRow 之间的 flowItem 为一个回合。
 *  - 工作过程 = 回合内所有含 .Sxvs8a_root / .ztWv_q_callRow / 上下文注入 的 flowItem。
 *  - AI 最终回复 = 回合内最后一个 Sxvs8a 块（不隐藏它）。
 *  - 折叠按钮：注入到 userRow 气泡右侧（float 定位，不参与 DSH 布局）。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** 折叠按钮的标记 class（避免重复注入）。 */
const BTN_CLASS = 'dsh-msg-collapse-btn'
/** 已折叠状态的标记 class（用于样式）。 */
const COLLAPSED_CLASS = 'dsh-msg-collapse-collapsed'
/** 回合工作过程的标记 class（用于定位可隐藏项）。 */
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
    /* 折叠按钮：钉在用户气泡右上角 */
    `.${BTN_CLASS}{`,
    'position:absolute;top:4px;right:4px;',
    'z-index:20;',
    'display:inline-flex;align-items:center;gap:3px;',
    'padding:2px 7px;border-radius:6px;',
    'font-size:11px;line-height:1.4;color:rgba(127,127,127,.8);',
    'background:rgba(127,127,127,.12);border:1px solid rgba(127,127,127,.2);',
    'cursor:pointer;',
    'opacity:0;transition:opacity .12s ease;',
    'user-select:none;',
    '}',
    `.${BTN_CLASS}:hover{opacity:1;color:var(--dsw-alias-state-info-primary,#4ea1ff);}`,
    /* 用户消息气泡 hover 时显示按钮（按钮自己 hover 也显示） */
    `.gdEzaW_userRow:hover .${BTN_CLASS}, .${BTN_CLASS}:hover{opacity:1;}`,
    `.${BTN_CLASS} .dsh-msg-collapse-arrow{display:inline-block;font-size:9px;transform:rotate(0deg);transition:transform .15s ease;}`,
    `.${COLLAPSED_CLASS} .${BTN_CLASS} .dsh-msg-collapse-arrow{transform:rotate(-90deg);}`,
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

/** 收集一个回合里所有工作过程 flowItem（不含用户消息、不含状态行）。 */
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

/** 计算回合里工作过程数量（用于按钮文案）。 */
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

/** 给一个回合注入折叠按钮 + 标记工作过程。 */
function setupRound(userRow: HTMLElement, start: number, end: number, items: HTMLElement[]): void {
  if (userRow.querySelector(`.${BTN_CLASS}`) !== null) return // 已注入
  const n = workCount(start, end, items)
  if (n === 0) return // 没有工作过程，不需要折叠
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = BTN_CLASS
  btn.setAttribute('aria-label', '折叠本回合工作过程')
  const arrow = document.createElement('span')
  arrow.className = 'dsh-msg-collapse-arrow'
  arrow.textContent = '▼'
  const label = document.createElement('span')
  label.className = 'dsh-msg-collapse-label'
  label.textContent = `已工作`
  btn.append(arrow, label)
  // 需要 userRow 有定位上下文
  const rowStyle = getComputedStyle(userRow)
  if (rowStyle.position === 'static') userRow.style.position = 'relative'
  userRow.appendChild(btn)

  let collapsed = false
  const apply = () => {
    const work = collectWorkItems(start, end, items)
    for (const w of work) {
      w.classList.toggle(WORK_CLASS, collapsed)
      w.style.display = collapsed ? 'none' : ''
    }
    // 最终回复块（最后一个 Sxvs8a）：折叠时隐藏其 Think 标题，只留干净正文
    let finalSx: HTMLElement | null = null
    for (let i = end; i > start; i--) {
      const sx = items[i].querySelector<HTMLElement>('[class*="Sxvs8a_root"]')
      if (sx !== null) { finalSx = items[i]; break }
    }
    if (finalSx !== null) {
      const qw = finalSx.querySelector<HTMLElement>('[class*="QWLzlG_root"]')
      if (qw !== null) {
        qw.style.display = collapsed ? 'none' : ''
      }
    }
    userRow.classList.toggle(COLLAPSED_CLASS, collapsed)
    label.textContent = collapsed ? `已工作 ${n} 步 · 展开` : `已工作 ${n} 步`
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

/** 主装配：扫描会话，为每个回合设置折叠。 */
function applyCollapse(): void {
  const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
  if (scroll === null) return
  const items = Array.from(scroll.querySelectorAll<HTMLElement>('.Md3f7G_flowItem'))
  if (items.length === 0) return
  // 找所有用户消息行
  const userIdxs: number[] = []
  items.forEach((f, i) => { if (f.querySelector('.gdEzaW_userRow') !== null) userIdxs.push(i) })
  // 清理已不存在的按钮（会话切换时）
  scroll.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => {
    const ur = b.closest('.gdEzaW_userRow')
    if (ur === null || !ur.isConnected) b.remove()
  })
  for (let k = 0; k < userIdxs.length; k++) {
    const start = userIdxs[k]
    const end = k + 1 < userIdxs.length ? userIdxs[k + 1] - 1 : items.length - 1
    const userRow = items[start].querySelector<HTMLElement>('.gdEzaW_userRow')
    if (userRow === null) continue
    setupRound(userRow, start, end, items)
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
    // 滚动时也可能触发虚拟滚动重建，轻量扫描（不重建按钮，只清理失联）
    const onScroll = () => {
      if (timer !== 0) return
      timer = window.setTimeout(() => {
        timer = 0
        // 滚动时仅清理失联按钮，不重复注入
        const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
        if (scroll) {
          scroll.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => {
            const ur = b.closest('.gdEzaW_userRow')
            if (ur === null || !ur.isConnected) b.remove()
          })
        }
      }, 300)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      if (timer !== 0) clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener('scroll', onScroll, true)
      document.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => b.remove())
    }
  }, 'dsh-experience-plugin: msg-collapse')
}
