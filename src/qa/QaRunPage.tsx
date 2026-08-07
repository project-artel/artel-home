import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { cancelQaRun, getQaRun, isDecimalId } from './qaApi'
import { isTerminalQaStatus, type QaRun } from './qaTypes'

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

/**
 * A QA_Run overview: the run's scenarios executing in order, one row per scenario
 * (its own QaTry). Polls until the run is terminal; each row opens the existing
 * per-try detail. This is the TR-unit entry — a single scenario is never started
 * on its own from the UI (재설계, ARTEL-286).
 */
function QaRunPage({ projectId, qaRunId }: { projectId: string; qaRunId: string }) {
  const { t } = useI18n()
  const [run, setRun] = useState<QaRun | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
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
        // Keep polling while the run is still going; stop once it settles.
        if (!isTerminalQaStatus(next.status)) {
          timer = setTimeout(tick, 3000)
        }
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

  if (state === 'loading') {
    return (
      <section className="page"><div className="panel-message"><p>{t.qa.run.loading}</p></div></section>
    )
  }
  if (state === 'missing' || run === null) {
    return <QaRunMissing projectId={projectId} />
  }

  const done = run.tries.filter((entry) => isTerminalQaStatus(entry.status)).length
  const active = !isTerminalQaStatus(run.status)

  return (
    <section className="page qa-run">
      <header className="qa-run-head">
        <Link className="st-back" to={projectLink(projectId)}>{t.qa.run.back}</Link>
        <div className="qa-run-title">
          <h1>{t.qa.run.title}</h1>
          <span className={`qa-run-status qa-run-status--${run.status.toLowerCase()}`}>
            {t.qa.statusLabels[run.status]}
          </span>
        </div>
        <p className="qa-run-sub">{t.qa.run.subtitle}</p>
        <p className="qa-run-progress">{t.qa.run.progress(done, run.tries.length)}</p>
        {active && (
          <button className="button button--secondary button--compact" disabled={cancelling} onClick={() => void onCancel()} type="button">
            {cancelling ? t.qa.run.cancelling : t.qa.run.cancel}
          </button>
        )}
        {cancelError !== null && <p className="qa-run-error">{cancelError}</p>}
      </header>

      <ol className="qa-run-list">
        {run.tries.map((entry, index) => (
          <li key={entry.id} className="qa-run-row">
            <span className="qa-run-no">{index + 1}</span>
            <span className="qa-run-scenario">{t.qa.run.scenario(index + 1)}</span>
            <span className={`qa-run-status qa-run-status--${entry.status.toLowerCase()}`}>
              {t.qa.statusLabels[entry.status]}
            </span>
            <Link
              className="button button--secondary button--compact"
              to={`/projects/${encodeURIComponent(projectId)}/qa-tries/${encodeURIComponent(entry.id)}`}
            >
              {t.qa.run.openTry}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
