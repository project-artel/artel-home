import { Link, useParams } from 'react-router-dom'
import { GameStreamView } from '../streaming/GameStreamView'
import { isDecimalId } from './qaApi'
import { QaLogTimeline } from './QaLogTimeline'
import { isTerminalQaStatus, type QaTryStatus } from './qaTypes'
import { useQaTry } from './useQaTry'

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
      </header>

      <p className="sr-status" aria-live="polite">
        {active ? streamLabel : `QA Try ${STATUS_LABELS[session.qaTry.status]}.`}
      </p>

      <div className="qa-workspace">
        {active && (
          <section className="qa-stream-panel" aria-label="Live game">
            <GameStreamView instanceId={session.qaTry.gameInstanceId} />
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
            hasMore={session.hasMore}
            historyFailure={session.historyFailure}
            historyLoading={session.historyLoading}
            live={active}
            loadOlder={session.loadOlder}
            logs={session.logs}
          />
        </section>
      </div>
    </section>
  )
}

