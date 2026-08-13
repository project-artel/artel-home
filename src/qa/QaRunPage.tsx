import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { GameStreamView } from '../streaming/GameStreamView'
import { QaTryIssuePanel } from '../issues/QaTryIssuePanel'
import { listTestScenarios } from '../testScenarios/scenarioApi'
import { cancelQaRun, getQaRun, isDecimalId } from './qaApi'
import { QaChatPanel } from './QaChatPanel'
import { QaLogTimeline, type QaLogFocusRequest } from './QaLogTimeline'
import { QaStepTimeline } from './QaStepTimeline'
import { deriveQaProgress } from './qaProgress'
import { isTerminalQaStatus, type QaLog, type QaRun, type QaTry } from './qaTypes'
import { useQaTry } from './useQaTry'
import { useScenarioSteps } from './useScenarioSteps'

export function QaRunRoute() {
  const { projectId = '', qaRunId = '' } = useParams()
  if (!isDecimalId(qaRunId)) return <QaRunMissing projectId={projectId} />
  return <QaRunPage key={qaRunId} projectId={projectId} qaRunId={qaRunId} />
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
const FLOW_TYPES = new Set<QaLog['type']>(['ACTION', 'ACTION_RESULT', 'STATUS', 'ERROR', 'CHAT'])

/**
 * The QA run console (ARTEL-290): one run-scoped page for the whole execution.
 * A left rail lists every scenario in the run with its status; the centre shows
 * the focused scenario's live game and step progress; the log sits full-width
 * below with a Flow/Raw split. The console follows the active scenario as the run
 * advances — no refresh — and lets the operator click back to a finished one.
 */
function QaRunPage({ projectId, qaRunId }: { projectId: string; qaRunId: string }) {
  const { t } = useI18n()
  const [run, setRun] = useState<QaRun | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [titleById, setTitleById] = useState<Map<string, string>>(new Map())
  const stop = useRef(false)

  useEffect(() => {
    stop.current = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function tick() {
      try {
        const next = await getQaRun(qaRunId)
        if (stop.current) return
        setRun(next)
        setState('ready')
        if (!isTerminalQaStatus(next.status)) timer = setTimeout(tick, 3000)
      } catch {
        if (stop.current) return
        setState((prev) => (prev === 'ready' ? 'ready' : 'missing'))
      }
    }
    void tick()
    return () => {
      stop.current = true
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
    } catch {
      setCancelError(t.qa.run.cancelFailed)
    } finally {
      setCancelling(false)
    }
  }, [qaRunId, t.qa.run.cancelFailed])

  // Auto-advance: follow the active scenario unless the operator has pinned one.
  const activeTryId = run?.tries.find((entry) => !isTerminalQaStatus(entry.status))?.id ?? null
  const lastTryId = run?.tries.at(-1)?.id ?? null
  const [following, setFollowing] = useState(true)
  const [pinnedTryId, setPinnedTryId] = useState<string | null>(null)
  const focusedTryId = following ? (activeTryId ?? lastTryId) : pinnedTryId
  function focusTry(id: string) {
    setPinnedTryId(id)
    setFollowing(false)
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

      <div className="qa-console-grid">
        <nav className="qa-console-rail" aria-label={t.qa.run.scenariosHeading}>
          <p className="qa-console-rail-head">{t.qa.run.scenariosHeading}</p>
          <ol className="qa-console-rail-list">
            {run.tries.map((entry, index) => {
              const isFocused = entry.id === focusedTryId
              const isActive = entry.id === activeTryId
              return (
                <li key={entry.id}>
                  <button
                    className={`qa-rail-item${isFocused ? ' qa-rail-item--focused' : ''}${isActive ? ' qa-rail-item--active' : ''}`}
                    onClick={() => focusTry(entry.id)}
                    type="button"
                  >
                    <span className={`qa-rail-dot qa-rail-dot--${entry.status.toLowerCase()}`} aria-hidden="true" />
                    <span className="qa-rail-no">{index + 1}</span>
                    <span className="qa-rail-title">{scenarioTitle(entry, index)}</span>
                    <span className={`qa-run-status qa-run-status--${entry.status.toLowerCase()}`}>
                      {t.qa.statusLabels[entry.status]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        {focusedTry !== null ? (
          <FocusedTry key={focusedTry.id} tryId={focusedTry.id} />
        ) : (
          <div className="qa-focus qa-focus--empty"><p className="panel-empty">{t.qa.run.selectScenario}</p></div>
        )}
      </div>
    </section>
  )
}

/**
 * The focused scenario's detail, embedded in the console. Keyed by tryId in the
 * parent so advancing to the next scenario swaps the whole session cleanly (its
 * own SSE, game stream, logs) with no page refresh.
 */
function FocusedTry({ tryId }: { tryId: string }) {
  const { t } = useI18n()
  const session = useQaTry(tryId)
  const scenarioSteps = useScenarioSteps(session.qaTry?.testScenarioId ?? null)
  const [logView, setLogView] = useState<'flow' | 'raw' | 'issues'>('flow')
  const [focusRequest, setFocusRequest] = useState<QaLogFocusRequest | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  const progress = useMemo(
    () =>
      deriveQaProgress({
        scenarioSteps,
        logs: session.logs,
        status: session.qaTry?.status ?? 'STARTING',
        historyComplete: !session.hasMore,
      }),
    [scenarioSteps, session.hasMore, session.logs, session.qaTry?.status],
  )

  const jumpToLog = useCallback((logId: string) => {
    setLogView('raw')
    setFocusRequest((current) => ({ logId, token: (current?.token ?? 0) + 1 }))
  }, [])
  const clearFocusRequest = useCallback(() => setFocusRequest(null), [])

  const shownLogs = useMemo(
    () => (logView === 'flow' ? session.logs.filter((log) => FLOW_TYPES.has(log.type)) : session.logs),
    [logView, session.logs],
  )

  if (session.qaTry === null) {
    return <p className="panel-empty">{t.qa.run.loading}</p>
  }

  const active = !isTerminalQaStatus(session.qaTry.status)

  return (
    <div className="qa-focus">
      <div className="qa-focus-center">
        <section className="qa-focus-game" aria-label={active ? t.qa.run.liveGame : t.qa.run.endedGame}>
          {active ? (
            <GameStreamView instanceId={session.qaTry.gameInstanceId} />
          ) : (
            <div className="qa-focus-game-ended">{t.qa.run.endedGame}</div>
          )}
        </section>

        <QaStepTimeline onJump={jumpToLog} progress={progress} scenarioSteps={scenarioSteps} />
      </div>

      <aside className="qa-focus-logs-col" aria-label={t.qa.run.logsTitle}>
        <header className="qa-focus-logs-head">
          <div className="qa-log-tabs" role="tablist">
            <button className={logView === 'flow' ? 'on' : ''} onClick={() => setLogView('flow')} role="tab" aria-selected={logView === 'flow'} type="button">{t.qa.run.logsFlow}</button>
            <button className={logView === 'raw' ? 'on' : ''} onClick={() => setLogView('raw')} role="tab" aria-selected={logView === 'raw'} type="button">{t.qa.run.logsRaw}</button>
            <button className={logView === 'issues' ? 'on' : ''} onClick={() => setLogView('issues')} role="tab" aria-selected={logView === 'issues'} type="button">{t.qa.run.tabIssues}</button>
          </div>
        </header>
        <div className="qa-focus-logs-body">
          {logView === 'issues' ? (
            <QaTryIssuePanel qaTryId={session.qaTry.id} />
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

      <div className="qa-chat-dock">
        {chatOpen && (
          <div className="qa-chat-pop" role="dialog" aria-label={t.qa.run.chat}>
            <QaChatPanel
              disabled={session.qaTry.status !== 'RUNNING'}
              logs={session.logs}
              qaTryId={session.qaTry.id}
            />
          </div>
        )}
        <button
          className={`qa-chat-fab${chatOpen ? ' qa-chat-fab--on' : ''}`}
          onClick={() => setChatOpen((open) => !open)}
          aria-expanded={chatOpen}
          aria-label={t.qa.run.chat}
          title={t.qa.run.chat}
          type="button"
        >
          {chatOpen ? <ChatCloseIcon /> : <ArtelChatIcon />}
        </button>
      </div>
    </div>
  )
}

/**
 * Chat mark in the ARTEL house style: a monoline speech bubble (same stroke
 * weight / butt-cap, miter-join geometry as the brand mark) with three "typing"
 * dots. Drawn in currentColor so the FAB controls ink vs paper per state.
 */
function ArtelChatIcon() {
  return (
    <svg viewBox="0 0 64 64" width="26" height="26" fill="none" aria-hidden="true">
      <path
        d="M14 40 L14 16 L50 16 L50 40 L28 40 L18 50 L18 40 Z"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
      <circle cx="24" cy="28" r="3.1" fill="currentColor" />
      <circle cx="32" cy="28" r="3.1" fill="currentColor" />
      <circle cx="40" cy="28" r="3.1" fill="currentColor" />
    </svg>
  )
}

function ChatCloseIcon() {
  return (
    <svg viewBox="0 0 64 64" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M18 18 L46 46 M46 18 L18 46" stroke="currentColor" strokeWidth="7" strokeLinecap="butt" />
    </svg>
  )
}
