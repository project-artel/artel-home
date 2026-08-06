import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { isDecimalId } from './qaApi'
import { isTerminalQaRunStatus, isTerminalQaStatus, type QaTry } from './qaTypes'
import { useQaRun } from './useQaRun'

export function QaRunRoute() {
  const { projectId = '', qaRunId = '' } = useParams()
  if (!isDecimalId(qaRunId)) {
    return <InvalidQaRun projectId={projectId} />
  }
  return <QaRunPage key={qaRunId} projectId={projectId} qaRunId={qaRunId} />
}

function projectLink(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`
}

function tryLink(projectId: string, qaTryId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/qa-tries/${encodeURIComponent(qaTryId)}`
}

function InvalidQaRun({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  return (
    <section className="page">
      <div className="panel-message">
        <h1>{t.qa.run.invalidTitle}</h1>
        <p className="panel-message-copy">{t.qa.run.invalidCopy}</p>
        <Link className="button button--secondary" to={projectLink(projectId)}>
          {t.qa.run.back}
        </Link>
      </div>
    </section>
  )
}

function QaRunPage({ projectId, qaRunId }: { projectId: string; qaRunId: string }) {
  const { t } = useI18n()
  const session = useQaRun(qaRunId)

  if (session.loadStatus === 'loading') {
    return (
      <section className="page" aria-busy="true">
        <p className="panel-empty">{t.qa.run.loading}</p>
      </section>
    )
  }

  if (session.loadStatus === 'missing') {
    return (
      <section className="page">
        <div className="panel-message">
          <h1>{t.qa.run.missingTitle}</h1>
          <p className="panel-message-copy">{t.qa.run.missingCopy}</p>
          <Link className="button button--secondary" to={projectLink(projectId)}>
            {t.qa.run.back}
          </Link>
        </div>
      </section>
    )
  }

  if (session.loadStatus === 'error' || session.run === null) {
    return (
      <section className="page">
        <div className="panel-message" role="alert">
          <p>{t.qa.run.loadError}</p>
          <button className="button button--secondary" onClick={session.reload} type="button">
            {t.qa.run.retry}
          </button>
        </div>
      </section>
    )
  }

  const run = session.run
  const active = !isTerminalQaRunStatus(run.status)
  const done = run.tries.filter((qaTry) => isTerminalQaStatus(qaTry.status)).length

  return (
    <section
      className={`page qa-page ${active ? 'qa-page--active' : 'qa-page--terminal'}`}
      aria-labelledby="qa-run-title"
    >
      <header className="page-header qa-page-header">
        <div>
          <Link className="back-link" to={projectLink(projectId)}>
            {t.qa.run.back}
          </Link>
          <h1 id="qa-run-title">
            {t.qa.run.title} <span className="mono" translate="no">#{run.id}</span>
          </h1>
          <p className="page-subtitle">
            <span className={`qa-status qa-status--${run.status.toLowerCase()}`}>
              {t.qa.statusLabels[run.status]}
            </span>
            <span aria-hidden="true">·</span>
            <span>{active ? t.qa.run.liveNote : t.qa.run.endedNote}</span>
            <span aria-hidden="true">·</span>
            <span>{t.qa.run.progress(done, run.tries.length)}</span>
          </p>
        </div>
      </header>

      <p className="sr-status" aria-live="polite">
        {t.qa.run.progress(done, run.tries.length)}
      </p>

      <section className="qa-log-panel" aria-labelledby="qa-run-scenarios-title">
        <header className="qa-log-header">
          <div>
            <h2 id="qa-run-scenarios-title">{t.qa.run.scenariosTitle}</h2>
            <p>{t.qa.run.scenariosHint}</p>
          </div>
        </header>
        <ul className="qa-try-list">
          {run.tries.map((qaTry, index) => (
            <ScenarioRow
              key={qaTry.id}
              position={index + 1}
              projectId={projectId}
              qaTry={qaTry}
            />
          ))}
        </ul>
      </section>
    </section>
  )
}

function ScenarioRow({
  position,
  projectId,
  qaTry,
}: {
  position: number
  projectId: string
  qaTry: QaTry
}) {
  const { t } = useI18n()
  return (
    <li className="qa-try-row">
      <Link
        className="qa-try-link"
        aria-label={t.qa.run.openScenario}
        to={tryLink(projectId, qaTry.id)}
      >
        {t.qa.run.scenarioLabel(position)}{' '}
        <span className="mono" translate="no">#{qaTry.id}</span>
      </Link>
      {/* Status carries a text label, never color alone. */}
      <span className={`qa-status qa-status--${qaTry.status.toLowerCase()}`}>
        {t.qa.statusLabels[qaTry.status]}
      </span>
    </li>
  )
}
