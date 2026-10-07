import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { Dialog } from '../design-system/primitives/Dialog'
import { RunChatQuestionModal } from './RunChatQuestionModal'
import { ChatMessageBody, ChatReplyBody } from './ChatMessageBody'
import { ChatLinkContext } from './chatRefContext'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { formatDateTime } from '../projects/formatters'
import { groupStepsByCase } from '../testScenarios/scenarioTypes'
import type { AuthoringStage, ChatRef, RunChatQuestion, ScenarioProposal } from './runChatApi'
import { ESC_WINDOW_MS, pressEscape } from './escCancel'
import { deleteTestCase, getCoverage, getTestCase } from '../testCases/testCaseApi'
import type { TestCase, TestCaseCoverage } from '../testCases/testCaseTypes'
import { TestCaseSheet } from '../testCases/TestCaseSheet'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { ProjectApiError } from '../projects/projectApi'
import { getRunCoverage } from './testRunApi'
import type { RunCoverage } from './testRunApi'
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
  count,
  stalled,
  stalledLabel,
  formatCount,
}: {
  stages: AuthoringStage[]
  labels: Partial<Record<AuthoringStage, string>>
  elapsed: number | null
  ariaLabel: string
  formatElapsed: (seconds: number) => string
  formatRepeat: (times: number) => string
  formatPast: (steps: number) => string
  collapseLabel: string
  /** 지금 단계의 n/N (ARTEL-952). 셀 것이 없는 단계면 null. */
  count: { done?: number; total?: number } | null
  /** 한도를 넘겨 끊긴 것으로 보인다 (ARTEL-952). */
  stalled: boolean
  stalledLabel: string
  formatCount: (done: number, total: number) => string
}) {
  /**
   * 지나온 단계를 **펼친 채로 시작한다** (ARTEL-952).
   *
   * 접은 것이 기본이던 이유는 단계가 `thinking` 하나로 되풀이돼서, 펼쳐도 같은 줄이 여러 개
   * 쌓이기만 했기 때문이다. 노드로 바뀐 뒤에는 줄마다 다른 일을 말하므로 — 흐름을 나누고,
   * 스텝을 쓰고, 저장하고 — 펼친 쪽이 턴이 어디까지 왔는지 보여 준다.
   */
  const [open, setOpen] = useState(true)
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
        {/*
          * 수가 있으면 **되풀이 횟수 대신 수를 그린다** (ARTEL-952). 묶음 셋을 쓰는 중에
          * "3번" 과 "3/7" 은 다른 말이고, 뒤가 사용자가 알고 싶은 것이다.
          */}
        {count !== null && count.total !== undefined ? (
          <span className="authoring-progress-count">
            {formatCount(count.done ?? 0, count.total)}
          </span>
        ) : (
          live.times > 1 && (
            <span className="authoring-progress-repeat">{formatRepeat(live.times)}</span>
          )
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
      {/*
        * 끊긴 것으로 보일 때만 나오는 줄. 이것이 없을 때 무슨 일이 생겼나 — 런 87 의 턴이
        * 끊겼고 화면은 16시간 48분 뒤에도 같았다. 느린 것과 죽은 것을 구분할 수 없었다.
        *
        * 되돌릴 수 있는 상태로 둔다. 늦게라도 프레임이 오면 이 줄이 사라지고 화면은 다시
        * 진행으로 돌아간다 — 느린 턴을 죽었다고 단정해 사용자가 멀쩡한 결과를 버리게 하면 안 된다.
        */}
      {stalled && (
        <p className="authoring-progress-stalled" role="alert">
          {stalledLabel}
        </p>
      )}
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
  // 질문 문장 속 표식의 이름(ARTEL-933). 그 질문이 붙은 줄의 것을 모달까지 들고 간다.
  const [askingRefs, setAskingRefs] = useState<ChatRef[]>([])
  // TC 칩으로 연 케이스(ARTEL-940). 라이브러리와 같은 상세 시트로 보이고 거기서 고칠 수도 있다.
  const [openedCase, setOpenedCase] = useState<TestCase | null>(null)
  const [deletingCase, setDeletingCase] = useState<TestCase | null>(null)
  const projectId = session.projectId
  const openCase = useCallback((caseId: number) => {
    // 불러오지 못하면 열지 않는다 — 지워진 TC 를 가리키는 옛 답일 수 있다. 칩 자체는 남는다.
    getTestCase(projectId, String(caseId)).then(setOpenedCase, () => setOpenedCase(null))
  }, [projectId])
  const [coverage, setCoverage] = useState<TestCaseCoverage | null>(null)
  // 이 런이 담은 것(ARTEL-904). 위의 `coverage` 와 **축이 다르다** — 저쪽은 프로젝트 전량이고
  // 이쪽은 지금 만들고 있는 것들이다.
  const [runCoverage, setRunCoverage] = useState<RunCoverage | null>(null)
  // 내역을 펼쳤나. 배지는 수 하나만 보이고 시나리오별 줄은 눌러서 본다.
  const [coverageOpen, setCoverageOpen] = useState(false)
  const elapsed = useElapsedSeconds(session.turnStartedAt)
  /**
   * ESC 를 처음 누른 때(ARTEL-956). `null` 이면 묻지 않은 상태다.
   *
   * 두 번 누르게 한 이유는 되돌릴 수 없어서다 — 끊긴 턴은 이어서 하는 길이 없고, 저작 한 턴은
   * 수십 초라 그 사이 ESC 가 다른 뜻으로 눌린다. 판단은 {@link pressEscape} 가 한다.
   */
  const [escArmedAt, setEscArmedAt] = useState<number | null>(null)
  /**
   * 같은 값을 ref 로도 든다. 판단은 이것으로 하고 화면은 state 로 그린다.
   *
   * **state 만으로는 연타가 어긋난다** — ESC 를 세 번 잇달아 누르면 세 handler 가 같은 렌더의
   * `escArmedAt` 을 읽어 2·3번째가 똑같이 "창 안의 두 번째" 로 판정된다. 실측에서 취소가 세 번
   * 나갔다. ref 는 handler 안에서 바로 바뀌므로 세 번째 누름은 다시 첫 번째가 된다.
   */
  const escArmedAtRef = useRef<number | null>(null)
  // 물어본 상태를 **화면에 보일 때**는 도는 턴이 있는지까지 본다. 기다림이 끝나는 것은 ESC 와
  // 무관하게 일어나므로(답이 도착한다), 그때 문구가 남아 있으면 끊을 것이 없는데 "한 번 더" 를
  // 읽게 된다.
  const escArmed = escArmedAt !== null && session.awaitingReply
  // 이 화면이 띄워 둔 모달. 열려 있으면 ESC 는 그것을 닫는 뜻이라 취소로 세지 않는다.
  const overlayOpen =
    asking !== null ||
    expanded !== null ||
    openedCase !== null ||
    deletingCase !== null ||
    coverageOpen
  // 종착 단계(saved/blocked)는 여기에 없다. 그때는 훅이 목록을 비워 표시가 사라지고, 무슨 일이
  // 있었는지는 대화에 남은 문장이 말한다 — 다 끝난 눈금은 읽을거리만 하나 늘린다.
  const stageLabels: Partial<Record<AuthoringStage, string>> = {
    sent: c.stageSent,
    // 워크플로 노드 (ARTEL-952)
    grouping: c.stageGrouping,
    grouped: c.stageGrouped,
    bridging: c.stageBridging,
    saving: c.stageSaving,
    modifying: c.stageModifying,
    thinking: c.stageThinking,
    looking_up_cases: c.stageLookingUpCases,
    reading_case: c.stageReadingCase,
    finding_path: c.stageFindingPath,
    writing: c.stageWriting,
    checking: c.stageChecking,
    repairing: c.stageRepairing,
  }

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
    // 두 값을 **같은 시점에** 읽는다. 하나만 새로 읽으면 나란히 놓인 두 숫자가 서로 다른
    // 순간을 가리키고, 그 어긋남은 화면에서 계산 오류처럼 보인다.
    //
    // `active` 가 곧 `runId !== null` 이지만 타입은 그것을 모른다. 조건을 다시 적는 대신
    // 값으로 붙잡는다 — 여기서 `!` 를 쓰면 그 등식이 깨지는 날 런타임까지 간다.
    const runId = session.runId
    if (runId !== null) {
      getRunCoverage(session.projectId, runId, controller.signal)
        .then(setRunCoverage)
        .catch(() => {
          // 이 배지만 사라진다. 서버가 이 조회를 아직 모르는 판(구버전)도 여기로 온다.
        })
    }
    return () => controller.abort()
  }, [session.active, session.projectId, session.runId, session.messages.length])
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

  /**
   * ESC 두 번으로 도는 요청을 끊는다(ARTEL-956).
   *
   * 입력창이 아니라 창 전체에서 듣는다. 기다리는 동안 사용자가 커서를 어디에 두고 있을지
   * 알 수 없고, 그때 ESC 가 안 먹으면 "눌러도 아무 일이 없다" 가 된다.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || overlayOpen) return
      // 도는 턴이 없으면 판단이 `ignored` 로 떨어지고 물어본 상태도 함께 지워진다. 그래서
      // 턴이 끝났는지를 여기서 따로 치울 필요가 없다 — 치우는 자리가 둘이면 어긋난다.
      const press = pressEscape(escArmedAtRef.current, Date.now(), session.awaitingReply)
      escArmedAtRef.current = press.armedAt
      setEscArmedAt(press.armedAt)
      if (press.verdict === 'cancel') void session.cancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // `session` 통째로 두는 이유는 린트가 그렇게 요구하기 때문이다. 매 렌더마다 듣는 자리를
    // 다시 걸게 되는데, 그 비용은 이벤트 하나 등록이라 진행 표시가 1초마다 바뀌는 것보다 싸다.
  }, [session, overlayOpen])

  // 창이 지나면 물어본 것을 잊는다 — 화면의 "한 번 더" 도 함께 사라져야 한다. 문구는 남았는데
  // 그 ESC 가 이미 창을 넘겼으면, 한 번 더 눌러도 끊기지 않는 것을 사용자가 보게 된다.
  useEffect(() => {
    if (escArmedAt === null) return
    const timer = window.setTimeout(() => {
      escArmedAtRef.current = null
      setEscArmedAt(null)
    }, ESC_WINDOW_MS)
    return () => window.clearTimeout(timer)
  }, [escArmedAt])

  // Enter sends; Shift+Enter is a newline. `isComposing` guards IME input (Korean).
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void submit(event)
  }

  return (
    <ChatLinkContext.Provider value={{ projectId: session.projectId, runId: session.runId, openCase }}>
    <section className="panel scenario-chat" aria-labelledby="run-chat-title">
      <header className="panel-header">
        <h2 id="run-chat-title">{c.title}</h2>
        {/* 남은 케이스는 늘 보이되 아무것도 시키지 않는다 — 제안은 대화 끝의 칩이 하고, 이쪽은
            "지금 어디까지 왔나"만 말한다. 버튼과 나란히 두면 둘 다 도구처럼 읽힌다.
            폴링하지 않는다. 이 값은 이 페이지에서 일어난 일로만 바뀌고(턴이 끝나 저작이
            저장될 때), 그 시점에 이미 다시 읽는다. */}
        {/* 이 런의 커버리지(ARTEL-904). **왼쪽이 이 런, 오른쪽이 프로젝트 전량**이다 — 좁은
            것에서 넓은 것으로 읽히는 순서다. 앞서 이 값은 저작 턴마다 대화로 씬별 집계
            (`TurnBattleScene 8/29`)로 나갔는데, 시나리오는 여러 씬을 지나는 흐름이라 그
            비율로는 다음에 무엇을 할지 정할 수 없었다(ARTEL-903). 단위를 시나리오로 바꿔
            여기에 놓는다.
            **수만 보이고 내역은 눌러서 본다** — 머리에 시나리오 목록을 펼치면 대화가
            밀린다. 툴팁에만 두는 것도 안 된다: 화면으로 확인할 방법이 없다. */}
        {runCoverage !== null && runCoverage.total > 0 && (
          <button
            type="button"
            className="run-chat-coverage run-chat-coverage--run"
            aria-label={c.runCoverageOpen}
            onClick={() => setCoverageOpen(true)}
          >
            {c.runCoverageLabel}
            <strong>{runCoverage.covered}</strong>
            <span className="run-chat-coverage-total">/{runCoverage.total}</span>
            <span className="run-chat-coverage-tip" role="tooltip">
              {c.runCoverageHelp}
            </span>
          </button>
        )}
        {coverage !== null && coverage.total > 0 && (
          <span
            className={
              coverage.unauthored > 0
                ? 'run-chat-coverage run-chat-coverage--open'
                : 'run-chat-coverage'
            }
            tabIndex={0}
          >
            {u.remainingLabel}
            <strong>{coverage.unauthored}</strong>
            <span className="run-chat-coverage-total">/{coverage.total}</span>
            <span className="run-chat-coverage-tip" role="tooltip">
              {u.remainingHelp}
            </span>
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
                : message.reply != null
                  ? <ChatReplyBody reply={message.reply} refs={message.refs} />
                  : <ChatMessageBody body={message.content} refs={message.refs} />}
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
                    onClick={() => {
                      setAskingRefs(message.refs ?? [])
                      setAsking(message.questions ?? (message.question != null ? [message.question] : []))
                    }}
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
                count={session.count}
                stalled={session.stalled}
                stalledLabel={c.stageStalled}
                formatCount={c.stageCount}
              />
            </li>
          )}
        </ol>
      )}
      <EdgeScrollbar label={c.title} scroller={threadNode} side="right" />

      {/* 여기 있던 제안 칩 둘을 걷어냈다(ARTEL-904) — `다음은 TurnBattleScene — 아직 22건 남음`
          과 `뭐가 남았는지 보기`.

          **씬 축이 없어졌기 때문이다.** 두 칩은 `coverage.uncoveredScenes[0]` 를 읽어 "어느
          씬에 몇 건 남았나" 를 다음 할 일로 권했는데, 시나리오는 여러 씬을 지나는 흐름이라
          그 수로는 다음에 무엇을 할지 정할 수 없다(ARTEL-903 이 같은 이유로 대화에서 걷어낸
          안내다). 화면에 남아 있으면 없는 기능을 권하는 버튼이 된다. */}
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

      {/* ESC 를 한 번 눌렀다(ARTEL-956). 대화의 끝에 붙인다 — 기다리는 동안 사용자가
          보고 있는 것은 진행 표시이지 입력창 아래 한 줄이 아니다. */}
      {escArmed && (
        <p className="run-chat-cancel-armed" role="alert">
          {c.cancelArmed}
        </p>
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
            {/* 버튼을 두지 않은 것은 취소가 흔한 일이 아니기 때문이다(ARTEL-956) — 늘 보이는
                버튼은 늘 읽히고, 읽히는 만큼 눌린다. 기다리는 동안에만 전송 안내를 대신한다.
                한 번 눌러 물어보는 말은 여기가 아니라 대화 끝에 붙는다 — 사용자가 보고 있는
                곳이 거기다. */}
            <p className="shortcut-hint" id="run-chat-hint">
              {session.awaitingReply ? c.cancelHint : c.shortcutHint}
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

      {/* 시나리오별 내역(ARTEL-904). **수는 배지가, 줄은 여기가** 보인다 — 머리에 목록을
          펼치면 대화가 밀리고, 툴팁에만 두면 화면으로 확인할 방법이 없다. */}
      {coverageOpen && runCoverage !== null && (
        <Dialog
          title={c.runCoverageDialogTitle}
          labelledBy="run-coverage-title"
          onClose={() => setCoverageOpen(false)}
        >
          <p className="run-coverage-summary">
            {c.runCoverageSummary(runCoverage.covered, runCoverage.total)}
          </p>
          {runCoverage.scenarios.length === 0 ? (
            <p className="panel-empty">{c.runCoverageEmpty}</p>
          ) : (
            <table className="run-coverage-table">
              <thead>
                <tr>
                  <th scope="col">{c.runCoverageColumnScenario}</th>
                  <th scope="col">{c.runCoverageColumnSteps}</th>
                  <th scope="col">{c.runCoverageColumnCases}</th>
                </tr>
              </thead>
              <tbody>
                {runCoverage.scenarios.map((row) => (
                  <tr key={row.testScenarioId}>
                    <td>{row.title}</td>
                    <td>{row.steps}</td>
                    <td>{row.cases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="dialog-actions">
            <button type="button" onClick={() => setCoverageOpen(false)}>
              {c.runCoverageClose}
            </button>
          </div>
        </Dialog>
      )}

      {asking !== null && session.runId !== null && (
        <RunChatQuestionModal
          projectId={session.projectId}
          runId={session.runId}
          questions={asking}
          refs={askingRefs}
          disabled={session.sending || session.closed}
          onAnswer={(answer) => { void session.send('', answer) }}
          onClose={() => setAsking(null)}
        />
      )}
      {openedCase !== null && (
        <TestCaseSheet
          onClose={() => setOpenedCase(null)}
          onDelete={() => setDeletingCase(openedCase)}
          onSaved={setOpenedCase}
          projectId={session.projectId}
          testCase={openedCase}
        />
      )}

      {deletingCase !== null && (
        <ConfirmActionDialog
          body={
            <>
              <strong>
                {deletingCase.step.length > 0 ? deletingCase.step : t.testCases.delete.untitledName}
              </strong>
              {t.testCases.delete.copySuffix}
            </>
          }
          cancelLabel={t.testCases.delete.cancel}
          confirmLabel={t.testCases.delete.confirm}
          onClose={() => setDeletingCase(null)}
          onConfirm={async () => {
            await deleteTestCase(session.projectId, deletingCase.id)
            setDeletingCase(null)
            setOpenedCase(null)
          }}
          pendingLabel={t.testCases.delete.pending}
          title={t.testCases.delete.title}
          toFailureMessage={(error) =>
            error instanceof ProjectApiError && error.isNotFound
              ? t.testCases.delete.gone
              : t.testCases.delete.failed
          }
        />
      )}
    </section>
    </ChatLinkContext.Provider>
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
