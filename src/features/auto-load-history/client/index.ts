/**
 * auto-load-history —— browser 半区：自动加载更早的对话历史。
 *
 * 独立模块：会话打开时自动反复点官方「加载更早」按钮，把历史加载到配置的
 * 条数（默认 20 条用户消息），让下游需要完整历史的操作有足够内容可用。
 *
 * 配置（localStorage 持久化）：
 *  - 开关：复用 module-toggles 机制（dsh-experience:module:auto-load-history），
 *    由 src/client/index.ts 的 isModuleEnabled 决定是否装配；
 *  - 条数：dsh-experience:auto-load:count，默认 20，设置页「日用优化」分区可调。
 *
 * 性能策略（温和单点）：实测 DSH 从零加载历史时每次「加载更早」只插 ~2 条、
 * 响应 ~1s。**连点会触发 DSH 并发请求风暴，把渲染挤爆（首次消息被拖到 6.5s）**；
 * 串行等 scrollHeight 又太慢（15s+）。折中：**每次只点 1 下**，等「用户消息数真正
 * 增加」再点下一次——不风暴、UI 保持响应，总时长由 DSH 实际吞吐决定。
 *
 * 会话切换安全：每轮重新获取 scrollBody——DSH 切会话会重建 scrollBody，
 * 检测到切换立即终止旧加载，由 observer 在新会话上重新触发。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** localStorage key：自动加载条数。 */
export const AUTO_LOAD_COUNT_KEY = 'dsh-experience:auto-load:count'
/** 默认加载条数（用户消息）。 */
const DEFAULT_COUNT = 20
/** 条数下限 / 上限（防误填极端值）。 */
const MIN_COUNT = 1
const MAX_COUNT = 100

/** 读取自动加载条数（缺省 = 默认 20）。 */
export function readAutoLoadCount(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_COUNT
  const raw = localStorage.getItem(AUTO_LOAD_COUNT_KEY)
  if (raw === null) return DEFAULT_COUNT
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return DEFAULT_COUNT
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, n))
}

/** 写入自动加载条数。 */
export function setAutoLoadCount(count: number): void {
  const n = Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(count)))
  try {
    localStorage.setItem(AUTO_LOAD_COUNT_KEY, String(n))
  } catch {
    // localStorage 不可用时仅本次会话生效，忽略
  }
}

/** 官方「加载更早」按钮：.Md3f7G_older 容器内的 button；无则 null。 */
function findOlderButton(scroll: HTMLElement): HTMLButtonElement | null {
  const older = scroll.querySelector<HTMLElement>('.Md3f7G_older')
  if (older === null) return null
  return older.querySelector<HTMLButtonElement>('button')
}

/** 加载中标记：存启动时间戳（0=空闲）。比布尔更稳——若旧加载链因切换会话而
 *  卡死，超过 STALE_MS 后新调用可直接接管，不会永久锁死自动加载。 */
let loadAllRunning = 0
const LOAD_STALE_MS = 15000

/** 静默期长度：滚动停止后需等待多久才允许自动加载。 */
const SCROLL_QUIET_MS = 800

/** 最近一次滚动活动时间戳。中键自动滚动 / 滚轮 / 拖动滚动条都会持续产生
 *  scroll 事件；DSH 消息列表是虚拟化渲染，滚动期间 observer 每帧都有变更，
 *  若照常跑 querySelectorAll 全量扫描 + 点击「加载更早」插消息，会和滚动
 *  抢主线程，中键自动滚动就一卡一卡。滚动静默期内直接跳过自动加载。
 *  初始化为 -SCROLL_QUIET_MS：页面刚加载时 performance.now() 很小，
 *  若从 0 起算会把首次加载也误拦。 */
let lastScrollActivity = -SCROLL_QUIET_MS

/** 静默期重试定时器。关键：被静默期拦下的调用若不补一次重试，而当时 DOM
 *  已稳定（会话刚切完不再有 mutation），observer 不会再触发，自动加载就
 *  永久失活直到下次会话切换——所以拦下时必须排一个静默期结束后的补跑。 */
let scrollQuietRetry = 0

/** 自动加载历史到配置条数：反复点「加载更早」直到达到上限或按钮消失。
 *  达到上限后**保留**原版「加载更早」按钮，由用户手动点继续加载。 */
function loadAllHistory(): void {
  // 滚动静默期：正在滚动时不加载、不点击，保证滚动丝滑。
  // 排一个静默期结束后的重试，防止拦掉的是最后一次触发（见 scrollQuietRetry 注释）
  const quietLeft = SCROLL_QUIET_MS - (performance.now() - lastScrollActivity)
  if (quietLeft > 0) {
    if (scrollQuietRetry === 0) {
      scrollQuietRetry = window.setTimeout(() => {
        scrollQuietRetry = 0
        loadAllHistory()
      }, quietLeft + 50)
    }
    return
  }
  const scroll = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
  if (scroll === null) return
  const now = performance.now()
  // 防止并发触发；但加载链卡死（超时）时允许接管
  if (loadAllRunning !== 0 && now - loadAllRunning < LOAD_STALE_MS) return
  loadAllRunning = now

  const target = readAutoLoadCount()

  /** 统一结束：释放加载锁。 */
  const finish = (): void => {
    loadAllRunning = 0
  }

  const MAX_TRIES = 40 // 单次会话加载轮数上限（防异常死循环）
  let tries = 0

  const step = (): void => {
    // 会话切换检测
    const cur = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
    if (cur === null || cur !== scroll) {
      finish()
      return
    }
    // 滚动期间挂起：下一轮先不扫描/不点击，200ms 后重查（节拍不变，开销≈0）
    if (performance.now() - lastScrollActivity < SCROLL_QUIET_MS) {
      window.setTimeout(step, 200)
      return
    }
    if (tries >= MAX_TRIES) {
      finish()
      return
    }
    const btn = findOlderButton(scroll)
    if (btn === null) {
      // 全部加载完成（没有更早历史了）
      finish()
      return
    }
    // 达到配置条数上限：停止自动加载，保留原版「加载更早」按钮
    if (scroll.querySelectorAll('.gdEzaW_userRow').length >= target) {
      finish()
      return
    }
    // 点 1 下，等用户消息数真正增加（DSH 完成一次插入）再继续
    const usersBefore = scroll.querySelectorAll('.gdEzaW_userRow').length
    tries++
    btn.click()
    let poll = 0
    const check = (): void => {
      // 检查期间切会话 → 终止
      const cur2 = document.querySelector<HTMLElement>('.wSkVaW_scrollBody')
      if (cur2 !== scroll) {
        finish()
        return
      }
      // 滚动期间挂起：不扫描、不判定，只等滚动停止。
      // 关键——轮询节拍保持不变（每 200ms 空转一次仅做时间戳比较，开销≈0），
      // 滚动停止且静默期过后自动续跑，加载链不会因滚动中断或失活。
      if (performance.now() - lastScrollActivity < SCROLL_QUIET_MS) {
        window.setTimeout(check, 200)
        return
      }
      const usersNow = scroll.querySelectorAll('.gdEzaW_userRow').length
      poll++
      if (usersNow > usersBefore || poll > 40) {
        // 本次插入完成（或超时 8s），给 DSH 渲染留 200ms 缓冲，继续下一轮
        window.setTimeout(step, 200)
        return
      }
      window.setTimeout(check, 200)
    }
    window.setTimeout(check, 200)
  }
  window.setTimeout(step, 100)
}

/**
 * 浏览器侧装配「自动加载历史」。
 * 会话打开 / 消息变化时自动补载历史到配置条数。
 * @param ctx - client 根上下文。
 */
export function applyAutoLoadHistory(ctx: ClientContext): void {
  ctx.effect(() => {
    loadAllHistory()
    // 滚动活动跟踪：任何滚动（滚轮/中键自动滚动/拖动条）都刷新静默期，
    // passive 监听零开销，不会阻塞滚动本身
    const onScroll = (): void => {
      lastScrollActivity = performance.now()
    }
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    // 会话切换 / 消息新增：防抖触发自动补载
    let timer = 0
    const observer = new MutationObserver(() => {
      if (timer !== 0) return
      timer = window.setTimeout(() => {
        timer = 0
        loadAllHistory()
      }, 500)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      if (timer !== 0) clearTimeout(timer)
      if (scrollQuietRetry !== 0) clearTimeout(scrollQuietRetry)
      scrollQuietRetry = 0
      observer.disconnect()
      loadAllRunning = 0
    }
  }, 'dsh-experience-plugin: auto-load-history')
}
