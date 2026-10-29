import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../i18n/useI18n'
import { formatElapsedSeconds } from '../../projects/formatters'
import { QaStatusPill } from '../../projects/workspace/QaStatusPill'
import { shortWhen } from '../history/historyModel'
import { getQaRunVerdicts, type QaRunVerdicts } from '../qaVerdictApi'
import { QA_TRY_STATUSES, qaRunPath, type QaTryStatus } from '../qaTypes'
import { StepDetail } from './StepDetail'
import { CaseEvaluationPanel } from '../evaluation/CaseEvaluationPanel'
import { evaluationCopy } from '../evaluation/evaluationCopy'
import { defaultStep, isActiveStatus, plainText, stepRows, tallyRows, type StepRow } from './verdictModel'

/** 스텝 내비게이터 한 칸의 폭과 간격. 보이는 범위(`6–21 / 21`)를 스크롤 위치에서 셀 때 쓴다. */
const CELL_PX = 44
const CELL_GAP_PX = 4
/** 진행 중인 실행은 이 간격으로 다시 읽는다. 판정이 오는 대로 줄과 근거가 바뀐다. */
const POLL_MS = 4000
/** 머리의 `TC 판정 검토` 버튼이 내려가는 자리. */
const EVALUATION_PANEL_ID = 'qe-review'

type ListFilter = 'all' | 'checks' | 'failed' | 'review'

/**
 * 시나리오 하나의 스텝별 판정 근거(ARTEL-1135). QA 히스토리 안 페이지다(`qa-history/:qaRunId`).
 *
 * 위는 출처(빌드 · TR · 모델 · 결과)와 시나리오, 그 아래 스텝 내비게이터 — 스텝마다 한 칸, 넘치면 서비스 스크롤바로
 * 옆으로 넘긴다. 왼쪽은 스텝 목록(기본 검증만), 오른쪽은 고른 스텝의 근거다. `?scenario=&step=` 이 고른 것이다.
 */
export function QaVerdictsSection() {
  const { projectId = '', qaRunId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t, locale } = useI18n()
  const copy = t.qa.verdicts

  const [data, setData] = useState<QaRunVerdicts | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'error'>('loading')
  // 끝 알림의 [검토하러 가기] 는 `?review=1` 로 온다. 그때는 추가 검토만 보인다.
  const [filter, setFilter] = useState<ListFilter>(() => (searchParams.get('review') === '1' ? 'review' : 'checks'))

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

  // 검토로 왔고 시나리오를 고르지 않았으면, 남은 추가 검토가 있는 첫 시나리오를 연다.
  const reviewEntry = searchParams.get('review') === '1' && searchParams.get('scenario') === null
  const scenarioIndex = Math.max(
    0,
    reviewEntry
      ? (data?.tries.findIndex((qaTry) => qaTry.reviewCount > 0) ?? 0)
      : (data?.tries.findIndex((qaTry) => qaTry.qaTryId === searchParams.get('scenario')) ?? 0),
  )
  const scenario = data?.tries[scenarioIndex] ?? null
  const rows = useMemo(() => (scenario === null ? [] : stepRows(scenario)), [scenario])
  const tally = useMemo(() => tallyRows(rows), [rows])
  // 추가 검토만 보는 중이면 첫 검토 스텝을 연다.
  const pickedStep = Number(searchParams.get('step')) || (filter === 'review' ? rows.find((row) => row.review)?.step : undefined) || defaultStep(rows)
  const selected = rows.find((row) => row.step === pickedStep) ?? null

  const choose = (changes: Record<string, string>) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) next.set(key, value)
        return next
      },
      { replace: true },
    )

  // 같은 실행의 앞뒤 시나리오로. 고른 스텝은 비워서 그 시나리오의 첫 실패(없으면 첫 판정)가 열린다.
  const goScenario = (index: number) => {
    const target = data?.tries[index]
    if (target === undefined) return
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('scenario', target.qaTryId)
        next.delete('step')
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
  // 이 시나리오에 추가 검토가 없으면 그 거르기는 없다. 다른 시나리오에서 골랐어도 검증만으로 돌아간다.
  const listFilter: ListFilter = filter === 'review' && tally.review === 0 ? 'checks' : filter
  const shownRows = rows.filter((row) =>
    listFilter === 'all' ? true : listFilter === 'checks' ? row.verifying : listFilter === 'review' ? row.review : row.state === 'failed',
  )
  const runReview = data.tries.reduce((sum, qaTry) => sum + qaTry.reviewCount, 0)
  const elapsed = data.startedAt !== null && data.completedAt !== null
    ? Math.round((Date.parse(data.completedAt) - Date.parse(data.startedAt)) / 1000)
    : null
  const evaluation = scenario && <CaseEvaluationPanel id={EVALUATION_PANEL_ID} key={scenario.qaTryId} projectId={projectId} qaTryId={scenario.qaTryId} />

  return (
    <section className="qv" aria-labelledby="qv-scenario-title">
      <header className="qv-top">
        <nav aria-label={copy.navigator} className="qv-crumb">
          <Link to={historyPath}>{t.projects.workspace.nav.qaHistory}</Link>
          {data.gameBuildVersion !== null && <><span aria-hidden="true">›</span><span className="mono">{data.gameBuildVersion}</span></>}
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
        {data.gameBuildVersion !== null && <span className="qv-chip">{copy.build} <b className="mono">{data.gameBuildVersion}</b></span>}
        <span className="qv-chip">{copy.testRun} <Link className="qv-test-run-link" to={testRunPath}><b>{data.testRunName}</b></Link></span>
        {scenario?.model !== null && scenario?.model !== undefined && (
          <span className="qv-chip">{copy.model} <b className="mono">{scenario.model.split('/').at(-1)}</b></span>
        )}
        {isStatus(data.status) && <QaStatusPill status={data.status} />}
        {elapsed !== null && <span className="qv-muted mono">{formatElapsedSeconds(elapsed)}</span>}
        {runReview > 0 && (
          <span className="qv-review-pill">
            <span aria-hidden="true" className="qv-dot" />
            {copy.review.count(runReview)}
          </span>
        )}
      </div>

      {scenario?.reportingUnit === 'TEST_CASE' ? <ReferenceProcedure scenario={scenario} scenarios={data.tries} onScenario={goScenario}>{evaluation}</ReferenceProcedure> : scenario === null || rows.length === 0 ? (
        <>
          {scenario && <h1 className="qv-scn-title" id="qv-scenario-title">{scenario.scenarioTitle}</h1>}
          {evaluation}
          <p className="panel-empty">{copy.noSteps}</p>
        </>
      ) : (
        <>
          <section className="qv-scn">
            <div className="qv-scn-head">
              <span className="qv-scn-switch">
                <button
                  aria-label={copy.previousScenario}
                  className="qv-scn-step"
                  disabled={scenarioIndex === 0}
                  onClick={() => goScenario(scenarioIndex - 1)}
                  type="button"
                >
                  ‹
                </button>
                <span className="qv-scn-tag mono">{copy.scenarioOf(scenarioIndex + 1, data.tries.length)}</span>
                <button
                  aria-label={copy.nextScenario}
                  className="qv-scn-step"
                  disabled={scenarioIndex >= data.tries.length - 1}
                  onClick={() => goScenario(scenarioIndex + 1)}
                  type="button"
                >
                  ›
                </button>
              </span>
              <h1 className="qv-scn-title" id="qv-scenario-title">{scenario.scenarioTitle}</h1>
              <span className="qv-muted mono">
                {copy.summary(tally.checks, tally.passed, tally.failed, tally.actions, tally.issues)}
              </span>
              {tally.review > 0 && <span className="qv-review-count">{copy.review.count(tally.review)}</span>}
            </div>
            {evaluation}
            <StepNavigator onPick={(step) => choose({ scenario: scenario.qaTryId, step: String(step) })} rows={rows} selected={pickedStep} />
            <div className="qv-legend">
              <span><i className="qv-sw qv-sw--passed" />{copy.legend.passed}</span>
              <span><i className="qv-sw qv-sw--failed" />{copy.legend.failed}</span>
              <span><i className="qv-sw qv-sw--action" />{copy.legend.action}</span>
              <span><i className="qv-sw qv-sw--issue" />{copy.legend.issue}</span>
              <span><i className="qv-sw qv-sw--review" />{copy.legend.review}</span>
            </div>
          </section>

          <div className="qv-body">
            <StepList filter={listFilter} onFilter={setFilter} onPick={(step) => choose({ scenario: scenario.qaTryId, step: String(step) })} rows={rows} selected={pickedStep} shown={shownRows} />
            {selected !== null && <StepDetail onDecided={() => void load()} projectId={projectId} qaRunId={qaRunId} row={selected} rows={rows} />}
          </div>
        </>
      )}
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
    <details className="qe-refs"><summary>{copy.references}</summary><ol>{scenario.steps.map(step => <li key={step.step}>{step.title}</li>)}</ol></details>
  </section>
}

function isStatus(value: string): value is QaTryStatus {
  return (QA_TRY_STATUSES as readonly string[]).includes(value)
}

/**
 * 스텝마다 한 칸. 칸 폭이 정해져 있어 스텝이 많으면 넘치고, 그때 서비스 스크롤바(`EdgeScrollbar` 가로)로 넘긴다.
 * 고른 스텝은 보이는 자리로 끌어온다. 오른쪽 아래 수는 지금 보이는 범위다.
 */
function StepNavigator({ onPick, rows, selected }: { onPick: (step: number) => void; rows: StepRow[]; selected: number | null }) {
  const { t } = useI18n()
  const copy = t.qa.verdicts
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const [range, setRange] = useState({ from: 1, to: rows.length })

  useEffect(() => {
    if (scroller === null) return undefined
    const measure = () => {
      const pitch = CELL_PX + CELL_GAP_PX
      const from = Math.min(rows.length, Math.floor(scroller.scrollLeft / pitch) + 1)
      const to = Math.min(rows.length, Math.floor((scroller.scrollLeft + scroller.clientWidth + CELL_GAP_PX) / pitch))
      setRange((current) => (current.from === from && current.to === to ? current : { from, to }))
    }
    measure()
    scroller.addEventListener('scroll', measure, { passive: true })
    const resize = new ResizeObserver(measure)
    resize.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', measure)
      resize.disconnect()
    }
  }, [scroller, rows.length])

  useEffect(() => {
    if (scroller === null || selected === null) return
    const cell = scroller.querySelector<HTMLElement>(`[data-step="${selected}"]`)
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [scroller, selected])

  return (
    <div className="qv-nav">
      <div className="qv-nav-scroll" ref={setScroller}>
        <div className="qv-strip" role="list" aria-label={copy.navigator}>
          {rows.map((row) => (
            <button
              aria-current={row.step === selected ? 'step' : undefined}
              aria-label={`${copy.step(row.step)} · ${copy.states[row.state]}${row.review ? ` · ${copy.review.label}` : ''} · ${row.title}`}
              className={`qv-cell qv-cell--${row.verifying || row.state === 'failed' ? row.state : `action qv-cell--${row.state}`}${row.step === selected ? ' is-selected' : ''}`}
              data-step={row.step}
              key={row.step}
              onClick={() => onPick(row.step)}
              role="listitem"
              title={`${row.step}. ${plainText(row.title)}`}
              type="button"
            >
              {row.step}
              {row.issues.length > 0 && <span aria-hidden="true" className="qv-cell-issue" />}
              {row.review && <span aria-hidden="true" className="qv-cell-review" />}
            </button>
          ))}
        </div>
      </div>
      <EdgeScrollbar label={copy.navigator} scroller={scroller} side="bottom" />
      <span className="qv-nav-range mono">{copy.range(range.from, range.to, rows.length)}</span>
    </div>
  )
}

function StepList({
  filter,
  onFilter,
  onPick,
  rows,
  selected,
  shown,
}: {
  filter: ListFilter
  onFilter: (filter: ListFilter) => void
  onPick: (step: number) => void
  rows: StepRow[]
  selected: number | null
  shown: StepRow[]
}) {
  const { t } = useI18n()
  const copy = t.qa.verdicts
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const counts = {
    all: rows.length,
    checks: rows.filter((row) => row.verifying).length,
    failed: rows.filter((row) => row.state === 'failed').length,
    review: rows.filter((row) => row.review).length,
  }
  // 추가 검토가 없으면 그 거르기는 숨긴다.
  const keys = (['all', 'checks', 'failed', 'review'] as const).filter((key) => key !== 'review' || counts.review > 0)

  return (
    <div className="qv-list">
      <div className="qv-list-head" role="group" aria-label={copy.navigator}>
        {keys.map((key) => (
          <button
            aria-pressed={filter === key}
            className={(filter === key ? 'fchip on' : 'fchip') + (key === 'review' ? ' qv-fchip-review' : '')}
            key={key}
            onClick={() => onFilter(key)}
            type="button"
          >
            {copy.filters[key](counts[key])}
          </button>
        ))}
      </div>
      <div className="qv-list-scroll" ref={setScroller}>
        <ol className="qv-rows">
          {shown.map((row) => (
            <li key={row.step}>
              <button
                aria-current={row.step === selected ? 'step' : undefined}
                className={`qv-row qv-row--${row.state}${row.verifying ? '' : ' qv-row--action'}${row.step === selected ? ' is-selected' : ''}`}
                onClick={() => onPick(row.step)}
                type="button"
              >
                <span aria-hidden="true" className="qv-row-bar" />
                <span className="qv-row-no mono">{row.step}</span>
                <span className="qv-row-body">
                  <span className="qv-row-title">{plainText(row.title)}</span>
                  {row.verifying && (
                    <span className="qv-row-meta">
                      <span className="qv-row-state">{copy.states[row.state]}</span>
                      {row.issues.length > 0 && <span className="qv-tag qv-tag--issue">{copy.issueTag}</span>}
                      {row.review && <span className="qv-review-tag">{copy.review.label}</span>}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <EdgeScrollbar label={copy.navigator} scroller={scroller} side="right" />
    </div>
  )
}
