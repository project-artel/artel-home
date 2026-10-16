import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { GameStreamView } from '../streaming/GameStreamView'
import { QaTryIssuePanel } from '../issues/QaTryIssuePanel'
import { listTestScenarios } from '../testScenarios/scenarioApi'
import { cancelQaRun, getQaRun, isDecimalId } from './qaApi'
import { QaBehaviorLanes } from './QaBehaviorLanes'
import { QaFocusStage } from './QaFocusStage'
import { QaRunFunctionOptions } from './QaFunctionOptionsSummary'
import { QaLogTimeline, type QaLogFocusRequest } from './QaLogTimeline'
import { QaScenarioRail, type QaScenarioRailProps } from './QaScenarioRail'
import { deriveCaseVerdicts, deriveQaContextUsage, deriveQaProgress, isQaContextLog } from './qaProgress'
import { isTerminalQaStatus, type QaLog, type QaRun, type QaTry } from './qaTypes'
import { useQaTry } from './useQaTry'
import { useScenarioSteps } from './useScenarioSteps'

export function QaRunRoute() {
  const { projectId = '', qaRunId = '' } = useParams()
  // A malformed `try` degrades to no pin rather than a broken focus — the same
  // rule the id fields the console reads from the server already follow.
  const [searchParams] = useSearchParams()
  const tryParam = searchParams.get('try')
  const initialTryId = tryParam !== null && isDecimalId(tryParam) ? tryParam : null
  if (!isDecimalId(qaRunId)) return <QaRunMissing projectId={projectId} />
  return (
    <QaRunPage
      // Keys by the (run, try) pair, not just the run: a link from one scenario
      // in a run to a sibling scenario in the same run must still re-seed
      // `pinnedTryId`, and a plain `run`-keyed remount would not fire because
      // the component instance would already exist.
      key={`${qaRunId}:${initialTryId ?? ''}`}
      initialTryId={initialTryId}
      projectId={projectId}
      qaRunId={qaRunId}
    />
  )
}

function projectLink(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`
}

function QaRunMissing({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  return (
    <section className="page">
      <div className="panel-message">
        <h1>{t.qa.run.notFound}</h1>
        <Link className="button button--secondary" to={projectLink(projectId)}>{t.qa.run.back}</Link>
      </div>
    </section>
  )
}

// Only these carry meaning for the compact "Flow" view; the rest (raw LOG lines,
// per-frame GAME_STATE) are noise there and stay in the Raw tab.
//
// `ACTION` 은 여기서 빠졌다. 조작 tool 이 SDK 로 내보낸 요청이라 그 tool 의 `TOOL` 행과
// 같은 사건을 두 번 말하고, 흐름은 "에이전트가 무엇을 불렀나"의 나열로 읽혀야 한다.
// 전송 프레임을 봐야 할 때는 Raw 탭이 그대로 들고 있다.
const FLOW_TYPES = new Set<QaLog['type']>([
  'TOOL',
  'TOOL_RESULT',
  'STATUS',
  'ERROR',
  'CHAT',
  // behavior 가 끝난 이유는 흐름에서 읽혀야 하는 사건이다(ARTEL-1051).
  'BEHAVIOR_ENDED',
])

/** How often the console re-reads the run while it is still going. */
const POLL_INTERVAL_MS = 3000

/** The ceiling the retry delay backs off to while the server is unreachable. */
const POLL_BACKOFF_MAX_MS = 30_000

/**
 * The QA run console (ARTEL-290): one run-scoped page for the whole execution.
 * A left rail lists every scenario in the run with its status, unfolds the
 * focused one into its steps, and keeps that scenario's model usage at the
 * bottom. The centre shows the live game with a "Now" panel beside it and the
 * operator chat below; the log column on the right has Flow, Raw, and Issues
 * tabs. The console follows the active scenario as the run advances — no
 * refresh — and lets the operator click back to a finished one.
 *
 * `initialTryId` (ARTEL-723) is how the five retired `QaTryPage` entry points,
 * plus every other place that used to link to one scenario, land here instead:
 * they pass `?try=<id>`, which pins that scenario with follow off, exactly as
 * clicking a rail item would. `QaRunRoute` keys this component by `(qaRunId,
 * initialTryId)`, so this is read once per navigation, never re-applied by a
 * poll tick.
 */
function QaRunPage({
  initialTryId,
  projectId,
  qaRunId,
}: {
  initialTryId: string | null
  projectId: string
  qaRunId: string
}) {
  const { t } = useI18n()
  const [run, setRun] = useState<QaRun | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [titleById, setTitleById] = useState<Map<string, string>>(new Map())
  const stop = useRef(false)
  const refresh = useRef<() => void>(() => {})

  useEffect(() => {
    stop.current = false
    let timer: ReturnType<typeof setTimeout> | null = null
    // Grows while the server is unreachable so a long outage is not a request
    // every three seconds, and resets on the first answer.
    let backoff = POLL_INTERVAL_MS

    function schedule(delay: number) {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => void tick(), delay)
    }

    async function tick() {
      try {
        const next = await getQaRun(qaRunId)
        if (stop.current) return
        setRun(next)
        setState('ready')
        backoff = POLL_INTERVAL_MS
        if (!isTerminalQaStatus(next.status)) schedule(POLL_INTERVAL_MS)
      } catch {
        if (stop.current) return
        setState((prev) => (prev === 'ready' ? 'ready' : 'missing'))
        // **Keep polling.** This used to stop here, and one failed request ended
        // the loop for good: the page froze on its last snapshot — typically
        // `RUNNING` — and never moved again, so ending the run looked like it did
        // nothing. A deploy restarting Orchestration mid-run is exactly the case,
        // and exactly when the operator reaches for the cancel button.
        schedule(backoff)
        backoff = Math.min(backoff * 2, POLL_BACKOFF_MAX_MS)
      }
    }

    refresh.current = () => void tick()
    void tick()
    return () => {
      stop.current = true
      refresh.current = () => {}
      if (timer !== null) clearTimeout(timer)
    }
  }, [qaRunId])

  // Scenario titles for the rail — QaTry only carries testScenarioId.
  useEffect(() => {
    const controller = new AbortController()
    listTestScenarios(Number(projectId), controller.signal)
      .then((list) => setTitleById(new Map(list.map((s) => [String(s.testScenarioId), s.title]))))
      .catch(() => { /* rail falls back to ordinals */ })
    return () => controller.abort()
  }, [projectId])

  const onCancel = useCallback(async () => {
    setCancelling(true)
    setCancelError(null)
    try {
      await cancelQaRun(qaRunId)
      // Read the run back now rather than waiting for the next poll: the button
      // is the one place the operator expects the page to answer immediately.
      refresh.current()
    } catch {
      setCancelError(t.qa.run.cancelFailed)
    } finally {
      setCancelling(false)
    }
  }, [qaRunId, t.qa.run.cancelFailed])

  // Auto-advance: follow the active scenario unless the operator has pinned one.
  const activeTryId = run?.tries.find((entry) => !isTerminalQaStatus(entry.status))?.id ?? null
  const lastTryId = run?.tries.at(-1)?.id ?? null
  const [following, setFollowing] = useState(initialTryId === null)
  const [pinnedTryId, setPinnedTryId] = useState<string | null>(initialTryId)
  const focusedTryId = following ? (activeTryId ?? lastTryId) : pinnedTryId
  // A scenario's steps are shown while it is focused, unless the operator folded
  // it, and stay shown after focus moves on only if the operator opened them.
  // Entering a scenario always unfolds it, which is why focusing drops its entry.
  const [expandedOverrides, setExpandedOverrides] = useState<ReadonlyMap<string, boolean>>(new Map())
  function focusTry(id: string) {
    setPinnedTryId(id)
    setFollowing(false)
    setExpandedOverrides((current) => {
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }
  function isExpanded(id: string): boolean {
    return expandedOverrides.get(id) ?? id === focusedTryId
  }
  function toggleExpanded(id: string) {
    const expanded = isExpanded(id)
    setExpandedOverrides((current) => new Map(current).set(id, !expanded))
  }

  if (state === 'loading') {
    return <section className="page"><div className="panel-message"><p>{t.qa.run.loading}</p></div></section>
  }
  if (state === 'missing' || run === null) {
    return <QaRunMissing projectId={projectId} />
  }

  const done = run.tries.filter((entry) => isTerminalQaStatus(entry.status)).length
  const active = !isTerminalQaStatus(run.status)
  const focusedTry = run.tries.find((entry) => entry.id === focusedTryId) ?? null

  function scenarioTitle(entry: QaTry, index: number): string {
    const title = titleById.get(entry.testScenarioId)
    return title !== undefined && title.length > 0 ? title : t.qa.run.scenario(index + 1)
  }

  const rail: QaScenarioRailProps = {
    projectId,
    tries: run.tries,
    activeTryId,
    focusedTryId,
    scenarioTitle,
    isExpanded,
    onToggle: toggleExpanded,
    onFocus: focusTry,
  }

  return (
    <section className="qa-console">
      <header className="qa-console-top">
        <Link className="st-back" to={projectLink(projectId)}>{t.qa.run.back}</Link>
        <div className="qa-console-title">
          <strong>{t.qa.run.title}</strong>
          <span className={`qa-run-status qa-run-status--${run.status.toLowerCase()}`}>
            {t.qa.statusLabels[run.status]}
          </span>
          <span className="qa-console-progress">{t.qa.run.progress(done, run.tries.length)}</span>
        </div>
        <div className="qa-console-top-actions">
          <Link
            className="button button--secondary button--compact"
            to={`/projects/${encodeURIComponent(projectId)}/qa-runs/${encodeURIComponent(qaRunId)}/performance`}
          >
            {t.performance.entry.run}
          </Link>
          <button
            className={`qa-follow${following ? ' qa-follow--on' : ''}`}
            onClick={() => setFollowing(true)}
            disabled={following}
            type="button"
          >
            {following ? t.qa.run.following : t.qa.run.follow}
          </button>
          {active && (
            <button className="button button--secondary button--compact" disabled={cancelling} onClick={() => void onCancel()} type="button">
              {cancelling ? t.qa.run.cancelling : t.qa.run.cancel}
            </button>
          )}
          {cancelError !== null && <span className="qa-run-error">{cancelError}</span>}
        </div>
      </header>

      {focusedTry !== null ? (
        <FocusedTry key={focusedTry.id} qaRun={run} rail={rail} tryId={focusedTry.id} />
      ) : (
        <div className="qa-console-grid">
          <QaScenarioRail {...rail} focused={null} />
          <div className="qa-focus qa-focus--empty"><p className="panel-empty">{t.qa.run.selectScenario}</p></div>
        </div>
      )}
    </section>
  )
}

/**
 * The focused scenario's detail, embedded in the console. Keyed by tryId in the
 * parent so advancing to the next scenario swaps the whole session cleanly (its
 * own SSE, game stream, logs) with no page refresh.
 *
 * It renders the rail too, because the rail lists the focused scenario's steps
 * with their verdicts and those come from this session's log stream. The rail's
 * own state (which scenarios are unfolded) lives in the parent, so remounting
 * here on a scenario change does not reset it.
 */
function FocusedTry({ qaRun, rail, tryId }: { qaRun: QaRun; rail: QaScenarioRailProps; tryId: string }) {
  const { t } = useI18n()
  const session = useQaTry(tryId)
  const { steps: scenarioSteps, executionMode } = useScenarioSteps(session.qaTry?.testScenarioId ?? null)
  const [logView, setLogView] = useState<'flow' | 'raw' | 'issues'>('flow')
  const [focusRequest, setFocusRequest] = useState<QaLogFocusRequest | null>(null)

  const progress = useMemo(
    () =>
      deriveQaProgress({
        scenarioSteps,
        executionMode,
        logs: session.logs,
        status: session.qaTry?.status ?? 'STARTING',
        historyComplete: !session.hasMore,
      }),
    [scenarioSteps, executionMode, session.hasMore, session.logs, session.qaTry?.status],
  )

  const contextUsage = useMemo(() => deriveQaContextUsage(session.logs), [session.logs])
  const caseVerdicts = useMemo(() => deriveCaseVerdicts(session.logs), [session.logs])

  const jumpToLog = useCallback((logId: string) => {
    setLogView('raw')
    setFocusRequest((current) => ({ logId, token: (current?.token ?? 0) + 1 }))
  }, [])
  const clearFocusRequest = useCallback(() => setFocusRequest(null), [])

  const shownLogs = useMemo(() => {
    // Context readings are shown by the gauge, in one place, not as a line per model call.
    const withoutContext = session.logs.filter((log) => !isQaContextLog(log))
    return logView === 'flow' ? withoutContext.filter((log) => FLOW_TYPES.has(log.type)) : withoutContext
  }, [logView, session.logs])

  // Carried over from the retired `QaTryPage` (ARTEL-723): a failed load needs
  // its own retry, distinct from the plain "still loading" state below — the
  // console has no page refresh to fall back on, so this is the only way back.
  if (session.loadStatus === 'error') {
    return (
      <div className="qa-console-grid">
        <QaScenarioRail {...rail} focused={null} />
        <div className="qa-focus qa-focus--empty">
          <div className="panel-message" role="alert">
            <p>{t.qa.run.loadFailed}</p>
            <button className="button button--secondary" onClick={session.reload} type="button">
              {t.qa.panel.retry}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (session.qaTry === null) {
    return (
      <div className="qa-console-grid">
        <QaScenarioRail {...rail} focused={null} />
        <div className="qa-focus qa-focus--empty"><p className="panel-empty">{t.qa.run.loading}</p></div>
      </div>
    )
  }

  const active = !isTerminalQaStatus(session.qaTry.status)
  // Carried over from `QaTryPage` (ARTEL-723): what state the live log stream
  // is in. Only meaningful while the try is active — a terminal one already
  // says "ended · stored logs" via `endedGame` below.
  const streamLabel =
    session.streamState === 'offline'
      ? t.qa.run.streamOffline
      : session.streamState === 'degraded'
        ? t.qa.run.streamDegraded
        : session.streamState === 'connecting'
          ? t.qa.run.streamConnecting
          : session.streamState === 'live'
            ? t.qa.run.streamLive
            : t.qa.run.streamStored

  return (
    <div className="qa-console-grid">
      <QaScenarioRail
        {...rail}
        focused={{
          tryId: session.qaTry.id,
          active,
          progress,
          scenarioSteps,
          executionMode,
          onJump: jumpToLog,
          caseVerdicts,
        }}
      />
      <div className="qa-focus">
        <div className="qa-focus-center">
          <QaFocusStage
            chatDisabled={session.qaTry.status !== 'RUNNING'}
            contextUsage={contextUsage}
            game={
              <section className="qa-focus-game" aria-label={active ? t.qa.run.liveGame : t.qa.run.endedGame}>
                {active ? (
                  <GameStreamView instanceId={session.qaTry.gameInstanceId} />
                ) : (
                  <div className="qa-focus-game-ended">{t.qa.run.endedGame}</div>
                )}
              </section>
            }
            logs={session.logs}
            progress={progress}
            qaRun={qaRun}
            qaTryId={session.qaTry.id}
          />
        </div>

        <aside className="qa-focus-logs-col" aria-label={t.qa.run.logsTitle}>
          <header className="qa-focus-logs-head">
            <div className="qa-log-tabs" role="tablist">
              <button className={logView === 'flow' ? 'on' : ''} onClick={() => setLogView('flow')} role="tab" aria-selected={logView === 'flow'} type="button">{t.qa.run.logsFlow}</button>
              <button className={logView === 'raw' ? 'on' : ''} onClick={() => setLogView('raw')} role="tab" aria-selected={logView === 'raw'} type="button">{t.qa.run.logsRaw}</button>
              <button className={logView === 'issues' ? 'on' : ''} onClick={() => setLogView('issues')} role="tab" aria-selected={logView === 'issues'} type="button">{t.qa.run.tabIssues}</button>
            </div>
            {/* Carried over from `QaTryPage` (ARTEL-723): the stream state and the
                loaded-log count. A summarized state, so `aria-live` fits DESIGN.md's
                "do not announce every live log entry" rule. */}
            <div className="qa-focus-logs-meta">
              {active && (
                <span aria-live="polite" className="qa-focus-stream-state mono">
                  {streamLabel}
                </span>
              )}
              <span className="qa-focus-logs-count mono">{t.qa.run.logsCount(session.logs.length)}</span>
            </div>
          </header>
          <div className="gf-logs-extras">
            <QaRunFunctionOptions qaTryId={session.qaTry.id} />
            <QaBehaviorLanes logs={session.logs} onJump={jumpToLog} />
          </div>
          <div className="qa-focus-logs-body">
            {logView === 'issues' ? (
              <QaTryIssuePanel projectId={rail.projectId} qaTryId={session.qaTry.id} />
            ) : (
              <QaLogTimeline
                focusRequest={focusRequest}
                hasMore={session.hasMore}
                historyFailure={session.historyFailure}
                historyLoading={session.historyLoading}
                live={active}
                loadOlder={session.loadOlder}
                logs={shownLogs}
                onFocusResolved={clearFocusRequest}
                scenarioSteps={scenarioSteps}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

