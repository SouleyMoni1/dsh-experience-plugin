/**
 * open-folder —— browser 半区：侧边栏「Workspace/项目」行「在文件夹中显示」按钮。
 *
 * 现状勘察结论：
 *  - 官方 dsh-client-ui-workspace 的 ProjectRowItem 菜单是硬编码的
 *    （workspaceMenuItems = rename / delete），`onSelect` 里
 *    `if (id !== "rename" && id !== "delete") return`，且没有行级 slot
 *    扩展点 —— 无法通过 slots 注入菜单项。
 *  - 官方 host 能力 ctx.workspaces.openPath(path) 已会用系统默认应用打开
 *    目录（Windows: Invoke-Item / macOS: open / Linux: xdg-open），
 *    因此本功能无需新增 host 插件，直接复用。
 *
 * 实现：MutationObserver 观察侧边栏项目行（role="treeitem" 且带
 * aria-expanded 的组头），为每个真实 workspace 追加一个文件夹图标按钮，
 * 点击后调用 openPath 在系统文件管理器中打开该目录。
 * 这是提示词「做法 B（兜底，更通用）」：独立的悬停按钮，不侵入官方菜单。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { IWorkspaces, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'

/** 已注入标记（防止重复扫描时重复注入）。 */
const INJECTED_MARK = 'data-dsh-open-folder-injected'
const BUTTON_CLASS = 'dsh-open-folder-btn'
const STYLE_TAG = 'dsh-experience/open-folder.css'
const TOAST_CLASS = 'dsh-open-folder-toast'
const TOAST_TAG = 'dsh-experience/open-folder-toast.css'

/** folder_open_16 图标（与官方 IconFolderOpen16 同构，纯 DOM 注入用）。 */
const FOLDER_ICON_SVG = [
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
  '<path d="M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30347 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.45166 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793M2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.0337C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z" fill="currentColor"/>',
  '<path opacity="0.2" d="M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602M5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z" fill="currentColor"/>',
  '</svg>'
].join('')

/** 注入一次按钮样式（与官方 iconButton 同款观感）。 */
function injectCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-dsh-open-folder=${JSON.stringify(STYLE_TAG)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-experience-plugin'
  tag.dataset.pluginCss = STYLE_TAG
  tag.textContent = [
    `.${BUTTON_CLASS}{`,
    'border:none;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);',
    'cursor:pointer;border-radius:6px;padding:4px;display:inline-flex;align-items:center;',
    'justify-content:center;line-height:0;flex:none;margin:0;',
    '}',
    `.${BUTTON_CLASS}:hover{color:var(--dsw-alias-label-primary,currentColor);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}`,
    `.${BUTTON_CLASS}:disabled{opacity:.45;cursor:default}`
  ].join('')
  document.head.appendChild(tag)

  if (document.querySelector(`style[data-dsh-open-folder=${JSON.stringify(TOAST_TAG)}]`) !== null) return
  const toastTag = document.createElement('style')
  toastTag.dataset.plugin = 'dsh-experience-plugin'
  toastTag.dataset.pluginCss = TOAST_TAG
  toastTag.textContent = [
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
  document.head.appendChild(toastTag)
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

/** basename（同时兼容 / 与 \\ 分隔符）。 */
function basename(path: string): string {
  const base = path.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
  return base === undefined || base === '' ? path : base
}

/**
 * 在浏览器侧启动「打开文件夹」注入。
 * @param ctx - client 根上下文。
 * @param workspaces - 官方 workspaces 服务（openPath + list 快照）。
 */
export function applyOpenFolder(ctx: ClientContext, workspaces: IWorkspaces | undefined): void {
  if (typeof document === 'undefined' || workspaces === undefined) return
  injectCss()

  const open = (path: string): void => {
    void workspaces.openPath(path).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[open-folder] failed to open folder:', path, error)
      showErrorToast(`无法打开文件夹：${message}`)
    })
  }

  /** 给一行注入按钮；已注入或非真实 workspace 行跳过。 */
  const scan = (): void => {
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
    const rows = document.querySelectorAll<HTMLElement>('[role="treeitem"][aria-expanded]')
    for (const row of rows) {
      if (row.hasAttribute(INJECTED_MARK)) continue
      const label = (row.innerText ?? '').trim()
      if (label === '') continue
      // 只做唯一匹配：同名（或同 basename）的多个 workspace 行无法区分，
      // 盲目按标签打开可能开错目录 —— 这种行直接跳过注入。
      const byTitleHit = byTitle.get(label)
      let ws: WorkspaceView | undefined
      if (byTitleHit !== undefined && byTitleHit.length === 1) ws = byTitleHit[0]
      else {
        const byBaseHit = byBase.get(label)
        if (byBaseHit !== undefined && byBaseHit.length === 1) ws = byBaseHit[0]
      }
      if (ws === undefined) continue
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = BUTTON_CLASS
      btn.title = `在文件夹中显示 ${ws.path}`
      btn.setAttribute('aria-label', `在文件夹中显示 ${ws.path}`)
      btn.innerHTML = FOLDER_ICON_SVG
      btn.addEventListener('click', (event: MouseEvent) => {
        event.stopPropagation()
        event.preventDefault()
        open(ws.path)
      })
      row.appendChild(btn)
      row.setAttribute(INJECTED_MARK, '1')
    }
  }

  let raf = 0
  const schedule = (): void => {
    if (raf !== 0) return
    raf = requestAnimationFrame(() => {
      raf = 0
      scan()
    })
  }

  ctx.effect(() => {
    scan()
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (raf !== 0) cancelAnimationFrame(raf)
      raf = 0
    }
  }, 'open-folder: DOM observer')
}
