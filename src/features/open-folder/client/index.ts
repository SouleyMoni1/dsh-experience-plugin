/**
 * open-folder —— browser 半区：侧边栏「工作区」行三点（⋯）菜单注入「打开文件夹」项。
 *
 * 与原版交互一致：项目行的全部操作集中在三点菜单（重命名 → 打开文件夹 →
 * 删除工作区），不往行上塞独立按钮。点击「打开文件夹」后调用 host 的
 * POST /api/open-folder，在系统文件管理器中打开对应目录。
 *
 * 官方 dsh-client-ui-workspace 的 ProjectRowItem 菜单是硬编码的（只有
 * rename / delete），没有行级 slot 扩展点；因此用 DOM 观察 + 菜单项注入
 * 实现，不侵入官方源码。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { IWorkspaces, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'

/** 已注入标记（防止同一个菜单被重复注入）。 */
const MENU_INJECTED_MARK = 'data-dsh-open-folder-menu-injected'

/** 打开失败提示样式 tag。 */
const TOAST_CLASS = 'dsh-open-folder-toast'
const TOAST_TAG = 'dsh-experience/open-folder-toast.css'

/** folder_open_16 图标（与官方 IconFolderOpen16 同构，纯 DOM 注入用）。 */
const FOLDER_ICON_SVG = [
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
  '<path d="M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30347 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.45166 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793M2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.17797Z" fill="currentColor"/>',
  '<path opacity="0.2" d="M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602M5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V4.98669C1.88299 4.4152 2.34649 4.95168 2.91798 4.95154H5.1962Z" fill="currentColor"/>',
  '</svg>'
].join('')

/** basename（同时兼容 / 与 \\ 分隔符）。 */
function basename(path: string): string {
  const base = path.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
  return base === undefined || base === '' ? path : base
}

/** 注入一次错误 toast 样式。 */
function injectToastCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-dsh-open-folder=${JSON.stringify(TOAST_TAG)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-experience-plugin'
  tag.dataset.pluginCss = TOAST_TAG
  tag.textContent = [
    `.${TOAST_CLASS}{`,
    'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;',
    'max-width:min(480px,calc(100vw - 48px));box-sizing:border-box;',
    'display:flex;align-items:center;gap:8px;',
    'border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));',
    'background:var(--dsw-alias-interactive-bg-hover-danger,rgba(216,97,97,.14));',
    'color:var(--dsw-alias-state-error-primary,#d86161);',
    'border-radius:10px;padding:8px 12px;font-size:13px;line-height:1.4;',
    'box-shadow:var(--dsw-shadow-lv2,0 4px 16px rgba(0,0,0,.18));',
    '}',
    `.${TOAST_CLASS} button{border:none;background:transparent;color:inherit;cursor:pointer;padding:2px 4px;border-radius:4px;font-size:12px;flex:none}`,
    `.${TOAST_CLASS} button:hover{background:rgba(216,97,97,.2)}`
  ].join('')
  document.head.appendChild(tag)
}

/** 打开失败时给用户一个短暂可见的错误提示（不依赖 host toast 服务）。 */
let toastTimer = 0
function showErrorToast(message: string): void {
  if (typeof document === 'undefined') return
  const existing = document.querySelector(`.${TOAST_CLASS}`)
  if (existing !== null) existing.remove()
  const toast = document.createElement('div')
  toast.className = TOAST_CLASS
  toast.setAttribute('role', 'alert')
  const text = document.createElement('span')
  text.textContent = message
  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = '✕'
  close.addEventListener('click', () => toast.remove())
  toast.append(text, close)
  document.body.appendChild(toast)
  if (toastTimer !== 0) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastTimer = 0
    toast.remove()
  }, 6000)
}

/**
 * 在浏览器侧启动「三点菜单 → 打开文件夹」注入。
 * @param ctx - client 根上下文。
 * @param workspaces - 官方 workspaces 服务（提供 workspace 路径快照）。
 */
export function applyOpenFolder(ctx: ClientContext, workspaces: IWorkspaces | undefined): void {
  if (typeof document === 'undefined' || workspaces === undefined) return
  injectToastCss()

  const open = (path: string): void => {
    void fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path })
    })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
        if (!res.ok || payload?.ok !== true) {
          throw new Error(payload?.error ?? `HTTP ${res.status}`)
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[open-folder] failed to open folder:', path, error)
        showErrorToast(`无法打开文件夹：${message}`)
      })
  }

  /** 最近一次被点击的三点菜单对应 workspace 路径。 */
  let pendingPath: string | undefined

  /** 行文本 → workspace path（唯一匹配才返回，避免开错目录）。 */
  const resolvePath = (label: string): string | undefined => {
    const snapshot = workspaces.list.getSnapshot()
    const byTitle = new Map<string, WorkspaceView[]>()
    const byBase = new Map<string, WorkspaceView[]>()
    const push = (map: Map<string, WorkspaceView[]>, key: string, ws: WorkspaceView): void => {
      const list = map.get(key)
      if (list === undefined) map.set(key, [ws])
      else list.push(ws)
    }
    for (const ws of snapshot.items) {
      push(byTitle, ws.title, ws)
      const base = basename(ws.path)
      if (base !== '') push(byBase, base, ws)
    }
    const byTitleHit = byTitle.get(label)
    if (byTitleHit !== undefined && byTitleHit.length === 1) return byTitleHit[0].path
    const byBaseHit = byBase.get(label)
    if (byBaseHit !== undefined && byBaseHit.length === 1) return byBaseHit[0].path
    return undefined
  }

  /** 从行 DOM 提取纯标题（过滤掉按钮的 aria-label 文本）。 */
  const extractLabel = (row: HTMLElement): string => {
    let text = row.innerText ?? ''
    // 三点/新建/复制等按钮的 aria-label 会混进 innerText，逐条剔除。
    for (const btn of row.querySelectorAll<HTMLElement>('button')) {
      const aria = btn.getAttribute('aria-label')
      if (aria !== null && aria !== '') text = text.split(aria).join('')
    }
    return text.replace(/\s+/g, '').trim()
  }

  /** capture 阶段记录被点击的三点按钮所在 workspace 行。 */
  const onCaptureClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement
    if (target.closest('[role="menu"]') !== null) return // 菜单内的点击不更新
    const row = target.closest<HTMLElement>('[role="treeitem"][aria-expanded]')
    if (row === null) return
    const label = extractLabel(row)
    if (label === '') return
    pendingPath = resolvePath(label)
  }
  document.addEventListener('click', onCaptureClick, true)

  /** 往一个已打开的三点菜单注入「打开文件夹」项（放在第二项）。 */
  const injectMenu = (menu: HTMLElement): void => {
    if (menu.hasAttribute(MENU_INJECTED_MARK)) return
    menu.setAttribute(MENU_INJECTED_MARK, '1')
    const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    const first = items[0]
    if (first === undefined) return
    const wrap = first.parentElement
    if (wrap === null) return
    // 克隆第一个菜单项的外壳（itemWrap + item button），复用官方样式。
    const clone = wrap.cloneNode(true) as HTMLElement
    const btn = clone.querySelector<HTMLButtonElement>('button')
    if (btn === null) return
    // 清理克隆残留的选中/子菜单属性。
    btn.removeAttribute('aria-haspopup')
    btn.removeAttribute('aria-expanded')
    btn.removeAttribute('aria-selected')
    btn.classList.remove('selected')
    // 重填内容：文件夹图标 + 「打开文件夹」。
    btn.textContent = ''
    const firstIcon = first.querySelector('span')
    const firstLabel = first.querySelectorAll('span')[1]
    const iconSpan = document.createElement('span')
    iconSpan.className = firstIcon?.className ?? ''
    iconSpan.innerHTML = FOLDER_ICON_SVG
    const labelSpan = document.createElement('span')
    labelSpan.className = firstLabel?.className ?? ''
    labelSpan.textContent = '打开文件夹'
    btn.append(iconSpan, labelSpan)
    btn.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
      if (pendingPath !== undefined) open(pendingPath)
      // 模拟菜单外点击，让 Menu 组件自己执行 onClose 关闭菜单。
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    wrap.after(clone)
  }

  const injectAllMenus = (): void => {
    document.querySelectorAll<HTMLElement>('[role="menu"]').forEach(injectMenu)
  }

  ctx.effect(() => {
    injectAllMenus()
    const observer = new MutationObserver(() => {
      // 菜单打开时 portal 新增 [role="menu"]，rAF 后注入（等 React 渲染完）。
      requestAnimationFrame(injectAllMenus)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onCaptureClick, true)
    }
  }, 'open-folder: menu injection')
}
