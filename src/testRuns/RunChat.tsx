import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import { listTestCases } from '../testCases/testCaseApi'
import type { TestCase } from '../testCases/testCaseTypes'
import type { ScenarioProposal } from './runChatApi'
import type { RunChatSession } from './useRunChatSession'

/**
 * The run-scoped authoring conversation (ARTEL-206 Step 6).
 *
 * One chat drives the whole run: the agent proposes scenarios to add (🆕) or
 * edit (✏️ existing id), and the user applies or drops each card. With the
 * auto-apply toggle on, results are written straight away and no cards appear.
 *
 * Each card's ⤢ opens a modal listing the actual TestCases the scenario is made
 * of — resolved from the project's case library by id, so the user sees exactly
 * what will be applied before committing.
 */
export function RunChat({ projectId, session }: { projectId: string; session: RunChatSession }) {
  const { t } = useI18n()
  const c = t.scenarios.chat
  const [input, setInput] = useState('')
  const [expanded, setExpanded] = useState<ScenarioProposal | null>(null)
  const [caseById, setCaseById] = useState<Map<string, TestCase>>(new Map())
  const threadRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const thread = threadRef.current
    if (thread === null) return
    thread.scrollTop = thread.scrollHeight
  }, [session.messages.length, session.awaitingReply, session.proposals.length])

  // Resolve proposal case ids → case details from the project's library (same
  // source as the case palette). Loaded once per project; ids are numeric on the
  // wire and string on TestCase, so the modal converts when it looks them up.
  useEffect(() => {
    const controller = new AbortController()
    listTestCases(projectId, {}, controller.signal)
      .then((cases) => setCaseById(new Map(cases.map((tc) => [tc.id, tc]))))
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId])

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
            </li>
          ))}
          {session.awaitingReply && (
            <li className="chat-message chat-message--agent">
              <p className="chat-author">{c.agent}</p>
              <div className="run-chat-typing" role="status" aria-label={c.awaitingReply}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </li>
          )}
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
                expandLabel={c.expandLabel}
                applyText={c.apply}
                dropText={c.drop}
                disabled={session.applying}
                onExpand={() => setExpanded(proposal)}
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

      {expanded !== null && (
        <ProposalCasesModal
          proposal={expanded}
          caseById={caseById}
          onClose={() => setExpanded(null)}
        />
      )}
    </section>
  )
}

function ProposalCard({
  proposal,
  labelNew,
  labelEdit,
  caseCount,
  expandLabel,
  applyText,
  dropText,
  disabled,
  onExpand,
  onApply,
  onDrop,
}: {
  proposal: ScenarioProposal
  labelNew: string
  labelEdit: (id: number) => string
  caseCount: (n: number) => string
  expandLabel: string
  applyText: string
  dropText: string
  disabled: boolean
  onExpand: () => void
  onApply: () => void
  onDrop: () => void
}) {
  const isEdit = proposal.scenarioId !== null
  return (
    <li className={`run-chat-card run-chat-card--${isEdit ? 'edit' : 'new'}`}>
      <div className="run-chat-card-top">
        <p className="run-chat-card-kind">
          {isEdit ? labelEdit(proposal.scenarioId as number) : labelNew}
        </p>
        <button
          className="run-chat-expand"
          aria-label={expandLabel}
          title={expandLabel}
          onClick={onExpand}
          type="button"
        >
          ⤢
        </button>
      </div>
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

/** Modal listing the TestCases a proposal is composed of, in order. */
function ProposalCasesModal({
  proposal,
  caseById,
  onClose,
}: {
  proposal: ScenarioProposal
  caseById: Map<string, TestCase>
  onClose: () => void
}) {
  const { t } = useI18n()
  const c = t.scenarios.chat
  const isEdit = proposal.scenarioId !== null
  const cases = proposal.caseIds.map((id) => caseById.get(String(id)) ?? null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="run-chat-modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="run-chat-modal" role="dialog" aria-modal="true" aria-labelledby="rc-modal-title">
        <div className={`run-chat-modal-head run-chat-modal-head--${isEdit ? 'edit' : 'new'}`}>
          <div>
            <p className="run-chat-modal-kind">{isEdit ? c.proposalEdit(proposal.scenarioId as number) : c.proposalNew}</p>
            <h3 id="rc-modal-title">{proposal.title}</h3>
            {proposal.description.length > 0 && (
              <p className="run-chat-modal-sub">{proposal.description}</p>
            )}
          </div>
          <button className="run-chat-modal-close" aria-label={c.close} onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <p className="run-chat-modal-meta">{c.modalCases(proposal.caseIds.length)}</p>
        <ul className="run-chat-tc-list">
          {cases.map((tc, index) => (
            <li className="run-chat-tc" key={index}>
              {tc === null ? (
                <p className="run-chat-tc-missing">{c.caseMissing}</p>
              ) : (
                <>
                  <div className="run-chat-tc-h">
                    <span className={`run-chat-cat run-chat-cat--${tc.category}`}>{tc.category}</span>
                    <span className="run-chat-tc-title">
                      {index + 1}. {tc.title}
                    </span>
                  </div>
                  {tc.precondition !== null && tc.precondition.length > 0 && (
                    <div className="run-chat-tc-row">
                      <span className="run-chat-tc-lb">{c.precondition}</span>
                      <span className="run-chat-tc-vl">{tc.precondition}</span>
                    </div>
                  )}
                  <div className="run-chat-tc-row">
                    <span className="run-chat-tc-lb">{c.expected}</span>
                    <span className="run-chat-tc-vl">{tc.expected}</span>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
