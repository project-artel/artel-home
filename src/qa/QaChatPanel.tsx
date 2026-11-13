import { PanelHeader } from '../design-system/primitives/Headers'
import { InlineError, PanelEmpty } from '../design-system/primitives/Feedback'
import { Button } from '../design-system/primitives/Button'
import { useEffect, useRef, useState } from 'react'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { chatTurns, sendChatMessage, waitingQuestion, type ChatTurn } from './qaChat'
import { evaluationCopy } from './evaluation/evaluationCopy'
import type { useOperatorQuestions } from './evaluation/useOperatorQuestions'
import type { QaLog } from './qaTypes'

export function QaChatPanel({
  projectId,
  questions,
  disabled,
  logs,
  qaTryId,
}: {
  projectId: string
  questions: ReturnType<typeof useOperatorQuestions>
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
  const { t, locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const question = waitingQuestion(questions.questions, qaTryId)
  const canSend = !disabled && questions.ready && !sending

  const delivered = chatTurns(logs, questions.questions, qaTryId)
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
  }, [turns.length, question?.id])

  async function send() {
    const message = draft.trim()
    if (message.length === 0 || !canSend || (question !== null && message.length > 4000)) return

    setSending(true)
    setFailure(null)
    setPendingTurns((current) => [
      ...current,
      { id: `pending-${current.length}`, role: 'USER', message, pending: true, createdAt: new Date().toISOString() },
    ])

    try {
      await sendChatMessage(projectId, qaTryId, message, question)
      if (question !== null) await questions.reload()
      setDraft('')
    } catch (error: unknown) {
      setPendingTurns((current) => current.filter((turn) => turn.message !== message))
      setFailure(
        error instanceof ProjectApiError && error.status === 409 && question !== null
          ? copy.answered
          : error instanceof ProjectApiError ? error.message : t.qa.chat.sendFailed,
      )
      if (question !== null) await questions.reload()
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="panel qa-chat" aria-labelledby="qa-chat-title">
      <PanelHeader>
        <h2 id="qa-chat-title">
          {t.qa.chat.title}
          <InfoHint>{t.qa.chat.hint}</InfoHint>
        </h2>
      </PanelHeader>

      <div className="qa-chat-thread" ref={viewportRef}>
        {turns.length === 0 ? (
          <PanelEmpty>{t.qa.chat.empty}</PanelEmpty>
        ) : (
          <ul className="qa-chat-list">
            {turns.map((turn) => (
              <li className={`qa-chat-turn qa-chat-turn--${turn.role.toLowerCase()}`} key={turn.id}>
                <span className="qa-chat-author">
                  {turn.questionAnswer ? copy.answerLabel : turn.role === 'USER' ? t.qa.chat.you : t.qa.chat.agent}
                </span>
                <p>{turn.message}</p>
                {turn.waiting && !disabled && <span className="qa-chat-pending" role="status">{copy.waiting}</span>}
                {turn.pending && <span className="qa-chat-pending">{t.qa.chat.sending}</span>}
              </li>
            ))}
          </ul>
        )}
        <p aria-live="polite" className="sr-status">
          {awaitingReply ? t.qa.chat.awaitingReply : ''}
        </p>
      </div>

      {questions.failed && <p className="inline-error" role="alert">{copy.error}</p>}
      {failure !== null && (
        <InlineError>
          <span aria-hidden="true">!</span>
          {failure}
        </InlineError>
      )}

      {disabled ? (
        <PanelEmpty>{t.qa.chat.closed}</PanelEmpty>
      ) : (
        <form
          className="qa-chat-composer"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <label className="visually-hidden" htmlFor="qa-chat-input">
            {question !== null ? copy.answerLabel : t.qa.chat.inputLabel}
          </label>
          <textarea
            disabled={!canSend}
            maxLength={question !== null ? 4000 : undefined}
            id="qa-chat-input"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter is a newline. Matches the scenario chat.
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder={question !== null ? copy.answerLabel : t.qa.chat.placeholder}
            rows={2}
            value={draft}
          />
          <Button
            variant="primary"
            disabled={!canSend || draft.trim().length === 0 || (question !== null && draft.trim().length > 4000)}
            type="submit"
          >
            {sending ? t.qa.chat.sending : question !== null ? copy.answer : t.qa.chat.send}
          </Button>
        </form>
      )}
    </section>
  )
}
