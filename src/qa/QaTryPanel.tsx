import { useCallback, useEffect, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import type { GameInstance } from '../projects/gameTypes'
import { ProjectApiError } from '../projects/projectApi'
import { listTestScenarios } from '../testScenarios/scenarioApi'
import type { TestScenarioSummary } from '../testScenarios/scenarioTypes'
import { createQaTry, isQaConflict, listQaTries } from './qaApi'
import type { QaTry } from './qaTypes'

type LoadState = 'loading' | 'ready' | 'failed'

/**
 * Both preconditions answer 409 and share one error code, so the server's
 * `reason` is the only thing that separates them. Matched on the one word that
 * distinguishes them rather than the whole sentence, which is prose and moves.
 */
const SDK_DISCONNECTED = /sdk/i

/**
 * Starting a QA run, and the list of runs already started.
 *
 * A run is a scenario *and* a game, so both are picked here rather than one
 * being implied by the screen the user happens to be on. The list is what makes
 * a finished run reachable a second time — its URL is otherwise the only way
 * back.
 */
export function QaTryPanel({
  instances,
  projectId,
}: {
  instances: GameInstance[]
  projectId: string
}) {
  const [scenarios, setScenarios] = useState<TestScenarioSummary[]>([])
  const [tries, setTries] = useState<QaTry[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [instanceId, setInstanceId] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)
  const navigate = useNavigate()
  const { t } = useI18n()
  const gameSelectId = useId()
  const scenarioSelectId = useId()

  const numericProjectId = Number(projectId)

  useEffect(() => {
    if (!Number.isInteger(numericProjectId)) return undefined

    const controller = new AbortController()

    Promise.all([
      listTestScenarios(numericProjectId, controller.signal),
      listQaTries(projectId, controller.signal),
    ])
      .then(([loadedScenarios, loadedTries]) => {
        setScenarios(loadedScenarios)
        setTries(loadedTries)
        setState('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setState('failed')
      })

    return () => controller.abort()
  }, [numericProjectId, projectId, reloadCount])

  const reload = useCallback(() => {
    setState('loading')
    setReloadCount((count) => count + 1)
  }, [])

  async function run() {
    if (instanceId === '' || scenarioId === '') {
      setFailure(t.qa.errors.missingSelection)
      return
    }

    setStarting(true)
    setFailure(null)

    try {
      const qaTry = await createQaTry(scenarioId, instanceId)
      navigate(
        `/projects/${encodeURIComponent(projectId)}/qa-tries/${encodeURIComponent(qaTry.id)}`,
      )
    } catch (error: unknown) {
      if (isQaConflict(error)) {
        setFailure(
          SDK_DISCONNECTED.test(error.message)
            ? t.qa.errors.sdkDisconnected
            : t.qa.errors.alreadyRunning,
        )
      } else {
        setFailure(error instanceof ProjectApiError ? error.message : t.qa.errors.startFailed)
      }
      setStarting(false)
    }
  }

  const ready = state === 'ready'
  const runnable = ready && instances.length > 0 && scenarios.length > 0

  return (
    <section className="panel qa-panel" aria-labelledby="qa-runs-title">
      <header className="panel-header panel-header--split">
        <div>
          <h2 id="qa-runs-title">{t.qa.panel.title}</h2>
          <p className="scenario-hint">{t.qa.panel.hint}</p>
        </div>
      </header>

      {ready && (
        <div className="qa-start-controls">
          <label className="qa-start-field" htmlFor={gameSelectId}>
            <span>{t.qa.panel.gameLabel}</span>
            <select
              disabled={instances.length === 0}
              id={gameSelectId}
              onChange={(event) => setInstanceId(event.target.value)}
              value={instanceId}
            >
              <option value="">
                {instances.length === 0 ? t.qa.panel.noGames : t.qa.panel.gamePlaceholder}
              </option>
              {instances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.name}
                </option>
              ))}
            </select>
          </label>

          <label className="qa-start-field" htmlFor={scenarioSelectId}>
            <span>{t.qa.panel.scenarioLabel}</span>
            <select
              disabled={scenarios.length === 0}
              id={scenarioSelectId}
              onChange={(event) => setScenarioId(event.target.value)}
              value={scenarioId}
            >
              <option value="">
                {scenarios.length === 0 ? t.qa.panel.noScenarios : t.qa.panel.scenarioPlaceholder}
              </option>
              {scenarios.map((scenario) => (
                <option key={scenario.testScenarioId} value={String(scenario.testScenarioId)}>
                  {scenario.title.length > 0 ? scenario.title : t.qa.panel.untitledScenario}
                </option>
              ))}
            </select>
          </label>

          <button
            className="button button--primary"
            disabled={!runnable || starting}
            onClick={run}
            type="button"
          >
            {starting ? t.qa.panel.starting : t.qa.panel.runButton}
          </button>
        </div>
      )}

      {failure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}

      {state === 'loading' && <p className="panel-empty">{t.qa.panel.loading}</p>}

      {state === 'failed' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {t.qa.panel.loadFailed}
          <button
            className="button button--secondary button--compact"
            onClick={reload}
            type="button"
          >
            {t.qa.panel.retry}
          </button>
        </div>
      )}

      {ready && tries.length === 0 && <p className="panel-empty">{t.qa.panel.empty}</p>}

      {ready && tries.length > 0 && (
        <ul className="qa-try-list">
          {tries.map((qaTry) => (
            <li className="qa-try-row" key={qaTry.id}>
              <Link
                className="qa-try-link"
                to={`/projects/${encodeURIComponent(projectId)}/qa-tries/${encodeURIComponent(qaTry.id)}`}
              >
                {t.qa.panel.openRun} <span className="mono" translate="no">#{qaTry.id}</span>
              </Link>
              {/* Status carries a text label, never color alone. */}
              <span className={`qa-status qa-status--${qaTry.status.toLowerCase()}`}>
                {t.qa.statusLabels[qaTry.status]}
              </span>
              <span className="qa-try-meta">
                {qaTry.startedAt === null
                  ? ''
                  : t.qa.panel.startedAt(formatDate(qaTry.startedAt))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
