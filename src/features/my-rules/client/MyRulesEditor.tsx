/**
 * my-rules 设置页 —— 全局指令编辑器。
 *
 * 编辑 `$DSH_HOME/AGENTS.md`（用户全局指令，被 dsh-agent-instructions 注入
 * 到本机每个会话）。数据流经官方通用 RPC 通道（/dsh-my-rules），host 端
 * connection.rpc.handle 承载 read / write 两个端点。
 *
 * 行为：
 *  - 空内容保存 = 删除指令文件（先确认）；
 *  - 超过 64 KB 预算照常保存，但显示警告（指令渲染器可能截断）。
 *
 * 视觉：静态外观全部来自 .dx-* 类（文本域 dx-textarea dx-mono、说明 dx-hint、
 * 消息 dx-msg、计量条 dx-meter），内联 style 只保留布局与计量条填充宽度。
 */
import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { cx, ui, C } from '../../../client/design/index.js'
import type { ExperienceRpc } from '../../../client/rpc-transport.js'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { MyRulesLocaleKey } from './locales.js'

/** RPC 通道（与 host 端 MY_RULES_RPC_CHANNEL 一致）。 */
const MY_RULES_RPC_CHANNEL = '/dsh-my-rules'
const MY_RULES_RPC_READ = 'my-rules/read'
const MY_RULES_RPC_WRITE = 'my-rules/write'

/** read 返回（与 host 端 MyRulesView 对应）。 */
interface MyRulesView {
  exists: boolean
  content: string
  bytes: number
  path: string
  displayPath: string
  budget: number
}

/** write 返回（与 host 端 MyRulesWriteResult 对应）。 */
interface MyRulesWriteResult {
  removed: boolean
  bytes: number
  warning: boolean
  displayPath: string
}

/** 页面状态。 */
type Phase = 'loading' | 'ready' | 'error'

/** 提示消息。 */
interface Msg {
  kind: 'ok' | 'warn' | 'err'
  text: string
}

/** 文本域：外观在 .dx-textarea，这里只保留编辑器高度。 */
const textareaInline: CSSProperties = { height: 190 }

/** 计量条：外观在 .dx-meter，这里只保留在整行中的占位。 */
const meterInline: CSSProperties = { flex: 1, minWidth: 60 }

/** 计量文本：字号/颜色在 .dx-hint，这里只禁止折行。 */
const meterTextInline: CSSProperties = { whiteSpace: 'nowrap' }

const docUrl = 'https://github.com/deepseek-ai/dsh-agent-instructions'

/** 编辑器注入面（register 的 inject 工厂返回值）。 */
export interface MyRulesEditorInjected {
  /** 通用 RPC 通道（host 端 connection.rpc）。 */
  rpc: ExperienceRpc | undefined
  /** 文案（绑定 my-rules 命名空间）。 */
  t: TranslateNS<'my-rules'>
}

/** 属性：inject 面。 */
export type MyRulesEditorProps = MyRulesEditorInjected

/** 全局指令编辑器。 */
export function MyRulesEditor(props: MyRulesEditorProps): JSX.Element {
  const { rpc, t } = props
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [content, setContent] = useState('')
  const [meta, setMeta] = useState<{ displayPath: string; budget: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)

  const load = async (): Promise<void> => {
    setPhase('loading')
    setError('')
    try {
      if (rpc === undefined) throw new Error('rpc channel unavailable')
      const response = await rpc.call(MY_RULES_RPC_CHANNEL, MY_RULES_RPC_READ, {})
      if (!response.ok) {
        throw new Error((response.error as { message?: string }).message ?? 'read failed')
      }
      const view = response.value as MyRulesView
      setContent(view.content ?? '')
      setMeta({ displayPath: view.displayPath ?? '$DSH_HOME/AGENTS.md', budget: view.budget || 65536 })
      setPhase('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPhase('error')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc])

  // 字节数（UTF-8）
  const byteCount = ((): number => {
    try {
      return new TextEncoder().encode(content).length
    } catch {
      return content.length
    }
  })()
  const budgetBytes = meta?.budget ?? 65536
  const budgetKb = Math.round(budgetBytes / 1024)
  const pct = budgetBytes > 0 ? Math.round((byteCount / budgetBytes) * 100) : 0
  const fillPct = Math.min(pct, 100)

  const save = async (): Promise<void> => {
    if (busy) return
    if (content.trim() === '') {
      if (!window.confirm(t('confirmRemove'))) return
    }
    setBusy(true)
    setMsg(null)
    try {
      if (rpc === undefined) throw new Error('rpc channel unavailable')
      const response = await rpc.call(MY_RULES_RPC_CHANNEL, MY_RULES_RPC_WRITE, { content })
      if (!response.ok) throw new Error((response.error as { message?: string }).message ?? 'write failed')
      const result = response.value as MyRulesWriteResult
      if (result.removed) setMsg({ kind: 'ok', text: t('removed') })
      else if (result.warning) setMsg({ kind: 'warn', text: t('savedWarn') })
      else setMsg({ kind: 'ok', text: t('saved') })
    } catch (cause) {
      setMsg({ kind: 'err', text: t('saveFailed') + (cause instanceof Error ? cause.message : String(cause)) })
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'loading') {
    return <div className="dx-empty">{t('loading')}</div>
  }
  if (phase === 'error') {
    return <div className="dx-msg dx-msg--error">{t('loadFailed') + error}</div>
  }

  return (
    <div style={ui.stack(10)}>
      <textarea
        className="dx-textarea dx-mono dx-focus"
        style={textareaInline}
        value={content}
        placeholder={t('placeholder')}
        spellCheck={false}
        disabled={busy}
        onChange={(event) => setContent(event.target.value)}
      />
      {meta !== null && (
        <div className="dx-hint">{t('editorNote', { path: meta.displayPath })}</div>
      )}
      {msg !== null && (
        <div
          className={cx('dx-msg', msg.kind === 'ok' && 'dx-msg--ok', msg.kind === 'err' && 'dx-msg--error')}
          style={msg.kind === 'warn' ? { color: C.warn } : undefined}
        >
          {msg.text}
        </div>
      )}
      <div style={{ ...ui.hstack(12), flexWrap: 'wrap' }}>
        <div style={{ ...ui.hstack(10), flex: 1, minWidth: 0 }}>
          <div className="dx-meter" style={meterInline}>
            <div className="dx-meter__fill" style={ui.meterFill(fillPct)} />
          </div>
          <span className="dx-hint" style={meterTextInline}>{t('meter', { pct: String(pct), budget: String(budgetKb) })}</span>
        </div>
        <a
          href={docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="dx-btn dx-btn--link dx-press dx-focus"
        >
          {t('learnMore')} ↗
        </a>
        <Button variant="primary" size="md" disabled={busy} onClick={() => void save()}>
          {busy ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  )
}
