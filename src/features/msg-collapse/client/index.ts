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
/** 淡出动画中的标记 class（opacity 0）。 */
const FADING_CLASS = 'dsh-msg-collapse-fading'
/** 最终回复块滑动过渡的临时 class。 */
const SLIDE_CLASS = 'dsh-msg-collapse-slide'
/** 淡入淡出动画时长 ms。 */
const FADE_MS = 160
/** 最终回复块上下滑动时长 ms。 */
const SLIDE_MS = 180
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
    /* 横条：两行布局——上方文字行（靠左），下方分割线 */
    '.' + BAR_CLASS + '{',
    'display:flex;flex-direction:column;align-items:stretch;',
    'gap:2px;padding:6px 4px 2px;',
    'user-select:none;',
    '}',
    /* 文字行：靠左，16px */
    '.' + TOGGLE_CLASS + '{',
    'display:inline-flex;align-items:center;gap:6px;',
    'padding:0;border:none;background:transparent;',
    'font-size:16px;line-height:1.4;color:rgba(127,127,127,.65);',
    'cursor:pointer;white-space:nowrap;align-self:flex-start;',
    'transition:color .12s ease;',
    '}',
    '.' + TOGGLE_CLASS + ':hover{color:var(--dsw-alias-state-info-primary,#4ea1ff);}',
    /* 箭头：展开指向下（rotate 90°），折叠指向右（rotate 0°），动画过渡 */
    '.' + ARROW_CLASS + '{',
    'display:inline-block;font-size:18px;',
    'transform:rotate(90deg);transition:transform .2s ease;',
    '}',
    '.' + COLLAPSED_CLASS + ' .' + ARROW_CLASS + '{transform:rotate(0deg);}',
    /* 分割线 */
    '.' + BAR_CLASS + '::after{',
    `content:"";display:block;height:1px;`,
    'background:var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.18));',
    '}',
    /* 折叠/展开过渡：工作节点淡入淡出 */
    '.' + WORK_CLASS + '{transition:opacity ' + FADE_MS + 'ms ease;}',
    '.' + WORK_CLASS + '.' + FADING_CLASS + '{opacity:0;}',
    /* 最终回复块上下滑动过渡（transform 位移补偿法） */
    '.' + SLIDE_CLASS + '{transition:transform ' + SLIDE_MS + 'ms ease;will-change:transform;}',
  ].join('\n'),
  document.head.appendChild(tag)
}

/** 判断一个 flowItem 是否属于「处理过程」（可折叠隐藏）。 */
function isWorkItem(el: HTMLElement): boolean {
  if (el.querySelector('.gdEzaW_userRow') !== null) return false // 用户消息本身
  if (el.querySelector('[class*="Sxvs8a_root"]') !== null) return true // Think / 回复块
  if (el.querySelector('[class*="ztWv_q_callRow"]') !== null) return true // 工具调用
  if (el.querySelector('.gdEzaW_compactionRow') !== null) return true // 上下文压缩
  if (el.querySelector('.gdEzaW_retryRow') !== null) return true // 模型重试
  if (el.querySelector('.gdEzaW_turnErrorRow') !== null) return true // 运行失败 / 输出截断
  const txt = (el.textContent || '').trim()
  if (txt.startsWith('上下文注入')) return true
  return false
}

/** 隐藏仓库：折叠的工作过程节点移到这里（display:none，页面零渲染/零布局）。 */
let vaultEl: HTMLElement | null = null
function getVault(): HTMLElement {
  if (vaultEl !== null && vaultEl.isConnected) return vaultEl
  const el = document.createElement('div')
  el.style.display = 'none'
  el.style.contain = 'strict'
  document.body.appendChild(el)
  vaultEl = el
  return el
}

/** 给用户消息分配稳定的回合 key。
 *  背景：DSH 虚拟滚动/新消息插入会重建 flowItem 容器，把我们插的 bar 冲掉；
 *  此时 work 全在 vault，collectWorkItems 扫不到 → work.length===0 → bar 永不重建
 *  （按钮和分界线消失的概率 bug）。用回合 key 标记 work，bar 丢失后可从 vault
 *  按 key 恢复 work 并重建 bar。 */
let roundIdCounter = 0
function roundKeyOf(userEl: Element): string {
  let k = userEl.getAttribute('data-dsh-round-key')
  if (k === null) {
    k = String(++roundIdCounter)
    userEl.setAttribute('data-dsh-round-key', k)
  }
  return k
}

/** 收集一个回合里所有处理过程 flowItem（不含用户消息、不含最终回复、不含状态行）。
 *  roundDone=false（处理中）：所有 Sxvs8a 都算处理过程（AI 回复尚未定型）；
 *  roundDone=true（处理完成）：最后一个 Sxvs8a 是最终回复，不隐藏。 */
function collectWorkItems(start: number, end: number, items: HTMLElement[], roundDone: boolean): HTMLElement[] {
  const out: HTMLElement[] = []
  for (let i = start + 1; i <= end; i++) {
    const el = items[i]
    if (el.querySelector('.gdEzaW_userRow') !== null) continue
    if (el.querySelector('[class*="Sxvs8a_root"]') !== null) {
      if (roundDone) {
        // 处理完成：保留最后一个 Sxvs8a（AI 最终回复）
        let isLast = true
        for (let j = i + 1; j <= end; j++) {
          if (items[j].querySelector('[class*="Sxvs8a_root"]') !== null) { isLast = false; break }
        }
        if (isLast) continue // 最终回复不隐藏
      }
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
    if (el.querySelector('.gdEzaW_compactionRow') !== null) return el
    if (el.querySelector('.gdEzaW_retryRow') !== null) return el
    if (el.querySelector('.gdEzaW_turnErrorRow') !== null) return el
    const txt = (el.textContent || '').trim()
    if (txt.startsWith('上下文注入')) return el
  }
  return null
}

/** 找到回合内 AI 最终回复的 flowItem（最后一个 Sxvs8a），没有则 null。
 *  roundDone=false（处理中）：无最终回复，返回 null。 */
function findFinalReply(start: number, end: number, items: HTMLElement[], roundDone: boolean): HTMLElement | null {
  if (!roundDone) return null
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

/** 每个 bar 的运行时状态（挂元素上，防扫描重建丢失）。 */
interface BarState {
  work: HTMLElement[]
  placeMap: Map<HTMLElement, { parent: HTMLElement | null; next: Element | null }>
  collapsed: boolean
  animating: boolean
  /** 用户手动点过（展开/折叠）→ 处理完成时不再自动折叠。 */
  userToggled: boolean
  base: string
  label: HTMLElement
  finalReply: HTMLElement | null
  bar: HTMLElement
}

/** 给一个回合注入折叠横条（插在第一个处理过程上方）。 */
function setupRound(start: number, end: number, items: HTMLElement[]): void {
  const firstWork = findFirstWork(start, end, items)
  // 已注入检查：从本回合用户消息 flowItem 之后扫描兄弟节点，找已存在的 bar。
  // 不能只看 firstWork 的前一个兄弟——处理中 DSH 会把新 flowItem 插在 bar 前面
  // （用户消息与 bar 之间），导致 prevEl 不是 bar 而误判「未注入」，创建第二个 bar
  // （用户报告的 bug：处理中折叠后每处理一步就多一个折叠窗口）。
  let existingBar: HTMLElement | null = null
  {
    const userFlow = items[start]
    let sib = userFlow.nextElementSibling
    while (sib !== null) {
      if (sib.classList && sib.classList.contains(BAR_CLASS)) {
        existingBar = sib as HTMLElement
        break
      }
      if (sib.classList && sib.classList.contains('Md3f7G_flowItem')) {
        const idx = items.indexOf(sib as HTMLElement)
        if (idx > end) break // 超出本回合
      }
      sib = sib.nextElementSibling
    }
  }
  // 是否最新回合（最后一个用户消息）
  const isLastRound = (() => {
    const userRows: number[] = []
    items.forEach((f, i) => { if (f.querySelector('.gdEzaW_userRow') !== null) userRows.push(i) })
    const lastStart = userRows[userRows.length - 1]
    return start === lastStart
  })()
  // 回合是否已处理完成：出现回合尾部（data-turn-tail / timeEnd）即完成
  const roundDone = (() => {
    for (let i = start + 1; i <= end; i++) {
      if (items[i].querySelector('[data-turn-tail]') !== null) return true
      if (items[i].querySelector('.p-xYUq_timeEnd') !== null) return true
    }
    return false
  })()
  if (existingBar !== null && (existingBar as unknown as { __state?: BarState }).__state !== undefined) {
    // bar 已存在：仅同步文案（work 节点可能在 vault，不重建）
    const st = (existingBar as unknown as { __state: BarState }).__state
    st.label.textContent = st.base
    // 增量收集：DSH 可能在 bar 创建后插入新的处理过程元素（上下文压缩 compaction、
    // 模型重试 model-retry、运行失败/输出截断 turn-error 等），这些不在 st.work 里，
    // 折叠时不会被移入 vault。每次扫描重新收集回合内所有 work，把新元素补进去。
    const freshWork = collectWorkItems(start, end, items, roundDone)
    for (const w of freshWork) {
      if (!st.work.includes(w)) {
        st.work.push(w)
        w.classList.add(WORK_CLASS)
        // 已折叠：新元素直接移入 vault（记录原位，展开时可恢复）
        if (st.collapsed && w.closest('.wSkVaW_scrollBody') !== null) {
          st.placeMap.set(w, { parent: w.parentElement, next: w.nextElementSibling })
          getVault().appendChild(w)
        }
      }
    }
    // 处理完成时（roundDone 从 false→true）：处理中创建的 bar 把最终回复也算进了 work，
    // 需要重新计算 work（排除最终回复）并补上 finalReply，否则折叠会把最终回复也藏进 vault。
    if (roundDone && st.finalReply === null) {
      st.finalReply = findFinalReply(start, end, items, true)
      const fr = st.finalReply
      if (fr !== null) {
        st.work = st.work.filter((w) => w !== fr)
      }
    }
    // 需求 2：最新回合处理中保持展开；处理完成（AI 完成或手动停止）→ 自动折叠
    // 用户手动点过（userToggled）→ 尊重用户选择，不再自动折叠
    if (isLastRound && !st.collapsed && roundDone && !st.userToggled) {
      st.collapsed = true
      st.label.textContent = st.base
      existingBar.classList.add(COLLAPSED_CLASS)
      // 把 work 移入 vault（无动画，直接折叠）
      const toHide = st.work.filter((w) => w.closest('.wSkVaW_scrollBody') !== null)
      for (const w of toHide) {
        st.placeMap.set(w, { parent: w.parentElement, next: w.nextElementSibling })
        getVault().appendChild(w)
      }
      const fr = st.finalReply
      if (fr !== null) {
        const frTitle = fr.querySelector<HTMLElement>('[class*="QWLzlG_root"]')
        if (frTitle !== null) frTitle.style.display = 'none'
      }
    }
    return
  }

  // 回合 key：从本回合用户消息取（userRow 元素引用稳定，虚拟滚动不重建）
  const userEl = items[start].querySelector('.gdEzaW_userRow')
  const roundKey = userEl !== null ? roundKeyOf(userEl) : null

  // 收集 work：优先从对话区扫；若扫不到（bar 被 DSH 重建冲掉、work 全在 vault），
  // 从 vault 按回合 key 恢复——否则 work.length===0 直接 return，bar 永不重建
  // （按钮和分界线消失的概率 bug）。
  let work = collectWorkItems(start, end, items, roundDone)
  let recoveredFromVault = false
  if (work.length === 0 && roundKey !== null) {
    work = Array.from(getVault().querySelectorAll<HTMLElement>(`.${WORK_CLASS}`))
      .filter((w) => w.getAttribute('data-dsh-round-key') === roundKey)
    recoveredFromVault = work.length > 0
  }
  const finalReply = findFinalReply(start, end, items, roundDone)
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
  btn.append(label, arrow)
  bar.appendChild(btn)

  // 插到第一个处理过程之前；若 work 全在 vault（bar 被 DSH 重建冲掉后恢复），
  // 插到本回合用户消息 flowItem 之后（用户消息与最终回复之间）。
  if (firstWork !== null && firstWork.parentElement !== null) {
    firstWork.parentElement.insertBefore(bar, firstWork)
  } else {
    const userFlow = items[start]
    if (userFlow.parentElement !== null) {
      userFlow.parentElement.insertBefore(bar, userFlow.nextElementSibling)
    }
  }

  // 默认状态：最新回合——处理中展开、处理完成自动折叠；历史回合折叠；
  // 从 vault 恢复的 bar 保持折叠（isLastRound / roundDone 已在函数开头计算）
  const collapsed = recoveredFromVault || !isLastRound || roundDone

  const state: BarState = {
    work,
    placeMap: new Map(),
    collapsed,
    animating: false,
    userToggled: false,
    base,
    label,
    finalReply,
    bar,
  }
  ;(bar as unknown as { __state: BarState }).__state = state

  const apply = (animate: boolean) => {
    // 折叠/展开过渡中（160ms）锁住，防连点导致节点透明卡死
    if (state.animating) return
    if (state.collapsed) {
      // 折叠：正序把对话区节点移入隐藏仓库（记录原位；移走时 next 兄弟还在 DOM，引用准确）
      const toHide = state.work.filter((w) => {
        w.classList.add(WORK_CLASS)
        return w.closest('.wSkVaW_scrollBody') !== null
      })
      if (toHide.length === 0) {
        // 全在仓库，无动画可做
        bar.classList.toggle(COLLAPSED_CLASS, true)
        label.textContent = base
        return
      }
      // 记录原位
      for (const w of toHide) {
        state.placeMap.set(w, { parent: w.parentElement, next: w.nextElementSibling })
      }
      // 最终回复的 Think 标题元素（折叠时淡出）
      const fr = state.finalReply
      const frTitle = fr !== null ? fr.querySelector<HTMLElement>('[class*="QWLzlG_root"]') : null
      /** 执行真正的折叠（移走内容 + 隐藏标题 + 回复块平滑上移）。 */
      const doMove = (): void => {
        state.animating = false
        // 移走内容前先测回复块位置（此时标题仍在，内容仍在）
        const beforeTop = fr !== null ? fr.getBoundingClientRect().top : 0
        for (const w of toHide) {
          w.classList.remove(FADING_CLASS)
          // 打上回合 key 标记：bar 被 DSH 重建冲掉后，可从 vault 按 key 恢复
          if (roundKey !== null) w.setAttribute('data-dsh-round-key', roundKey)
          getVault().appendChild(w)
        }
        bar.classList.add(COLLAPSED_CLASS)
        label.textContent = base
        // 隐藏最终回复 Think 标题
        if (frTitle !== null) {
          frTitle.classList.remove(FADING_CLASS)
          frTitle.style.display = 'none'
        }
        // 回复块瞬时上移了 beforeTop-afterTop 距离，用 transform 拉回原位再平滑归零。
        // 用 Web Animations API（element.animate）驱动——DSH 可能给 flowItem 定义了
        // 自己的 transition/transform，覆盖我们的 CSS 过渡导致「闪现」；animate()
        // 由浏览器合成器直接逐帧驱动，无视 CSS 优先级，保证平滑滑动。
        if (fr !== null) {
          void fr.offsetHeight
          const afterTop = fr.getBoundingClientRect().top
          const dy = beforeTop - afterTop
          if (Math.abs(dy) > 0.5) {
            fr.animate(
              [
                { transform: `translateY(${dy}px)` },
                { transform: 'translateY(0px)' },
              ],
              { duration: SLIDE_MS, easing: 'ease' },
            )
          }
        }
      }
      if (animate) {
        state.animating = true
        toHide.forEach((w) => w.classList.add(FADING_CLASS))
        if (frTitle !== null) {
          // 标题同步淡出
          frTitle.classList.add(FADING_CLASS)
        }
        // 强制 reflow：确保 opacity 过渡立即开始（否则浏览器可能批处理延迟）
        void toHide[0].offsetHeight
        window.setTimeout(doMove, FADE_MS)
      } else {
        doMove()
      }
    } else {
      // 展开：必须**倒序**恢复——后面的兄弟先就位，前面的节点才能用
      // insertBefore 精确插到它前面。正序会因 next 还在仓库而 appendChild
      // 兜底，导致节点被追加到父容器末尾（跑到回复结果下方）的 bug。
      const fr = state.finalReply
      // 插回前测回复块位置（此时内容还在仓库，标题还隐藏）
      const beforeTop = fr !== null ? fr.getBoundingClientRect().top : 0
      const toShow: HTMLElement[] = []
      for (let i = state.work.length - 1; i >= 0; i--) {
        const w = state.work[i]
        w.classList.add(WORK_CLASS)
        const inScroll = w.closest('.wSkVaW_scrollBody') !== null
        if (inScroll) continue // 已在对话区
        const p = state.placeMap.get(w)
        if (p !== undefined && p.parent !== null && p.parent.isConnected) {
          // next 兄弟必须真的还在原父容器下才能 insertBefore，否则兜底
          const nextOk = p.next !== null && p.next.parentElement === p.parent
          if (nextOk) {
            p.parent.insertBefore(w, p.next as Element)
          } else {
            p.parent.appendChild(w)
          }
        } else if (fr !== null && fr.parentElement !== null) {
          // placeMap 无记录（bar 被 DSH 重建冲掉后从 vault 恢复的场景）：
          // 把 work 插回最终回复之前（倒序恢复，后面的先就位）
          fr.parentElement.insertBefore(w, fr)
        } else {
          getVault().appendChild(w)
        }
        toShow.push(w)
      }
      // 显示最终回复 Think 标题
      if (fr !== null) {
        const qw = fr.querySelector<HTMLElement>('[class*="QWLzlG_root"]')
        if (qw !== null) qw.style.display = ''
      }
      bar.classList.remove(COLLAPSED_CLASS)
      label.textContent = base
      if (animate && toShow.length > 0) {
        // 先设透明插回，下一帧淡入
        state.animating = true
        toShow.forEach((w) => w.classList.add(FADING_CLASS))
        // 回复块瞬时下移了，用 transform 拉回原位再平滑归零（平滑下移）。
        // 用 Web Animations API 驱动（见折叠分支说明）。
        if (fr !== null) {
          void fr.offsetHeight
          const afterTop = fr.getBoundingClientRect().top
          const dy = beforeTop - afterTop
          if (Math.abs(dy) > 0.5) {
            fr.animate(
              [
                { transform: `translateY(${dy}px)` },
                { transform: 'translateY(0px)' },
              ],
              { duration: SLIDE_MS, easing: 'ease' },
            )
          }
        }
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            state.animating = false
            toShow.forEach((w) => w.classList.remove(FADING_CLASS))
          })
        })
      }
    }
  }
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    state.userToggled = true
    state.collapsed = !state.collapsed
    apply(true)
  })
  // 初始标记 + 应用默认状态（初始不动画，避免页面打开时闪烁）
  apply(false)
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

/** 快速折叠路径：最新回合已折叠时，把 DSH 新插入的处理过程元素立即移入 vault，
 *  避免它们先渲染在界面上再被折叠（闪现）。observer 防抖 500ms 太慢——
 *  新元素插入后要等 500ms 才被移走，用户会看到「先显示再消失」。
 *  此函数在 observer 回调里同步调用，不等防抖。
 *
 *  注意 roundDone 的传递：处理中（false）所有 Sxvs8a 都算 work；处理完成（true）
 *  最后一个 Sxvs8a 是最终回复，不能移入 vault（否则最终回复会消失）。
 *  处理完成瞬间 quickFold 可能用 false 把最终回复也移入 vault，此时 applyCollapse
 *  的 existingBar 分支会把它从 work 里移除——但 vault 里的元素不会自动移回，
 *  所以这里检测到 roundDone 后要把最终回复从 vault 移回 scroll。 */
function quickFoldNewWork(): void {
  const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
  if (scroll === null) return
  const items = Array.from(scroll.querySelectorAll<HTMLElement>('.Md3f7G_flowItem'))
  if (items.length === 0) return
  // 找最新回合（最后一个用户消息）
  let lastUser = -1
  items.forEach((f, i) => { if (f.querySelector('.gdEzaW_userRow') !== null) lastUser = i })
  if (lastUser < 0) return
  const userFlow = items[lastUser]
  // 找最新回合的 bar
  let bar: HTMLElement | null = null
  let sib = userFlow.nextElementSibling
  while (sib !== null) {
    if (sib.classList && sib.classList.contains(BAR_CLASS)) { bar = sib as HTMLElement; break }
    sib = sib.nextElementSibling
  }
  if (bar === null) return
  const st = (bar as unknown as { __state?: BarState }).__state
  if (st === undefined || !st.collapsed) return // 未折叠不处理
  // 回合是否已处理完成
  const end = items.length - 1
  const roundDone = (() => {
    for (let i = lastUser + 1; i <= end; i++) {
      if (items[i].querySelector('[data-turn-tail]') !== null) return true
      if (items[i].querySelector('.p-xYUq_timeEnd') !== null) return true
    }
    return false
  })()
  // 处理完成：把最终回复从 vault 移回 scroll（若被误移入）
  if (roundDone) {
    const fr = findFinalReply(lastUser, end, items, true)
    if (fr !== null) {
      const inVault = fr.closest('.wSkVaW_scrollBody') === null
      if (inVault) {
        const p = st.placeMap.get(fr)
        if (p !== undefined && p.parent !== null && p.parent.isConnected) {
          const nextOk = p.next !== null && p.next.parentElement === p.parent
          if (nextOk) p.parent.insertBefore(fr, p.next as Element)
          else p.parent.appendChild(fr)
        } else if (fr.parentElement !== null) {
          fr.parentElement.appendChild(fr)
        }
        st.placeMap.delete(fr)
      }
      st.work = st.work.filter((w) => w !== fr)
      st.finalReply = fr
    }
  }
  // 扫描最新回合内所有 flowItem，把不在 st.work 里的 work 立即移入 vault
  const freshWork = collectWorkItems(lastUser, end, items, roundDone)
  for (const w of freshWork) {
    if (!st.work.includes(w)) {
      st.work.push(w)
      w.classList.add(WORK_CLASS)
      if (w.closest('.wSkVaW_scrollBody') !== null) {
        st.placeMap.set(w, { parent: w.parentElement, next: w.nextElementSibling })
        getVault().appendChild(w)
      }
    }
  }
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
      // 快速折叠：最新回合已折叠时，新插入的处理过程元素立即移入 vault，
      // 不等 500ms 防抖——避免「先显示再消失」的闪现。
      quickFoldNewWork()
      if (timer !== 0) return
      timer = window.setTimeout(() => {
        timer = 0
        applyCollapse()
      }, 500)
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