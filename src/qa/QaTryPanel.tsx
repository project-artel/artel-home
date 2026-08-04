import { useCallback, useEffect, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import type { GameInstance } from '../projects/gameTypes'
import { ProjectApiError } from '../projects/projectApi'
import { getRunScenarios, listTestRuns, type TestRun } from '../testRuns/testRunApi'
import { createQaTry, isQaConflict, listQaModels, listQaTries } from './qaApi'
import type { QaModel, QaReasoningSelection, QaTry } from './qaTypes'

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
  const [runs, setRuns] = useState<TestRun[]>([])
  const [tries, setTries] = useState<QaTry[]>([])
  const [models, setModels] = useState<QaModel[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [instanceId, setInstanceId] = useState('')
  const [runId, setRunId] = useState('')
  const [modelId, setModelId] = useState('')
  const [reasoningEnabled, setReasoningEnabled] = useState(false)
  const [reasoningValue, setReasoningValue] = useState(0)
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)
  const navigate = useNavigate()
  const { t } = useI18n()
  const gameSelectId = useId()
  const runSelectId = useId()
  const modelSelectId = useId()
  const reasoningControlId = useId()

  const numericProjectId = Number(projectId)

  useEffect(() => {
    if (!Number.isInteger(numericProjectId)) return undefined

    const controller = new AbortController()

    Promise.all([
      listTestRuns(projectId, controller.signal),
      listQaTries(projectId, controller.signal),
      listQaModels(controller.signal),
    ])
      .then(([loadedRuns, loadedTries, loadedModels]) => {
        setRuns(loadedRuns)
        setTries(loadedTries)
        setModels(loadedModels)
        setModelId((current) => current || loadedModels[0]?.id || '')
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
    if (instanceId === '' || runId === '' || modelId === '') {
      setFailure(t.qa.errors.missingSelection)
      return
    }

    setStarting(true)
    setFailure(null)

    try {
      // TR 단위 실행(런의 모든 시나리오 순차 실행)은 향후 과제. 백엔드가 아직 시나리오 단위라,
      // 지금은 선택한 런의 첫 시나리오로 실행한다.
      const items = await getRunScenarios(projectId, runId)
      const firstScenarioId = [...items].sort((a, b) => a.position - b.position)[0]?.testScenarioId
      if (firstScenarioId === undefined) {
        setFailure(t.qa.errors.emptyRun)
        setStarting(false)
        return
      }
      const qaTry = await createQaTry(
        firstScenarioId,
        instanceId,
        modelId,
        selectedReasoning,
      )
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
  const runnable = ready && instances.length > 0 && runs.length > 0 && models.length > 0
  const selectedModel = models.find((model) => model.id === modelId) ?? null
  const reasoning = selectedModel?.reasoning ?? null
  const selectedReasoning: QaReasoningSelection | null =
    !reasoningEnabled || reasoning === null
      ? null
      : reasoning.kind === 'effort'
        ? { effort: reasoning.efforts[reasoningValue] ?? reasoning.efforts[0] }
        : { maxTokens: reasoningValue }

  function selectModel(nextId: string) {
    const next = models.find((model) => model.id === nextId)
    setModelId(nextId)
    setReasoningEnabled(false)
    setReasoningValue(
      next?.reasoning?.kind === 'effort'
        ? Math.max(next.reasoning.efforts.indexOf('medium'), 0)
        : next?.reasoning?.minTokens ?? 0,
    )
  }

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

          <label className="qa-start-field" htmlFor={runSelectId}>
            <span>{t.qa.panel.runLabel}</span>
            <select
              disabled={runs.length === 0}
              id={runSelectId}
              onChange={(event) => setRunId(event.target.value)}
              value={runId}
            >
              <option value="">
                {runs.length === 0 ? t.qa.panel.noRuns : t.qa.panel.runPlaceholder}
              </option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name}
                </option>
              ))}
            </select>
          </label>

          <label className="qa-start-field" htmlFor={modelSelectId}>
            <span>{t.qa.panel.modelLabel}</span>
            <select
              disabled={models.length === 0}
              id={modelSelectId}
              onChange={(event) => selectModel(event.target.value)}
              value={modelId}
            >
              <option value="">{t.qa.panel.modelPlaceholder}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label} · {model.provider}
                </option>
              ))}
            </select>
          </label>

          {selectedModel !== null && (
            <div className="qa-model-config">
              <div className="qa-model-meta" aria-label={t.qa.panel.modelCapabilities}>
                <span>{selectedModel.multimodal ? t.qa.panel.multimodal : t.qa.panel.textOnly}</span>
                <span>{selectedModel.inputModalities.join(' · ')}</span>
              </div>
              {reasoning === null ? (
                <p className="qa-reasoning-unavailable">{t.qa.panel.reasoningUnavailable}</p>
              ) : (
                <>
                  <label className="qa-reasoning-toggle">
                    <input
                      checked={reasoningEnabled}
                      onChange={(event) => setReasoningEnabled(event.target.checked)}
                      type="checkbox"
                    />
                    {t.qa.panel.reasoningLabel}
                  </label>
                  {reasoningEnabled && (
                    <label className="qa-reasoning-slider" htmlFor={reasoningControlId}>
                      <span>
                        {reasoning.kind === 'effort'
                          ? reasoning.efforts[reasoningValue]
                          : reasoningValue.toLocaleString()}
                      </span>
                      <input
                        aria-label={t.qa.panel.reasoningControlLabel}
                        id={reasoningControlId}
                        max={
                          reasoning.kind === 'effort'
                            ? reasoning.efforts.length - 1
                            : reasoning.maxTokens
                        }
                        min={reasoning.kind === 'effort' ? 0 : reasoning.minTokens}
                        onChange={(event) => setReasoningValue(Number(event.target.value))}
                        step={reasoning.kind === 'effort' ? 1 : reasoning.step}
                        type="range"
                        value={reasoningValue}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
          )}

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
