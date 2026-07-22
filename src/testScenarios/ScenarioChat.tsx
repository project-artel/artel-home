import { useEffect, useRef, useState } from 'react'
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

  return (
    <section className="panel scenario-chat" aria-labelledby="scenario-chat-title">
      <header className="panel-header">
        <h2 id="scenario-chat-title">Conversation</h2>
      </header>

      {messages.length === 0 && closure === null ? (
        <p className="panel-empty">
          Describe the behaviour you want covered — for example, “Write a scenario for finishing
          the tutorial without taking damage.” The agent answers with a scenario you can edit.
        </p>
      ) : (
        <ol className="chat-thread" ref={threadRef}>
          {messages.map((message) => (
            <li
              className={`chat-message chat-message--${message.role.toLowerCase()}`}
              key={message.id}
            >
              <p className="chat-author">
                {message.role === 'USER' ? 'You' : 'Agent'}
                {message.createdAt !== null && (
                  <span className="chat-time">{formatDateTime(message.createdAt)}</span>
                )}
              </p>
              <p className="chat-body">{message.content}</p>
              {message.pending && <p className="chat-status">Waiting for the agent…</p>}
            </li>
          ))}
        </ol>
      )}

      {closure !== null ? (
        <div className="chat-closed" role="status">
          <p className="chat-closed-title">Chat unavailable</p>
          <p className="chat-closed-copy">{closure.reason}</p>
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
            Message to the agent
          </label>
          <textarea
            className="field-input field-input--multiline"
            disabled={sending}
            id="scenario-chat-input"
            onChange={(event) => setInput(event.target.value)}
            placeholder="Describe what should be tested"
            rows={3}
            value={input}
          />

          <div className="form-actions">
            <button
              className="button button--primary button--compact"
              disabled={sending || input.trim().length === 0}
              type="submit"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}

      <p aria-live="polite" className="visually-hidden">
        {awaitingReply ? 'Waiting for the agent to reply.' : ''}
      </p>
    </section>
  )
}
