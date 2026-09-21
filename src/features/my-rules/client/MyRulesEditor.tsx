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
 */
import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
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

const wrapStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const textareaStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 190,
  minHeight: 80,
  padding: '10px 12px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-primary)',
  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  fontSize: 13,
  lineHeight: '20px',
  resize: 'vertical',
  outline: 'none',
}

const noteStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 12,
  lineHeight: '18px',
}

const msgStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: '20px',
}

const okColor = '#12965b'
const warnColor = '#d48806'
const errColor = 'var(--dsw-alias-state-error-primary)'

const meterTrackStyle: CSSProperties = {
  flex: 1,
  height: 6,
  borderRadius: 3,
  border: '1px solid var(--dsw-alias-label-tertiary)',
  overflow: 'hidden',
  minWidth: 60,
}

const meterFillStyle = (pct: number): CSSProperties => ({
  height: '100%',
  background: 'var(--dsw-alias-label-primary)',
  borderRadius: 3,
  width: `${pct}%`,
})

const meterTextStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--dsw-alias-label-tertiary)',
  whiteSpace: 'nowrap',
}

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
    return <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>{t('loading')}</div>
  }
  if (phase === 'error') {
    return <div style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{t('loadFailed') + error}</div>
  }

  return (
    <div style={wrapStyle}>
      <textarea
        value={content}
        placeholder={t('placeholder')}
        spellCheck={false}
        disabled={busy}
        style={textareaStyle}
        onChange={(event) => setContent(event.target.value)}
      />
      {meta !== null && (
        <div style={noteStyle}>{t('editorNote', { path: meta.displayPath })}</div>
      )}
      {msg !== null && (
        <div style={{ ...msgStyle, color: msg.kind === 'ok' ? okColor : msg.kind === 'warn' ? warnColor : errColor }}>
          {msg.text}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={meterTrackStyle}>
            <div style={meterFillStyle(fillPct)} />
          </div>
          <span style={meterTextStyle}>{t('meter', { pct: String(pct), budget: String(budgetKb) })}</span>
        </div>
        <a
          href={docUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: '20px', textDecoration: 'none' }}
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
