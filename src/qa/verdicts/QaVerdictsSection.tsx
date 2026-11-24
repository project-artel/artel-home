import { buildDisplayName } from '../../projects/buildEnvironment'
import { runCaseRatioOf } from '../scenarioOutcome'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { formatElapsedSeconds } from '../../projects/formatters'
import { QaStatusPill } from '../../projects/workspace/QaStatusPill'
import { shortWhen } from '../history/historyModel'
import { getQaRunVerdicts, type QaRunVerdicts } from '../qaVerdictApi'
import { QA_TRY_STATUSES, qaRunPath, type QaTryStatus } from '../qaTypes'
import { CaseEvaluationPanel } from '../evaluation/CaseEvaluationPanel'
import { evaluationCopy } from '../evaluation/evaluationCopy'
import { isActiveStatus } from './verdictModel'

const POLL_MS = 4000
const EVALUATION_PANEL_ID = 'qe-review'

export function QaVerdictsSection() {
  const { projectId = '', qaRunId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t, locale } = useI18n()
  const copy = t.qa.verdicts

  const [data, setData] = useState<QaRunVerdicts | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'error'>('loading')
  const load = useCallback(
    (signal?: AbortSignal) =>
      getQaRunVerdicts(qaRunId, signal)
        .then((result) => {
          setData(result)
          setState(result === null ? 'gone' : 'ready')
        })
        .catch(() => {
          if (!signal?.aborted) setState((current) => (current === 'ready' ? current : 'error'))
        }),
    [qaRunId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const active = data !== null && (isActiveStatus(data.status) || data.tries.some((qaTry) => isActiveStatus(qaTry.status)))
  useEffect(() => {
    if (!active) return undefined
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [active, load])

  const selectedTry = searchParams.get('scenario')
  const scenario = data?.tries.find((qaTry) => qaTry.qaTryId === selectedTry)
    ?? (searchParams.get('review') === '1'
      ? data?.tries.find((qaTry) => qaTry.reportingUnit === 'TEST_CASE' && qaTry.reviewCount > 0)
      : undefined)
    ?? data?.tries.find((qaTry) => qaTry.reportingUnit === 'TEST_CASE')
    ?? data?.tries[0]
    ?? null

  const goScenario = (index: number) => {
    const target = data?.tries[index]
    if (target === undefined) return
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('scenario', target.qaTryId)
        next.delete('step')
        next.delete('attempt')
        return next
      },
      { replace: true },
    )
  }

  const historyPath = `/projects/${encodeURIComponent(projectId)}/qa-history`

  if (state !== 'ready' || data === null) {
    const message = state === 'loading' ? copy.loading : state === 'gone' ? copy.gone : copy.loadFailed
    return (
      <section className="qv" aria-busy={state === 'loading'}>
        <p className={state === 'error' ? 'panel-message' : 'panel-empty'} role={state === 'error' ? 'alert' : undefined}>{message}</p>
      </section>
    )
  }

  const testRunPath = `/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(data.testRunId)}/edit`
  const runReview = data.tries.reduce((sum, qaTry) => sum + qaTry.reviewCount, 0)
  const elapsed = data.startedAt !== null && data.completedAt !== null
    ? Math.round((Date.parse(data.completedAt) - Date.parse(data.startedAt)) / 1000)
    : null
  const evaluation = scenario && <CaseEvaluationPanel id={EVALUATION_PANEL_ID} key={scenario.qaTryId} projectId={projectId} qaTryId={scenario.qaTryId} scenario={scenario} />

  return (
    <section className="qv" aria-labelledby="qv-scenario-title">
      <header className="qv-top">
        <nav aria-label={copy.navigator} className="qv-crumb">
          <Link to={historyPath}>{t.projects.workspace.nav.qaHistory}</Link>
          {data.gameBuildVersion !== null && <><span aria-hidden="true">›</span><span className="mono">{buildDisplayName({ version: data.gameBuildVersion, isEditor: data.gameBuildIsEditor })}</span></>}
          <span aria-hidden="true">›</span><Link className="qv-test-run-link" to={testRunPath}>{data.testRunName}</Link>
          {data.startedAt !== null && <><span aria-hidden="true">›</span><b>{copy.runAt(shortWhen(data.startedAt))}</b></>}
        </nav>
        <div className="qv-top-actions">
          {scenario?.reportingUnit === 'TEST_CASE' && (
            // 평가가 이 화면의 주된 행동이라 유일한 primary 다. 패널은 아래에 있어서 누르면 거기로 내려가 시도 선택에 focus 를 준다.
            <button
              className="button button--primary button--compact"
              onClick={() => {
                const panel = document.getElementById(EVALUATION_PANEL_ID)
                panel?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                panel?.querySelector<HTMLElement>('select, button, textarea')?.focus({ preventScroll: true })
              }}
              type="button"
            >
              {evaluationCopy[locale === 'ko' ? 'ko' : 'en'].title}
            </button>
          )}
          <Link className="button button--secondary button--compact" to={qaRunPath(projectId, qaRunId, scenario?.qaTryId)}>{copy.timeline}</Link>
        </div>
      </header>

      <div className="qv-ctx">
        {data.gameBuildVersion !== null && <span className="qv-chip">{copy.build} <b className="mono">{buildDisplayName({ version: data.gameBuildVersion, isEditor: data.gameBuildIsEditor })}</b></span>}
        <span className="qv-chip">{copy.testRun} <Link className="qv-test-run-link" to={testRunPath}><b>{data.testRunName}</b></Link></span>
        {scenario?.model !== null && scenario?.model !== undefined && (
          <span className="qv-chip">{copy.model} <b className="mono">{scenario.model.split('/').at(-1)}</b></span>
        )}
        {isStatus(data.status) && (
          <QaStatusPill
            ratio={data.status === 'COMPLETED' || data.status === 'FAILED' ? runCaseRatioOf(data.tries) : null}
            status={data.status}
          />
        )}
        {elapsed !== null && <span className="qv-muted mono">{formatElapsedSeconds(elapsed)}</span>}
        {runReview > 0 && (
          <span className="qv-review-pill">
            <span aria-hidden="true" className="qv-dot" />
            {copy.review.count(runReview)}
          </span>
        )}
      </div>

      {scenario !== null ? (
        <ReferenceProcedure scenario={scenario} scenarios={data.tries} onScenario={goScenario}>{evaluation}</ReferenceProcedure>
      ) : <h1 className="qv-scn-title" id="qv-scenario-title">{copy.gone}</h1>}
    </section>
  )
}

function ReferenceProcedure({ scenario, scenarios, onScenario, children }: { scenario: QaRunVerdicts['tries'][number]; scenarios: QaRunVerdicts['tries']; onScenario: (index: number) => void; children?: ReactNode }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  return <section className="qv-scn">
    <h1 id="qv-scenario-title">{scenario.scenarioTitle}</h1>
    {scenarios.length > 1 && <select className="qe-select" aria-label={copy.qa} value={scenario.qaTryId} onChange={event => onScenario(scenarios.findIndex(item => item.qaTryId === event.target.value))}>
      {scenarios.map(item => <option key={item.qaTryId} value={item.qaTryId}>{item.scenarioTitle}</option>)}
    </select>}
    {children}
    {scenario.reportingUnit === 'TEST_CASE' && scenario.steps.length > 0 && (
      <details className="qe-refs"><summary>{copy.references}</summary><ol>{scenario.steps.map(step => <li key={step.step}>{step.title}</li>)}</ol></details>
    )}
  </section>
}

function isStatus(value: string): value is QaTryStatus {
  return (QA_TRY_STATUSES as readonly string[]).includes(value)
}
