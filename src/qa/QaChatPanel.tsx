import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { sendQaMessage } from './qaApi'
import type { QaLog } from './qaTypes'

type ChatTurn = {
  id: string
  role: 'USER' | 'AGENT'
  message: string
  pending: boolean
}

/**
 * The operator conversation, derived from the log stream rather than kept
 * separately: every turn is already persisted as a `CHAT` row, so the timeline
 * and this panel cannot disagree, and a reload replays the conversation for free.
 */
function turnsFromLogs(logs: QaLog[]): ChatTurn[] {
  return logs
    .filter((log) => log.type === 'CHAT' && log.direction !== 'ORCHE_TO_AGENT')
    .map((log) => ({
      id: log.id,
      // The relay copy is filtered out above, so direction alone names the speaker.
      role: log.direction === 'USER_TO_ORCHE' ? 'USER' : 'AGENT',
      message: log.message,
      pending: false,
    }))
}

export function QaChatPanel({
  disabled,
  logs,
  qaTryId,
}: {
  disabled: boolean
  logs: QaLog[]
  qaTryId: string
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // Optimistic turns. Never cleared by an effect — a pending turn stops being
  // rendered the moment the same text comes back on the stream, so the filter
  // below is the whole reconciliation. The list only grows while a run is open,
  // and each entry is one short string.
  const [pendingTurns, setPendingTurns] = useState<ChatTurn[]>([])
  const viewportRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()

  const delivered = turnsFromLogs(logs)
  const deliveredUserMessages = new Set(
    delivered.filter((turn) => turn.role === 'USER').map((turn) => turn.message),
  )
  const stillPending = pendingTurns.filter(
    (turn) => !deliveredUserMessages.has(turn.message),
  )
  const turns = [...delivered, ...stillPending]
  // The agent has spoken last once its reply lands, so a trailing USER turn is
  // what "waiting" means here — no separate flag can go stale against the stream.
  const awaitingReply = turns.length > 0 && turns[turns.length - 1].role === 'USER'

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport !== null) viewport.scrollTop = viewport.scrollHeight
  }, [turns.length])

  async function send() {
    const message = draft.trim()
    if (message.length === 0 || sending || disabled) return

    setSending(true)
    setFailure(null)
    setPendingTurns((current) => [
      ...current,
      { id: `pending-${current.length}`, role: 'USER', message, pending: true },
    ])

    try {
      await sendQaMessage(qaTryId, message)
      setDraft('')
    } catch (error: unknown) {
      setPendingTurns((current) => current.filter((turn) => turn.message !== message))
      setFailure(
        error instanceof ProjectApiError ? error.message : t.qa.chat.sendFailed,
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="panel qa-chat" aria-labelledby="qa-chat-title">
      <header className="panel-header">
        <h2 id="qa-chat-title">{t.qa.chat.title}</h2>
        <p className="scenario-hint">{t.qa.chat.hint}</p>
      </header>

      <div className="qa-chat-thread" ref={viewportRef}>
        {turns.length === 0 ? (
          <p className="panel-empty">{t.qa.chat.empty}</p>
        ) : (
          <ul className="qa-chat-list">
            {turns.map((turn) => (
              <li className={`qa-chat-turn qa-chat-turn--${turn.role.toLowerCase()}`} key={turn.id}>
                <span className="qa-chat-author">
                  {turn.role === 'USER' ? t.qa.chat.you : t.qa.chat.agent}
                </span>
                <p>{turn.message}</p>
                {turn.pending && <span className="qa-chat-pending">{t.qa.chat.sending}</span>}
              </li>
            ))}
          </ul>
        )}
        <p aria-live="polite" className="sr-status">
          {awaitingReply ? t.qa.chat.awaitingReply : ''}
        </p>
      </div>

      {failure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}

      {disabled ? (
        <p className="panel-empty">{t.qa.chat.closed}</p>
      ) : (
        <form
          className="qa-chat-composer"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <label className="sr-only" htmlFor="qa-chat-input">
            {t.qa.chat.inputLabel}
          </label>
          <textarea
            disabled={sending}
            id="qa-chat-input"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter is a newline. Matches the scenario chat.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder={t.qa.chat.placeholder}
            rows={2}
            value={draft}
          />
          <button
            className="button button--primary"
            disabled={sending || draft.trim().length === 0}
            type="submit"
          >
            {sending ? t.qa.chat.sending : t.qa.chat.send}
          </button>
        </form>
      )}
    </section>
  )
}
