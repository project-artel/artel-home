import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { GameStreamView } from '../streaming/GameStreamView'
import { CancelQaTryDialog } from './CancelQaTryDialog'
import { isDecimalId } from './qaApi'
import { QaTryIssuePanel } from '../issues/QaTryIssuePanel'
import { QaChatPanel } from './QaChatPanel'
import { QaLogTimeline, type QaLogFocusRequest } from './QaLogTimeline'
import { deriveQaProgress } from './qaProgress'
import { QaStepStrip } from './QaStepStrip'
import { isTerminalQaStatus, type QaTryStatus } from './qaTypes'
import { useQaTry } from './useQaTry'
import { useScenarioSteps } from './useScenarioSteps'

const STATUS_LABELS: Record<QaTryStatus, string> = {
  STARTING: 'Starting',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

export function QaTryRoute() {
  const { projectId = '', qaTryId = '' } = useParams()
  if (!isDecimalId(qaTryId)) {
    return <InvalidQaTry projectId={projectId} />
  }
  return <QaTryPage key={qaTryId} projectId={projectId} qaTryId={qaTryId} />
}

function projectLink(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`
}

function InvalidQaTry({ projectId }: { projectId: string }) {
  return (
    <section className="page">
      <div className="panel-message">
        <h1>QA Try not found</h1>
        <p className="panel-message-copy">The QA Try address is not valid.</p>
        <Link className="button button--secondary" to={projectLink(projectId)}>
          Back to the project
        </Link>
      </div>
    </section>
  )
}

function QaTryPage({ projectId, qaTryId }: { projectId: string; qaTryId: string }) {
  const session = useQaTry(qaTryId)
  const [cancelling, setCancelling] = useState(false)
  const [focusRequest, setFocusRequest] = useState<QaLogFocusRequest | null>(null)
  const { t } = useI18n()
  const scenarioSteps = useScenarioSteps(session.qaTry?.testScenarioId ?? null)

  // Derived above the early returns: hooks cannot be reached conditionally, and
  // the strip is cheap enough to recompute whenever a log lands.
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
    setFocusRequest((current) => ({ logId, token: (current?.token ?? 0) + 1 }))
  }, [])
  const clearFocusRequest = useCallback(() => setFocusRequest(null), [])

  if (session.loadStatus === 'loading') {
    return (
      <section className="page" aria-busy="true">
        <p className="panel-empty">Loading QA Try…</p>
      </section>
    )
  }

  if (session.loadStatus === 'missing') {
    return (
      <section className="page">
        <div className="panel-message">
          <h1>QA Try not found</h1>
          <p className="panel-message-copy">
            It may have been removed, or you may not have access to it.
          </p>
          <Link className="button button--secondary" to={projectLink(projectId)}>
            Back to the project
          </Link>
        </div>
      </section>
    )
  }

  if (session.loadStatus === 'error' || session.qaTry === null) {
    return (
      <section className="page">
        <div className="panel-message" role="alert">
          <p>This QA Try could not be loaded.</p>
          <button className="button button--secondary" onClick={session.reload} type="button">
            Retry
          </button>
        </div>
      </section>
    )
  }

  const active = !isTerminalQaStatus(session.qaTry.status)
  const streamLabel =
    session.streamState === 'offline'
      ? 'Live log connection lost. Reload to reconnect.'
      : session.streamState === 'degraded'
        ? 'Live log connection interrupted. Reconnecting…'
        : session.streamState === 'connecting'
          ? 'Connecting live logs…'
          : session.streamState === 'live'
            ? 'Live logs connected'
            : 'Stored logs'

  return (
    <section className={`page qa-page ${active ? 'qa-page--active' : 'qa-page--terminal'}`} aria-labelledby="qa-try-title">
      <header className="page-header qa-page-header">
        <div>
          <Link className="back-link" to={projectLink(projectId)}>← Back to the project</Link>
          <h1 id="qa-try-title">QA Try <span className="mono" translate="no">#{session.qaTry.id}</span></h1>
          <p className="page-subtitle">
            <span className={`qa-status qa-status--${session.qaTry.status.toLowerCase()}`}>
              {STATUS_LABELS[session.qaTry.status]}
            </span>
            <span aria-hidden="true">·</span>
            <span>{active ? streamLabel : 'Execution ended · stored logs only'}</span>
          </p>
        </div>
        {active && (
          <div className="page-header-actions">
            <button
              className="button button--danger-quiet"
              onClick={() => setCancelling(true)}
              type="button"
            >
              {t.qa.cancel.action}
            </button>
          </div>
        )}
      </header>

      <p className="sr-status" aria-live="polite">
        {active ? streamLabel : `QA Try ${STATUS_LABELS[session.qaTry.status]}.`}
      </p>

      <QaStepStrip onJump={jumpToLog} progress={progress} />

      <div className="qa-workspace">
        {active && (
          <section className="qa-stream-panel" aria-label="Live game">
            <GameStreamView instanceId={session.qaTry.gameInstanceId} />
            {/* Under the game, not beside the log: what the operator says is
                about what they are watching, and the timeline stays one column. */}
            <QaChatPanel
              disabled={session.qaTry.status !== 'RUNNING'}
              logs={session.logs}
              qaTryId={session.qaTry.id}
            />
          </section>
        )}

        <section className="qa-log-panel" aria-labelledby="qa-log-title">
          <header className="qa-log-header">
            <div>
              <h2 id="qa-log-title">Activity log</h2>
              <p>Agent, orchestration, and SDK messages in recorded order.</p>
            </div>
            <span className="qa-log-count">{session.logs.length} loaded</span>
          </header>
          <QaLogTimeline
            focusRequest={focusRequest}
            hasMore={session.hasMore}
            historyFailure={session.historyFailure}
            historyLoading={session.historyLoading}
            live={active}
            loadOlder={session.loadOlder}
            logs={session.logs}
            onFocusResolved={clearFocusRequest}
          />
        </section>
      </div>

      {/* Below the workspace, not inside it: the timeline is what happened, and
          this is what came out of it. */}
      <QaTryIssuePanel qaTryId={session.qaTry.id} />

      {cancelling && (
        <CancelQaTryDialog
          onCancelled={() => {
            setCancelling(false)
            // Re-read rather than patch local state: cancelling also closes the
            // log stream, and `reload` is what settles both at once.
            session.reload()
          }}
          onClose={() => setCancelling(false)}
          qaTryId={session.qaTry.id}
        />
      )}
    </section>
  )
}

