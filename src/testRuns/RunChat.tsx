import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import type { ScenarioProposal } from './runChatApi'
import type { RunChatSession } from './useRunChatSession'

/**
 * The run-scoped authoring conversation (ARTEL-206 Step 6).
 *
 * One chat drives the whole run: the agent proposes scenarios to add (🆕) or
 * edit (✏️ existing id), and the user applies or drops each card. With the
 * auto-apply toggle on, results are written straight away and no cards appear.
 */
export function RunChat({ session }: { session: RunChatSession }) {
  const { t } = useI18n()
  const c = t.scenarios.chat
  const [input, setInput] = useState('')
  const threadRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const thread = threadRef.current
    if (thread === null) return
    thread.scrollTop = thread.scrollHeight
  }, [session.messages.length, session.awaitingReply, session.proposals.length])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (await session.send(input)) {
      setInput('')
    }
  }

  // Enter sends; Shift+Enter is a newline. `isComposing` guards IME input (Korean).
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void submit(event)
  }

  return (
    <section className="panel scenario-chat" aria-labelledby="run-chat-title">
      <header className="panel-header">
        <h2 id="run-chat-title">{c.title}</h2>
        <label className="run-chat-toggle">
          <input
            type="checkbox"
            checked={session.autoApply}
            onChange={(event) => session.setAutoApply(event.target.checked)}
          />
          {c.autoApplyLabel}
        </label>
      </header>

      {session.messages.length === 0 && !session.closed ? (
        <p className="panel-empty">{c.emptyCopy}</p>
      ) : (
        <ol className="chat-thread" ref={threadRef}>
          {session.messages.map((message) => (
            <li
              className={`chat-message chat-message--${message.role.toLowerCase()}`}
              key={message.id}
            >
              <p className="chat-author">
                {message.role === 'USER' ? c.you : c.agent}
                {message.createdAt !== null && (
                  <span className="chat-time">{formatDateTime(message.createdAt)}</span>
                )}
              </p>
              <p className="chat-body">{message.content}</p>
              {message.pending && <p className="chat-status">{c.waitingForAgent}</p>}
            </li>
          ))}
        </ol>
      )}

      {session.proposals.length > 0 && (
        <div className="run-chat-proposals">
          <div className="run-chat-proposals-head">
            <p className="run-chat-proposals-title">{c.proposalsTitle}</p>
            <button
              className="button button--primary button--compact"
              disabled={session.applying}
              onClick={() => void session.applyProposals(session.proposals)}
              type="button"
            >
              {session.applying ? c.applying : c.applyAll}
            </button>
          </div>
          <ul className="run-chat-cards">
            {session.proposals.map((proposal, index) => (
              <ProposalCard
                key={`${proposal.scenarioId ?? 'new'}-${index}`}
                proposal={proposal}
                labelNew={c.proposalNew}
                labelEdit={c.proposalEdit}
                caseCount={c.caseCount}
                applyText={c.apply}
                dropText={c.drop}
                disabled={session.applying}
                onApply={() => void session.applyProposals([proposal])}
                onDrop={() => session.dropProposal(proposal)}
              />
            ))}
          </ul>
        </div>
      )}

      {session.closed ? (
        <div className="chat-closed" role="status">
          <p className="chat-closed-title">{c.closedTitle}</p>
          <p className="chat-closed-copy">{c.closedExpired}</p>
        </div>
      ) : (
        <form className="chat-composer" onSubmit={submit}>
          {session.sendFailure !== null && (
            <div className="inline-error" role="alert">
              <span aria-hidden="true">!</span>
              {c.sendFailed}
            </div>
          )}

          <label className="visually-hidden" htmlFor="run-chat-input">
            {c.inputLabel}
          </label>
          <textarea
            className="field-input field-input--multiline"
            aria-describedby="run-chat-hint"
            disabled={session.sending}
            id="run-chat-input"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={c.inputPlaceholder}
            rows={3}
            value={input}
          />

          <div className="chat-composer-actions">
            <p className="shortcut-hint" id="run-chat-hint">
              {c.shortcutHint}
            </p>
            <button
              className="button button--primary button--compact"
              disabled={session.sending || input.trim().length === 0}
              type="submit"
            >
              {session.sending ? c.sending : c.send}
            </button>
          </div>
        </form>
      )}

      <p aria-live="polite" className="visually-hidden">
        {session.awaitingReply ? c.awaitingReply : ''}
      </p>
    </section>
  )
}

function ProposalCard({
  proposal,
  labelNew,
  labelEdit,
  caseCount,
  applyText,
  dropText,
  disabled,
  onApply,
  onDrop,
}: {
  proposal: ScenarioProposal
  labelNew: string
  labelEdit: (id: number) => string
  caseCount: (n: number) => string
  applyText: string
  dropText: string
  disabled: boolean
  onApply: () => void
  onDrop: () => void
}) {
  const isEdit = proposal.scenarioId !== null
  return (
    <li className={`run-chat-card run-chat-card--${isEdit ? 'edit' : 'new'}`}>
      <p className="run-chat-card-kind">
        {isEdit ? labelEdit(proposal.scenarioId as number) : labelNew}
      </p>
      <p className="run-chat-card-title">{proposal.title}</p>
      {proposal.description.length > 0 && (
        <p className="run-chat-card-desc">{proposal.description}</p>
      )}
      <p className="run-chat-card-cases">{caseCount(proposal.caseIds.length)}</p>
      <div className="run-chat-card-actions">
        <button
          className="button button--secondary button--compact"
          disabled={disabled}
          onClick={onDrop}
          type="button"
        >
          {dropText}
        </button>
        <button
          className="button button--primary button--compact"
          disabled={disabled}
          onClick={onApply}
          type="button"
        >
          {applyText}
        </button>
      </div>
    </li>
  )
}
