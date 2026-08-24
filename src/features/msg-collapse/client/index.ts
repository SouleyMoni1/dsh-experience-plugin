/**
 * msg-collapse —— browser 半区：会话顶部「工作过程折叠横条」。
 *
 * 整个会话只在**最顶部**放一条浅色分割线横条，横条右侧是
 * 「已工作 X 分 X 秒 ›」总结按钮（总时长 = 所有回合状态行「用时」之和）：
 *  - 默认（mode 0）：**历史回合**的工作过程折叠隐藏，**当前回复**（最新一轮）
 *    的工作过程显示 —— 一眼看最新，历史不占屏。
 *  - 点击一次（mode 1）：全部工作过程折叠（含当前）。
 *  - 再点（mode 2）：全部展开。
 *  - 再点回到 mode 0（历史折叠 + 当前显示）。三态循环。
 *
 * 实现：纯 DOM 操作，不改 DSH 内部状态。
 *  - 回合边界：相邻两条 .gdEzaW_userRow 之间的 flowItem 为一个回合。
 *  - 工作过程 = 回合内所有含 .Sxvs8a_root / .ztWv_q_callRow / 上下文注入 的 flowItem
 *    （不含最后一个 Sxvs8a 最终回复块）。
 *  - AI 最终回复 = 回合内最后一个 Sxvs8a 块；其 Think 标题随回合折叠状态隐藏。
 *  - 横条插入位置 = 会话内容区第一个 flowItem 之前（Md3f7G_column 顶部）。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** 横条根节点 class。 */
const BAR_CLASS = 'dsh-msg-collapse-bar'
/** 横条上的按钮 class。 */
const TOGGLE_CLASS = 'dsh-msg-collapse-toggle'
/** 箭头 class。 */
const ARROW_CLASS = 'dsh-msg-collapse-arrow'
/** 工作过程标记 class。 */
const WORK_CLASS = 'dsh-msg-collapse-work'
/** 最终回复的 Think 标题标记 class。 */
const TITLE_CLASS = 'dsh-msg-collapse-title'
/** 样式标签 key。 */
const CSS_TAG = 'dsh-experience/msg-collapse.css'

/** 一个回合的数据。 */
interface Round {
  /** flowItem 区间 [start, end]。 */
  start: number
  end: number
  /** 本回合工作过程 flowItem（不含用户消息、不含最终回复、不含状态行）。 */
  work: HTMLElement[]
  /** 最终回复 flowItem（最后一个 Sxvs8a），无则 null。 */
  finalReply: HTMLElement | null
  /** 最终回复的 Think 标题元素（QWLzlG），无则 null。 */
  titleEl: HTMLElement | null
  /** 本次扫描的完整 flowItem 数组（供时长提取）。 */
  items: HTMLElement[]
}

/** 注入样式。 */
function injectCss(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll(`style[data-dsh-css=${JSON.stringify(CSS_TAG)}]`).forEach((s) => s.remove())
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-experience-plugin'
  tag.dataset.dshCss = CSS_TAG
  tag.textContent = [
    /* 横条：浅色分割线 + 右侧「已工作」按钮，横跨整个内容区 */
    `.${BAR_CLASS}{`,
    'display:flex;align-items:center;gap:10px;',
    'padding:8px 4px 4px;',
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
    'font-size:12px;line-height:1.4;color:rgba(127,127,127,.7);',
    'cursor:pointer;white-space:nowrap;',
    'transition:color .12s ease;',
    '}',
    `.${TOGGLE_CLASS}:hover{color:var(--dsw-alias-state-info-primary,#4ea1ff);}`,
    `.${ARROW_CLASS}{`,
    'display:inline-block;font-size:11px;',
    'transform:rotate(0deg);transition:transform .15s ease;',
    '}',
    /* 全折叠时箭头朝右 */
    `.${BAR_CLASS}.dsh-msg-collapse-all-hidden .${ARROW_CLASS}{transform:rotate(90deg);}`,
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

/** 扫描会话，构建所有回合数据。 */
function collectRounds(): Round[] {
  const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
  if (scroll === null) return []
  const items = Array.from(scroll.querySelectorAll<HTMLElement>('.Md3f7G_flowItem'))
  if (items.length === 0) return []
  const userIdxs: number[] = []
  items.forEach((f, i) => { if (f.querySelector('.gdEzaW_userRow') !== null) userIdxs.push(i) })
  if (userIdxs.length === 0) return []

  const rounds: Round[] = []
  for (let k = 0; k < userIdxs.length; k++) {
    const start = userIdxs[k]
    const end = k + 1 < userIdxs.length ? userIdxs[k + 1] - 1 : items.length - 1
    // 工作过程
    const work: HTMLElement[] = []
    let finalReply: HTMLElement | null = null
    // 先找最终回复（最后一个 Sxvs8a）
    for (let i = end; i > start; i--) {
      if (items[i].querySelector('[class*="Sxvs8a_root"]') !== null) { finalReply = items[i]; break }
    }
    for (let i = start + 1; i <= end; i++) {
      const el = items[i]
      if (el === finalReply) continue
      if (el.querySelector('.gdEzaW_userRow') !== null) continue
      if (isWorkItem(el)) work.push(el)
    }
    const titleEl = finalReply?.querySelector<HTMLElement>('[class*="QWLzlG_root"]') ?? null
    rounds.push({ start, end, work, finalReply, titleEl, items })
  }
  return rounds
}

/** 从状态行文本提取秒数；无则 0。 */
function extractSeconds(round: Round): number {
  for (let i = round.start; i <= round.end; i++) {
    const el = round.items[i]
    if (!el) continue
    const txt = (el.textContent || '').trim()
    const m = txt.match(/用时\s*([0-9]+(?:\.[0-9]+)?)\s*(小时|分钟|分|秒)/)
    if (m) {
      const num = parseFloat(m[1])
      if (m[2] === '小时') return Math.round(num * 3600)
      if (m[2] === '分钟' || m[2] === '分') return Math.round(num * 60)
      return Math.round(num)
    }
  }
  return 0
}

/** 格式化总秒数为「X 小时 Y 分」/「X 分 Y 秒」/「Y 秒」。 */
function formatDuration(totalSec: number): string {
  if (totalSec <= 0) return ''
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h} 小时 ${m} 分`
  if (m > 0) return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`
  return `${s} 秒`
}

/** 当前生效的三态模式：0=历史折叠+当前显示 / 1=全部折叠 / 2=全部展开。 */
type Mode = 0 | 1 | 2

/** bar 元素上挂的运行时状态（避免闭包失效，补载后能更新 rounds）。 */
interface BarState {
  rounds: Round[]
  mode: Mode
  label: HTMLElement
  arrow: HTMLElement
  durText: string
  baseText: string
}

/** 装配顶部横条。bar 已存在时更新其 rounds 并重新应用（补载后新回合也生效）。 */
function setupBar(rounds: Round[]): void {
  const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
  if (scroll === null || rounds.length === 0) return
  const first = scroll.querySelector<HTMLElement>('.Md3f7G_flowItem')
  if (first === null) return

  // 标记工作过程 + Think 标题（幂等：classList.add）
  for (const r of rounds) {
    for (const w of r.work) w.classList.add(WORK_CLASS)
    if (r.titleEl !== null) r.titleEl.classList.add(TITLE_CLASS)
  }

  // 总时长
  const totalSec = rounds.reduce((acc, r) => acc + extractSeconds(r), 0)
  const durText = formatDuration(totalSec)
  const baseText = durText !== '' ? `已工作 ${durText}` : '工作过程'

  const existing = scroll.querySelector<HTMLElement>(`.${BAR_CLASS}`)
  if (existing !== null) {
    // 更新已存在 bar：换新 rounds、保持 mode、重新 apply
    const state = (existing as unknown as { __state?: BarState }).__state
    if (state !== undefined) {
      state.rounds = rounds
      state.durText = durText
      state.baseText = baseText
      const apply = () => {
        // 最后一回合从最新 rounds 实时取（补载后数组变化，闭包里的旧引用会失效）
        const lastRound = state.rounds[state.rounds.length - 1]
        for (let i = 0; i < state.rounds.length; i++) {
          const r = state.rounds[i]
          const isLast = r === lastRound
          let hidden: boolean
          if (state.mode === 1) hidden = true
          else if (state.mode === 2) hidden = false
          else hidden = !isLast
          for (const w of r.work) w.style.display = hidden ? 'none' : ''
          if (r.titleEl !== null) r.titleEl.style.display = hidden ? 'none' : ''
        }
        existing.classList.toggle('dsh-msg-collapse-all-hidden', state.mode === 1)
        if (state.mode === 1) {
          state.arrow.textContent = '›'
          state.label.textContent = `${state.baseText} · 展开全部`
        } else if (state.mode === 2) {
          state.arrow.textContent = '▼'
          state.label.textContent = `${state.baseText} · 折叠全部`
        } else {
          state.arrow.textContent = '▼'
          state.label.textContent = state.baseText
        }
      }
      state.label.textContent = baseText
      apply()
    }
    return
  }

  const bar = document.createElement('div')
  bar.className = BAR_CLASS
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = TOGGLE_CLASS
  const arrow = document.createElement('span')
  arrow.className = ARROW_CLASS
  arrow.textContent = '▼'
  const label = document.createElement('span')
  label.className = 'dsh-msg-collapse-label'
  label.textContent = baseText
  btn.append(arrow, label)
  bar.appendChild(btn)
  first.parentElement?.insertBefore(bar, first)

  const state: BarState = { rounds, mode: 0, label, arrow, durText, baseText }
  ;(bar as unknown as { __state?: BarState }).__state = state

  const apply = () => {
    // 最后一回合从 state.rounds 实时取（补载后数组变化不失效）
    const lastRound = state.rounds[state.rounds.length - 1]
    for (let i = 0; i < state.rounds.length; i++) {
      const r = state.rounds[i]
      const isLast = r === lastRound
      let hidden: boolean
      if (state.mode === 1) hidden = true // 全部折叠
      else if (state.mode === 2) hidden = false // 全部展开
      else hidden = !isLast // mode 0：历史折叠 + 当前显示
      for (const w of r.work) {
        w.style.display = hidden ? 'none' : ''
      }
      if (r.titleEl !== null) {
        r.titleEl.style.display = hidden ? 'none' : ''
      }
    }
    bar.classList.toggle('dsh-msg-collapse-all-hidden', state.mode === 1)
    if (state.mode === 1) {
      arrow.textContent = '›'
      label.textContent = `${state.baseText} · 展开全部`
    } else if (state.mode === 2) {
      arrow.textContent = '▼'
      label.textContent = `${state.baseText} · 折叠全部`
    } else {
      arrow.textContent = '▼'
      label.textContent = state.baseText
    }
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    state.mode = state.mode === 0 ? 1 : state.mode === 1 ? 2 : 0
    apply()
  })

  apply() // 初始：历史折叠 + 当前显示
}

/** 主装配：会话顶部一条折叠横条。 */
function applyCollapse(): void {
  const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
  if (scroll === null) return
  // 清理失联横条（会话切换 / 虚拟滚动卸载）
  scroll.querySelectorAll(`.${BAR_CLASS}`).forEach((b) => {
    if (!b.isConnected) b.remove()
  })
  const rounds = collectRounds()
  if (rounds.length === 0) return
  setupBar(rounds)
}

/**
 * 浏览器侧入口。
 * @param ctx - client 上下文。
 */
export function applyMsgCollapse(ctx: ClientContext): void {
  ctx.effect(() => {
    injectCss()
    applyCollapse()
    // 会话切换 / 消息新增：防抖扫描
    let timer = 0
    const observer = new MutationObserver(() => {
      if (timer !== 0) return
      timer = window.setTimeout(() => {
        timer = 0
        applyCollapse()
      }, 300)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
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
