/**
 * msg-collapse —— browser 半区：每个 AI 处理过程块上方的「工作过程折叠横条」。
 *
 * 连续对话中，每次回复的多步骤处理过程（Think / 工具调用 / 上下文注入）算一个块。
 * 在该块的**第一个元素上方**（用户消息之后）插入一条浅色分割线横条，
 * 横条右侧是「已工作 X 分 X 秒 ›」总结按钮（时长从本回合状态行「用时」提取）：
 *  - 默认：最新回合处理过程**展开显示**，历史回合处理过程**折叠隐藏**。
 *  - 点击某条横条：独立折叠/展开该回合的处理过程（Think/工具调用/上下文注入），
 *    只保留用户消息 + AI 最终回复（隐藏其 Think 标题，只留干净正文）+ 状态行。
 *
 * 实现：纯 DOM 操作，不改 DSH 内部状态。
 *  - 回合边界：相邻两条 .gdEzaW_userRow 之间的 flowItem 为一个回合。
 *  - 处理过程 = 回合内所有含 .Sxvs8a_root / .ztWv_q_callRow / 上下文注入 的 flowItem
 *    （不含最后一个 Sxvs8a 最终回复块）。
 *  - 横条插入位置 = 回合内**第一个处理过程 flowItem 之前**（用户消息与 Think 之间）。
 *  - AI 最终回复 = 回合内最后一个 Sxvs8a 块；其 Think 标题随折叠状态隐藏。
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
    /* 横条：浅色分割线 + 右侧「已工作」按钮 */
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

/** 判断一个 flowItem 是否属于「处理过程」（可折叠隐藏）。 */
function isWorkItem(el: HTMLElement): boolean {
  if (el.querySelector('.gdEzaW_userRow') !== null) return false // 用户消息本身
  if (el.querySelector('[class*="Sxvs8a_root"]') !== null) return true // Think / 回复块
  if (el.querySelector('[class*="ztWv_q_callRow"]') !== null) return true // 工具调用
  const txt = (el.textContent || '').trim()
  if (txt.startsWith('上下文注入')) return true
  return false
}

/** 收集一个回合里所有处理过程 flowItem（不含用户消息、不含最终回复、不含状态行）。 */
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

/** 找到回合内**第一个**处理过程 flowItem（横条插它前面）；无则 null。 */
function findFirstWork(start: number, end: number, items: HTMLElement[]): HTMLElement | null {
  for (let i = start + 1; i <= end; i++) {
    const el = items[i]
    if (el.querySelector('.gdEzaW_userRow') !== null) continue
    if (el.querySelector('[class*="Sxvs8a_root"]') !== null) return el
    if (el.querySelector('[class*="ztWv_q_callRow"]') !== null) return el
    const txt = (el.textContent || '').trim()
    if (txt.startsWith('上下文注入')) return el
  }
  return null
}

/** 找到回合内 AI 最终回复的 flowItem（最后一个 Sxvs8a），没有则 null。 */
function findFinalReply(start: number, end: number, items: HTMLElement[]): HTMLElement | null {
  for (let i = end; i > start; i--) {
    if (items[i].querySelector('[class*="Sxvs8a_root"]') !== null) return items[i]
  }
  return null
}

/** 从状态行文本提取「X分X秒」；失败返回 null。 */
function extractDuration(start: number, end: number, items: HTMLElement[]): string | null {
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

/** 给一个回合注入折叠横条（插在第一个处理过程上方）。 */
function setupRound(start: number, end: number, items: HTMLElement[]): void {
  const firstWork = findFirstWork(start, end, items)
  if (firstWork === null) return // 没有处理过程，跳过
  // 已注入检查：紧邻前一个兄弟是横条才跳过（不能查整个父容器——所有 flowItem 同父）
  if (firstWork.previousElementSibling !== null && firstWork.previousElementSibling.classList.contains(BAR_CLASS)) return

  const work = collectWorkItems(start, end, items)
  const finalReply = findFinalReply(start, end, items)
  if (work.length === 0) return // 没有可折叠内容

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
  const dur = extractDuration(start, end, items)
  const base = dur !== null ? `已工作 ${dur}` : `已工作 ${work.length} 步`
  label.textContent = base
  btn.append(arrow, label)
  bar.appendChild(btn)

  // 插到第一个处理过程之前
  if (firstWork.parentElement !== null) {
    firstWork.parentElement.insertBefore(bar, firstWork)
  }

  // 默认状态：最新回合展开，历史回合折叠
  const isLastRound = (() => {
    const userRows: number[] = []
    items.forEach((f, i) => { if (f.querySelector('.gdEzaW_userRow') !== null) userRows.push(i) })
    const lastStart = userRows[userRows.length - 1]
    return start === lastStart
  })()

  let collapsed = !isLastRound // 历史回合默认折叠
  const apply = () => {
    for (const w of work) {
      w.classList.toggle(WORK_CLASS, true)
      w.style.display = collapsed ? 'none' : ''
    }
    // 最终回复块：折叠时隐藏其 Think 标题，只留干净正文
    if (finalReply !== null) {
      const qw = finalReply.querySelector<HTMLElement>('[class*="QWLzlG_root"]')
      if (qw !== null) qw.style.display = collapsed ? 'none' : ''
    }
    bar.classList.toggle(COLLAPSED_CLASS, collapsed)
    label.textContent = collapsed ? `${base} · 展开` : base
  }
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    collapsed = !collapsed
    apply()
  })
  // 初始标记 + 应用默认状态
  apply()
}

/** 主装配：扫描会话，为每个回合的第一个处理过程上方设置折叠横条。 */
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

/** 官方「加载更早」按钮：.Md3f7G_older 容器内的 button；无则 null。 */
function findOlderButton(scroll: HTMLElement): HTMLButtonElement | null {
  const older = scroll.querySelector<HTMLElement>('.Md3f7G_older')
  if (older === null) return null
  return older.querySelector<HTMLButtonElement>('button')
}

/** 自动把历史会话全部加载出来：反复点「加载更早」直到按钮消失。
 *  带次数上限防死循环；每轮等待 scrollHeight 变化后再点下一次。 */
let loadAllRunning = false
function loadAllHistory(): void {
  const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
  if (scroll === null) return
  // 防止并发触发
  if (loadAllRunning) return
  loadAllRunning = true

  const MAX_TRIES = 60 // 单次会话加载上限（防异常死循环）
  let tries = 0
  const step = (): void => {
    if (tries >= MAX_TRIES) {
      loadAllRunning = false
      applyCollapse()
      return
    }
    const btn = findOlderButton(scroll)
    if (btn === null) {
      // 全部加载完成
      loadAllRunning = false
      applyCollapse()
      return
    }
    const beforeH = scroll.scrollHeight
    tries++
    btn.click()
    // 等内容插入（scrollHeight 变化），再继续
    let poll = 0
    const check = (): void => {
      poll++
      if (scroll.scrollHeight !== beforeH || poll > 30) {
        // 内容已插入，等渲染稳定再点下一次
        window.setTimeout(step, 150)
        return
      }
      window.setTimeout(check, 120)
    }
    window.setTimeout(check, 120)
  }
  window.setTimeout(step, 100)
}

/**
 * 浏览器侧入口。
 * @param ctx - client 上下文。
 */
export function applyMsgCollapse(ctx: ClientContext): void {
  ctx.effect(() => {
    injectCss()
    applyCollapse()
    // 自动把历史会话全部加载出来（点「加载更早」直到按钮消失），加载后重新扫描
    loadAllHistory()
    // 会话切换 / 消息新增：防抖扫描 + 自动补载历史
    let timer = 0
    const observer = new MutationObserver(() => {
      if (timer !== 0) return
      timer = window.setTimeout(() => {
        timer = 0
        applyCollapse()
        // 有「加载更早」按钮 → 自动继续加载历史（直到全部加载完）
        const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
        if (scroll !== null && findOlderButton(scroll) !== null) {
          loadAllHistory()
        }
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
