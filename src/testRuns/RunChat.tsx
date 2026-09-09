import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { RunChatQuestionModal } from './RunChatQuestionModal'
import { ChatMessageBody } from './ChatMessageBody'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { formatDateTime } from '../projects/formatters'
import { groupStepsByCase } from '../testScenarios/scenarioTypes'
import type { AuthoringStage, RunChatQuestion, ScenarioProposal } from './runChatApi'
import { getCoverage } from '../testCases/testCaseApi'
import type { TestCaseCoverage } from '../testCases/testCaseTypes'
import type { RunChatSession } from './useRunChatSession'

/** 표시용 텍스트 정리: 줄바꿈·중복 공백을 한 칸으로, 앞의 대시·불릿·번호 접두 제거. */
function cleanText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[-–—•*\s]+/, '')
    .trim()
}

/**
 * How long the turn in flight has been running (ARTEL-419).
 *
 * The counter matters most where there is nothing else to show. Between "sent"
 * and the agent's first tool call the server observes nothing at all, and that
 * silence is exactly where a slow turn and a dead one look alike — the clock is
 * the only thing that tells them apart. Returns null when no turn is running.
 */
function useElapsedSeconds(startedAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  if (startedAt === null) return null
  // `now` is still the previous turn's tick for up to a second after a new turn
  // starts, which would read as a negative age. Clamping shows 0s until it catches
  // up — the honest reading, since the turn really did just begin.
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

/**
 * The stages this turn has passed through (ARTEL-419).
 *
 * Only stages the server actually sent are drawn. A fixed set of slots would be
 * easier to read but would have to guess at the ones that did not happen, and a
 * turn that calls no tool is normal — colouring "케이스 확인" as done in that
 * turn claims something nobody observed.
 *
 * **One line by default: what is happening now** (ARTEL-487). The stages used to
 * run across the pane as a single row, which was fine at three of them; now that
 * the agent reports every model turn a long turn produces eight or nine, they
 * wrapped into ragged lines, and the one thing worth reading — the live stage and
 * its clock — was the hardest to find in the middle of them.
 *
 * So the past folds away behind a count and opens as a vertical list, where the
 * dots line up in a column and it reads as a history rather than as a paragraph.
 * Left open once opened: someone watching a slow turn wants it to stay open.
 *
 * A stage that repeats is one entry with a count, not N entries. The agent reports
 * every model turn, so a turn that looks things up three times sends "thinking"
 * three times — worth knowing (it is still going round), not worth three identical
 * rows.
 */
function AuthoringProgress({
  stages,
  labels,
  elapsed,
  ariaLabel,
  formatElapsed,
  formatRepeat,
  formatPast,
  collapseLabel,
}: {
  stages: AuthoringStage[]
  labels: Partial<Record<AuthoringStage, string>>
  elapsed: number | null
  ariaLabel: string
  formatElapsed: (seconds: number) => string
  formatRepeat: (times: number) => string
  formatPast: (steps: number) => string
  collapseLabel: string
}) {
  const [open, setOpen] = useState(false)
  const shown = stages
    .filter((stage) => labels[stage] !== undefined)
    .reduce<{ stage: AuthoringStage; times: number }[]>((runs, stage) => {
      const last = runs[runs.length - 1]
      if (last !== undefined && last.stage === stage) last.times += 1
      else runs.push({ stage, times: 1 })
      return runs
    }, [])
  if (shown.length === 0) return null
  const live = shown[shown.length - 1]
  const past = shown.slice(0, -1)
  return (
    <div className="authoring-progress" aria-label={ariaLabel} role="status">
      {open && past.length > 0 && (
        <ol className="authoring-progress-past">
          {past.map(({ stage, times }, index) => (
            <li className="authoring-progress-step" key={`${stage}-${index}`}>
              <span className="authoring-progress-dot" aria-hidden="true" />
              <span className="authoring-progress-label">{labels[stage]}</span>
              {times > 1 && (
                <span className="authoring-progress-repeat">{formatRepeat(times)}</span>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="authoring-progress-step is-live">
        <span className="authoring-progress-dot" aria-hidden="true" />
        <span className="authoring-progress-label">{labels[live.stage]}</span>
        {live.times > 1 && (
          <span className="authoring-progress-repeat">{formatRepeat(live.times)}</span>
        )}
        {elapsed !== null && (
          <span className="authoring-progress-elapsed">{formatElapsed(elapsed)}</span>
        )}
        {past.length > 0 && (
          <button
            aria-expanded={open}
            className="authoring-progress-toggle"
            onClick={() => setOpen((was) => !was)}
            type="button"
          >
            {open ? collapseLabel : formatPast(past.length)}
          </button>
        )}
      </p>
    </div>
  )
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
  const u = t.projects.workspace.uncovered
  const c = t.scenarios.chat
  // 대시보드에서 넘어온 요청문으로 시작한다(ARTEL-405). **보내지는 않는다** — 제안은 제안이고
  // 무엇을 보낼지는 사람이 정한다. 처음 한 번만 씨앗으로 쓰므로 이후 타이핑을 덮지 않는다.
  const [searchParams] = useSearchParams()
  const [input, setInput] = useState(() => searchParams.get('draft') ?? '')
  const [expanded, setExpanded] = useState<ScenarioProposal | null>(null)
  // 지금 화면 가운데에 띄워 둔 되묻기(ARTEL-677). 비어 있으면 모달이 없다.
  const [asking, setAsking] = useState<RunChatQuestion[] | null>(null)
  const [coverage, setCoverage] = useState<TestCaseCoverage | null>(null)
  const elapsed = useElapsedSeconds(session.turnStartedAt)
  // 종착 단계(saved/blocked)는 여기에 없다. 그때는 훅이 목록을 비워 표시가 사라지고, 무슨 일이
  // 있었는지는 대화에 남은 문장이 말한다 — 다 끝난 눈금은 읽을거리만 하나 늘린다.
  const stageLabels: Partial<Record<AuthoringStage, string>> = {
    sent: c.stageSent,
    thinking: c.stageThinking,
    looking_up_cases: c.stageLookingUpCases,
    reading_case: c.stageReadingCase,
    finding_path: c.stageFindingPath,
    writing: c.stageWriting,
    checking: c.stageChecking,
    repairing: c.stageRepairing,
  }

  // 제안을 낼 조건. 턴이 한 번은 끝났고(에이전트가 답한 적이 있고), 지금 답을 기다리는 중이
  // 아니며, 아직 안 담긴 케이스가 있을 때만이다. 셋 중 하나라도 아니면 낼 말이 없다.
  const answered = session.messages.some((message) => message.role !== 'USER')
  const idle = !session.awaitingReply && !session.sending
  const topScene = coverage?.uncoveredScenes[0]
  // 두 칩은 종류가 다르다. 하나는 시키고, 하나는 묻는다 — 같은 것 여럿 중에 고르라는 메뉴가
  // 아니라서 둘을 나란히 둘 수 있다. 묻는 쪽은 에이전트의 list_uncovered_cases로 이어져
  // 씬과 케이스 문구로 답이 온다.
  const suggestions =
    answered && idle && topScene !== undefined
      ? [
          { key: 'author', label: u.suggestScene(topScene.scene, topScene.count),
            request: u.requestFor(topScene.scene, topScene.count) },
          { key: 'ask', label: u.askRemaining, request: u.askRemainingRequest },
        ]
      : []

  // 저작하는 자리에서 남은 수를 본다(ARTEL-405). 대시보드에도 같은 값이 있지만 이쪽이 실제로
  // 무언가를 할 자리다 — 입력창이 바로 아래라 페이지를 옮기지 않고 그대로 이어서 요청한다.
  //
  // 턴이 오갈 때마다 다시 읽는다. 시나리오를 하나 만들면 남은 수가 바로 달라지는데, 그 숫자만
  // 옛것으로 남으면 사용자는 방금 한 일이 반영되지 않았다고 읽는다.
  useEffect(() => {
    if (!session.active) return
    const controller = new AbortController()
    getCoverage(session.projectId, controller.signal)
      .then(setCoverage)
      .catch(() => {
        // 커버리지를 못 읽는 것이 대화를 막을 이유는 없다. 줄이 사라질 뿐이다.
      })
    return () => controller.abort()
  }, [session.active, session.projectId, session.messages.length])
  // 대화 줄 목록을 ref 와 state 둘 다로 든다. 아래 자동 스크롤은 노드를 직접 건드리므로
  // ref 여야 하고, {@link EdgeScrollbar} 는 이 `<ol>` 이 **생기는 순간**을 알아야 하므로
  // state 여야 한다 — 첫 메시지가 오기 전에는 목록 자체가 DOM 에 없다.
  const threadRef = useRef<HTMLOListElement | null>(null)
  const [threadNode, setThreadNode] = useState<HTMLOListElement | null>(null)
  const setThread = useCallback((node: HTMLOListElement | null) => {
    threadRef.current = node
    setThreadNode(node)
  }, [])

  useEffect(() => {
    const thread = threadRef.current
    if (thread === null) return
    thread.scrollTop = thread.scrollHeight
    // 단계가 늘어날 때도 따라 내린다(ARTEL-487). 이제 한 턴에 여러 줄이 쌓이는데, 그 줄들이
    // 늘어나는 동안 스크롤이 그대로면 정작 지금 무엇을 하는지가 보이는 영역 밖으로 밀린다.
  }, [
    session.messages.length,
    session.awaitingReply,
    session.proposals.length,
    session.stages.length,
  ])

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
        {/* 남은 케이스는 늘 보이되 아무것도 시키지 않는다 — 제안은 대화 끝의 칩이 하고, 이쪽은
            "지금 어디까지 왔나"만 말한다. 버튼과 나란히 두면 둘 다 도구처럼 읽힌다.
            폴링하지 않는다. 이 값은 이 페이지에서 일어난 일로만 바뀌고(턴이 끝나 저작이
            저장될 때), 그 시점에 이미 다시 읽는다. */}
        {coverage !== null && coverage.total > 0 && (
          <span
            className={
              coverage.unauthored > 0
                ? 'run-chat-coverage run-chat-coverage--open'
                : 'run-chat-coverage'
            }
            title={u.title}
          >
            {u.remainingLabel}
            <strong>{coverage.unauthored}</strong>
            <span className="run-chat-coverage-total">/{coverage.total}</span>
          </span>
        )}
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
        <ol className="chat-thread" ref={setThread}>
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
              {/* 에이전트가 쓴 구조는 세워 두고, 사용자가 친 글자는 건드리지 않는다 —
                  별표를 친 사람은 별표를 보려고 친 것이다. */}
              {message.role === 'USER'
                ? <p className="chat-body">{message.content}</p>
                : <ChatMessageBody body={message.content} />}
              {/* 물어본 줄에는 누를 것이 붙는다(ARTEL-487). 답하면 사라진다 — 이미 답한 질문에
                  버튼이 남아 있으면 두 번 답하게 된다. */}
              {/* **묻는 자리는 화면 가운데다**(ARTEL-677). 답이 시나리오를 실행 가능하게
                  만드는지를 가르는데, 300px 대화 칸 안에 글줄로 쌓이면 아무도 안 읽는다.
                  줄에는 여는 단추만 남기고, 질문과 그 답이 들어갈 자리는 모달이 보인다. */}
              {(message.questions ?? (message.question != null ? [message.question] : [])).length > 0 && (
                <div className="chat-question-ask">
                  <p className="chat-question-hint">
                    {t.scenarios.chat.question.openHint.replace(
                      '{count}',
                      String((message.questions ?? (message.question != null ? [message.question] : [])).length),
                    )}
                  </p>
                  <button
                    className="chat-question-open"
                    type="button"
                    disabled={session.sending || session.closed}
                    onClick={() =>
                      setAsking(message.questions ?? (message.question != null ? [message.question] : []))
                    }
                  >
                    {t.scenarios.chat.question.openModal.replace(
                      '{count}',
                      String((message.questions ?? (message.question != null ? [message.question] : [])).length),
                    )}
                  </button>
                </div>
              )}
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
              {/* 어디까지 왔는지(ARTEL-419). 점 세 개는 "살아 있다"만 말하고 어디쯤인지는
                  말하지 못한다 — 20초 걸리는 턴과 100초 걸리는 턴, 영영 오지 않는 턴이
                  화면에서 같아 보이던 이유다. */}
              <AuthoringProgress
                ariaLabel={c.stageLabel}
                elapsed={elapsed}
                formatElapsed={c.stageElapsed}
                collapseLabel={c.stageCollapse}
                formatPast={c.stagePast}
                formatRepeat={c.stageRepeat}
                labels={stageLabels}
                stages={session.stages}
              />
            </li>
          )}
        </ol>
      )}
      <EdgeScrollbar label={c.title} scroller={threadNode} side="right" />

      {/* 턴이 끝난 뒤에 나오는 제안(ARTEL-405). 대화가 시작도 안 했는데 버튼이 놓여 있으면
          그건 제안이 아니라 도구 모음이고, 사용자는 무엇을 하라는 말인지 모른 채 지나친다.
          답이 오는 중에는 감춘다 — 아직 끝나지 않은 턴에 다음 할 일을 권하는 것은 이르다. */}
      {suggestions.length > 0 && (
        <div className="chat-suggestions">
          {suggestions.map((suggestion) => (
            <button
              className="chat-suggestion"
              key={suggestion.key}
              onClick={() => setInput(suggestion.request)}
              type="button"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
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
          {session.applyFailure !== null && (
            <div className="inline-error" role="alert">
              <span aria-hidden="true">!</span>
              {c.applyFailed}
            </div>
          )}
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

      {asking !== null && session.runId !== null && (
        <RunChatQuestionModal
          projectId={session.projectId}
          runId={session.runId}
          questions={asking}
          disabled={session.sending || session.closed}
          onAnswer={(answer) => { void session.send('', answer) }}
          onClose={() => setAsking(null)}
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
