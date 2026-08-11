import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import { groupStepsByCase } from '../testScenarios/scenarioTypes'
import type { ScenarioProposal } from './runChatApi'
import type { RunChatSession } from './useRunChatSession'

/** 표시용 텍스트 정리: 줄바꿈·중복 공백을 한 칸으로, 앞의 대시·불릿·번호 접두 제거. */
function cleanText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[-–—•*\s]+/, '')
    .trim()
}

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
export function RunChat({ session }: { session: RunChatSession }) {
  const { t } = useI18n()
  const c = t.scenarios.chat
  const [input, setInput] = useState('')
  const [expanded, setExpanded] = useState<ScenarioProposal | null>(null)
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
        <ProposalStepsModal
          proposal={expanded}
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
      <p className="run-chat-card-cases">{caseCount(proposal.steps.length)}</p>
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

/** Modal listing a proposal's ordered steps, grouped into TC boxes (재설계). */
function ProposalStepsModal({
  proposal,
  onClose,
}: {
  proposal: ScenarioProposal
  onClose: () => void
}) {
  const { t } = useI18n()
  const c = t.scenarios.chat
  const sv = t.scenarios.stepsView
  const isEdit = proposal.scenarioId !== null
  // 내부 case_id는 노출 금지 — TC는 등장 순서(1,2,…)로만 표시한다.
  let tcSeq = 0
  const groups = groupStepsByCase(proposal.steps).map((group) => ({
    group,
    tcNo: group.caseId === null ? 0 : ++tcSeq,
  }))

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
        <p className="run-chat-modal-meta">{c.modalCases(proposal.steps.length)}</p>
        <ul className="rc-steps">
          {groups.map(({ group, tcNo }, gi) =>
            group.caseId === null ? (
              group.steps.map((step, si) => (
                <li key={`p-${gi}-${si}`} className="rc-step rc-step--plain">
                  <span className="rc-step-no">{group.indices[si] + 1}</span>
                  <span className="rc-step-body">
                    <span className="rc-step-action">{cleanText(step.action) || sv.noAction}</span>
                    {cleanText(step.hint) && <span className="rc-step-hint">{cleanText(step.hint)}</span>}
                  </span>
                </li>
              ))
            ) : (
              <li key={`c-${gi}`} className="rc-tc">
                <div className="rc-tc-head">
                  <span className="rc-tc-badge">TC {tcNo}</span>
                  <span className="rc-tc-count">{sv.caseSteps(group.steps.length)}</span>
                </div>
                <ol className="rc-tc-steps">
                  {group.steps.map((step, si) => {
                    const verify = si === group.steps.length - 1
                    return (
                      <li key={si} className={`rc-step${verify ? ' rc-step--verify' : ''}`}>
                        <span className="rc-step-no">{group.indices[si] + 1}</span>
                        <span className="rc-step-body">
                          <span className="rc-step-action">{cleanText(step.action) || sv.noAction}</span>
                          {verify && <span className="rc-step-badge">{sv.verify}</span>}
                          {cleanText(step.hint) && <span className="rc-step-hint">{cleanText(step.hint)}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </li>
            ),
          )}
        </ul>
      </div>
    </div>
  )
}
