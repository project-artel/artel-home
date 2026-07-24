import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import type { ChatClosure } from './chatAvailability'
import type { ChatMessage } from './scenarioTypes'

/**
 * The conversation that produces the scenario.
 *
 * When `closure` is set the thread stays exactly as it is and the composer is
 * replaced by a note. The transcript is stored per user and outlives the agent
 * session behind it, so a closed conversation is still worth reading — it is
 * the record of how the scenario on the right came to look the way it does.
 */
export function ScenarioChat({
  awaitingReply,
  closure,
  messages,
  onSend,
  sendFailure,
  sending,
}: {
  awaitingReply: boolean
  closure: ChatClosure | null
  messages: ChatMessage[]
  onSend: (message: string) => Promise<boolean>
  sendFailure: string | null
  sending: boolean
}) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const threadRef = useRef<HTMLOListElement>(null)

  // A reply lands at the bottom, which is off-screen once the thread is longer
  // than the panel. Scrolling on message count rather than on every render
  // keeps typing from fighting the scroll position.
  useEffect(() => {
    const thread = threadRef.current
    if (thread === null) return
    thread.scrollTop = thread.scrollHeight
  }, [messages.length, awaitingReply])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    // The input is cleared only once the relay is accepted. A failed send that
    // also lost what was typed would make the user write it twice.
    if (await onSend(input)) {
      setInput('')
    }
  }

  /**
   * Enter sends; Shift+Enter is the newline.
   *
   * `isComposing` is what keeps that from breaking Korean and every other IME
   * input: the Enter that commits a composition raises `keydown` first, so
   * without this check the message would be sent halfway through a word.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return

    event.preventDefault()
    void submit(event)
  }

  return (
    <section className="panel scenario-chat" aria-labelledby="scenario-chat-title">
      <header className="panel-header">
        <h2 id="scenario-chat-title">{t.scenarios.chat.title}</h2>
      </header>

      {messages.length === 0 && closure === null ? (
        <p className="panel-empty">{t.scenarios.chat.emptyCopy}</p>
      ) : (
        <ol className="chat-thread" ref={threadRef}>
          {messages.map((message) => (
            <li
              className={`chat-message chat-message--${message.role.toLowerCase()}`}
              key={message.id}
            >
              <p className="chat-author">
                {message.role === 'USER' ? t.scenarios.chat.you : t.scenarios.chat.agent}
                {message.createdAt !== null && (
                  <span className="chat-time">{formatDateTime(message.createdAt)}</span>
                )}
              </p>
              <p className="chat-body">{message.content}</p>
              {message.pending && (
                <p className="chat-status">{t.scenarios.chat.waitingForAgent}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      {closure !== null ? (
        <div className="chat-closed" role="status">
          <p className="chat-closed-title">{t.scenarios.chat.closedTitle}</p>
          <p className="chat-closed-copy">
            {closure.kind === 'expired'
              ? t.scenarios.chat.closedExpired
              : t.scenarios.chat.closedWithDetail(closure.detail)}
          </p>
        </div>
      ) : (
        <form className="chat-composer" onSubmit={submit}>
          {sendFailure !== null && (
            <div className="inline-error" role="alert">
              <span aria-hidden="true">!</span>
              {sendFailure}
            </div>
          )}

          <label className="visually-hidden" htmlFor="scenario-chat-input">
            {t.scenarios.chat.inputLabel}
          </label>
          <textarea
            className="field-input field-input--multiline"
            aria-describedby="scenario-chat-hint"
            disabled={sending}
            id="scenario-chat-input"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.scenarios.chat.inputPlaceholder}
            rows={3}
            value={input}
          />

          <div className="chat-composer-actions">
            <p className="shortcut-hint" id="scenario-chat-hint">
              {t.scenarios.chat.shortcutHint}
            </p>
            <button
              className="button button--primary button--compact"
              disabled={sending || input.trim().length === 0}
              type="submit"
            >
              {sending ? t.scenarios.chat.sending : t.scenarios.chat.send}
            </button>
          </div>
        </form>
      )}

      <p aria-live="polite" className="visually-hidden">
        {awaitingReply ? t.scenarios.chat.awaitingReply : ''}
      </p>
    </section>
  )
}
