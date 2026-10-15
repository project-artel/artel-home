import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import type { GameInstance } from '../projects/gameTypes'
import { ProjectApiError } from '../projects/projectApi'
import { sectionHref } from '../projects/workspace/sections'
import type { ExtrasStatus } from '../projects/workspace/workspaceContext'
import { versionMismatch } from '../testRuns/runLibrary'
import type { TestRun } from '../testRuns/testRunApi'
import { createQaRun, qaStartConflict } from './qaApi'
import { byAscendingEffort } from './reasoningEfforts'
import { offeredQaModels } from './qaModelGroups'
import { QaModelPicker } from './QaModelPicker'
import {
  qaModelOptionKey,
  qaRunPath,
  type QaModel,
  type QaReasoningSelection,
  type QaTry,
} from './qaTypes'
import { TakeOverQaRunDialog } from './TakeOverQaRunDialog'

/** How many recent runs the panel shows before deferring to the history section. */
const RECENT_LIMIT = 5

/**
 * Starting a QA run, and the handful most recently started.
 *
 * A run is a scenario *and* a game, so both are picked here rather than one
 * being implied by the screen the user happens to be on. The list is what makes
 * a finished run reachable a second time — its URL is otherwise the only way
 * back — but only the newest few belong next to the form: the full record is
 * the history section, which this panel links to.
 */
export function QaTryPanel({
  instances,
  models,
  onReload,
  projectId,
  runs,
  status,
  tries,
}: {
  instances: GameInstance[]
  models: QaModel[]
  onReload: () => void
  projectId: string
  runs: TestRun[]
  status: ExtrasStatus
  tries: QaTry[]
}) {
  const [instanceId, setInstanceId] = useState('')
  const [runId, setRunId] = useState('')
  const [selectedModelKey, setSelectedModelKey] = useState('')
  const [reasoningEnabled, setReasoningEnabled] = useState(false)
  const [reasoningValue, setReasoningValue] = useState(0)
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // Open only after the server has refused a plain start with `qa_run_active`.
  const [takeoverOpen, setTakeoverOpen] = useState(false)
  const navigate = useNavigate()
  const { t } = useI18n()
  const gameSelectId = useId()
  const runSelectId = useId()
  const modelSelectId = useId()
  const reasoningControlId = useId()

  // The first model that can run is the default, but the list arrives after the
  // first render. Deriving the effective key keeps that out of an effect, which
  // would otherwise paint one frame with an empty picker. A model on a provider
  // with no key is listed but never the default.
  const offered = offeredQaModels(models)
  const defaultModel = offered.find((model) => model.keyRegistered)
  const modelKey = selectedModelKey || (defaultModel ? qaModelOptionKey(defaultModel) : '')
  const selectedModel = offered.find((model) => qaModelOptionKey(model) === modelKey) ?? null
  // 켜진 게임이 TR 의 빌드 버전과 다른 빌드면 알린다(ARTEL-1049). 막지는 않는다 — 판정은 켜진 게임의 빌드에 적힌다.
  const mismatch = versionMismatch(
    runs.find((one) => one.id === runId),
    instances.find((one) => one.id === instanceId),
  )

  /**
   * @param force end whatever QA still holds the game and take its place. Only
   *   ever true on the second attempt, after the operator answered the dialog.
   */
  async function run(force = false) {
    if (instanceId === '' || runId === '' || selectedModel === null) {
      setFailure(t.qa.errors.missingSelection)
      return
    }

    setStarting(true)
    setFailure(null)

    try {
      // TR 단위 실행: 런의 모든 시나리오를 순차 실행한다(사이 게임 리셋). 시나리오 없는 런은
      // 백엔드가 409로 거부한다.
      const run = await createQaRun(
        runId,
        instanceId,
        selectedModel.id,
        selectedModel.keySource,
        selectedReasoning,
        force,
      )
      setTakeoverOpen(false)
      navigate(
        `/projects/${encodeURIComponent(projectId)}/qa-runs/${encodeURIComponent(run.id)}`,
      )
    } catch (error: unknown) {
      const conflict = qaStartConflict(error)
      // 진행 중인 QA는 막다른 오류가 아니라 선택지다 — 물어보고 뺏을 수 있다. 스테일 런이
      // 게임을 붙잡고 있는 경우가 흔한데(배포로 Orchestration이 재시작하면 소켓만 죽고 런은
      // RUNNING으로 남는다), 그때마다 다른 화면으로 보내 종료시키고 돌아오게 하는 것은 같은
      // 결정을 두 번 시키는 것이다. 이미 뺏겠다고 답한 요청(force)이 또 이 코드로 돌아왔다면
      // 뺏을 대상이 계속 바뀌고 있다는 뜻이라, 다시 묻지 않고 오류로 보여 준다.
      if (conflict === 'qa_run_active' && !force) {
        setTakeoverOpen(true)
        setStarting(false)
        return
      }
      setFailure(
        conflict === 'sdk_disconnected'
          ? t.qa.errors.sdkDisconnected
          : conflict === 'test_run_empty'
            ? t.qa.errors.emptyRun
            : conflict === 'qa_run_active'
              ? t.qa.errors.alreadyRunning
              : error instanceof ProjectApiError
                ? error.message
                : t.qa.errors.startFailed,
      )
      setStarting(false)
    }
  }

  const ready = status === 'ready'
  const runnable = ready && instances.length > 0 && runs.length > 0 && offered.length > 0
  const reasoning = selectedModel?.reasoning ?? null
  const sliderEfforts =
    reasoning?.kind === 'effort' ? byAscendingEffort(reasoning.efforts) : []
  const selectedReasoning: QaReasoningSelection | null =
    !reasoningEnabled || reasoning === null
      ? null
      : reasoning.kind === 'effort'
        ? { effort: sliderEfforts[reasoningValue] ?? sliderEfforts[0] }
        : { maxTokens: reasoningValue }

  function selectModel(nextKey: string) {
    const next = offered.find((model) => qaModelOptionKey(model) === nextKey)
    setSelectedModelKey(nextKey)
    setReasoningEnabled(false)
    setReasoningValue(
      next?.reasoning?.kind === 'effort'
        ? Math.max(byAscendingEffort(next.reasoning.efforts).indexOf('medium'), 0)
        : next?.reasoning?.minTokens ?? 0,
    )
  }

  return (
    <section className="panel qa-panel" aria-labelledby="qa-runs-title">
      <header className="panel-header panel-header--split">
        <div>
          <h2 id="qa-runs-title">
            {t.qa.panel.title}
            <InfoHint>{t.qa.panel.hint}</InfoHint>
          </h2>
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

          {mismatch !== null && (
            <p className="qa-version-mismatch" role="status">
              <span aria-hidden="true">!</span>
              {/* 무엇이 다른지와, 그래도 돌리면 어떻게 되는지를 줄을 나눠 말한다. */}
              <span className="qa-version-mismatch-text">
                <span>{t.qa.panel.versionMismatch.basis(mismatch.run, mismatch.game)}</span>
                <span>{t.qa.panel.versionMismatch.record(mismatch.game)}</span>
              </span>
            </p>
          )}

          <div className="qa-start-field qa-start-field--model">
            <label htmlFor={modelSelectId}>{t.qa.panel.modelLabel}</label>
            <QaModelPicker
              disabled={offered.length === 0}
              id={modelSelectId}
              models={offered}
              onChange={selectModel}
              value={modelKey}
            />
          </div>

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
                          ? sliderEfforts[reasoningValue]
                          : reasoningValue.toLocaleString()}
                      </span>
                      <input
                        aria-label={t.qa.panel.reasoningControlLabel}
                        id={reasoningControlId}
                        max={
                          reasoning.kind === 'effort'
                            ? sliderEfforts.length - 1
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
            onClick={() => void run()}
            type="button"
          >
            {starting ? t.qa.panel.starting : t.qa.panel.runButton}
          </button>
        </div>
      )}

      {takeoverOpen && (
        <TakeOverQaRunDialog
          failure={failure}
          onClose={() => setTakeoverOpen(false)}
          onConfirm={() => void run(true)}
          pending={starting}
        />
      )}

      {/* 이어받기 다이얼로그가 떠 있으면 실패는 거기서 보여 준다 — 같은 문구를 두 곳에 내지 않는다. */}
      {failure !== null && !takeoverOpen && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}

      {status === 'loading' && <p className="panel-empty">{t.qa.panel.loading}</p>}

      {status === 'failed' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {t.qa.panel.loadFailed}
          <button
            className="button button--secondary button--compact"
            onClick={onReload}
            type="button"
          >
            {t.qa.panel.retry}
          </button>
        </div>
      )}

      {ready && (
        <div className="qa-recent-header">
          <h3 className="panel-subtitle">{t.qa.panel.recentTitle}</h3>
          {tries.length > RECENT_LIMIT && (
            <Link className="section-more" to={sectionHref(projectId, 'qa-history')}>
              {t.projects.workspace.seeAll}
            </Link>
          )}
        </div>
      )}

      {ready && tries.length === 0 && <p className="panel-empty">{t.qa.panel.empty}</p>}

      {ready && tries.length > 0 && (
        <ul className="qa-try-list">
          {tries.slice(0, RECENT_LIMIT).map((qaTry) => (
            <li className="qa-try-row" key={qaTry.id}>
              {qaTry.qaRunId === null ? (
                <span className="qa-try-link qa-try-link--muted">
                  {t.qa.panel.openRun} <span className="mono" translate="no">#{qaTry.id}</span>
                </span>
              ) : (
                <Link className="qa-try-link" to={qaRunPath(projectId, qaTry.qaRunId, qaTry.id)}>
                  {t.qa.panel.openRun} <span className="mono" translate="no">#{qaTry.id}</span>
                </Link>
              )}
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
