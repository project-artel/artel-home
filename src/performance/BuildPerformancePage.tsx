import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { useActionBinding, useFieldBinding } from '../projectAgent/bindings'
import { listedOptions, readOnlyListWrite } from '../projectAgent/specs/listedOptions'
import { PERFORMANCE_LISTED_FIELD, PERFORMANCE_OPEN_RUN_REPORT_ACTION } from '../projectAgent/specs/performance'
import { resolveExactEntry, runLookups } from '../projectAgent/specs/lookup'
import { formatDateTime } from '../projects/formatters'
import { sortByStartedAt, splitTrustedSegments } from './chartModel'
import { getBuildPerformance } from './performanceApi'
import {
  budgetRatio,
  isHighDischarging,
  isLowConfidence,
  isLowCoverage,
  type BuildPerformance,
  type BuildPerformanceRun,
} from './performanceTypes'
import {
  axisTicks,
  difference,
  latestPair,
  lowerIsBetter,
  niceCeil,
  TREND_METRICS,
  trendValue,
  type TrendMetric,
} from './trendModel'
import { useElementSize } from './useElementWidth'
import './performance.css'

/** 런 없는 빌드에서 옮겨 갈 다른 빌드 하나(ARTEL-1207). */
export type OtherBuild = { id: string; name: string; runCount: number; latest: number }

/**
 * How one build's runs moved over time.
 *
 * Compared by hitches per minute, because runs differ in length and a total
 * would make the longest run look like the worst one. Runs the contract marks
 * as low confidence keep their point and their row but are cut out of the line
 * — a discharging laptop is a throttled sample, and joining it to the others
 * would draw a regression that never happened.
 */
export function BuildPerformanceRoute() {
  const { projectId = '', buildId = '' } = useParams()
  return (
    <section className="page pf-page">
      <BuildPerformanceReport buildId={buildId} projectId={projectId} />
    </section>
  )
}

export function BuildPerformanceReport({
  buildId,
  projectId,
  buildLabel,
  others,
  onPickBuild,
  showHeader = true,
}: {
  buildId: string
  projectId: string
  /** 사람이 읽는 빌드 이름. 없으면 id 로 쓴다. */
  buildLabel?: string
  /** 런이 없을 때 보일 다른 빌드. 프로젝트 화면만 넘긴다. */
  others?: OtherBuild[]
  onPickBuild?: (buildId: string) => void
  showHeader?: boolean
}) {
  const { t } = useI18n()
  const copy = t.performance.build

  const [data, setData] = useState<BuildPerformance | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const requestKey = `${projectId}:${buildId}`
    const timeout = window.setTimeout(() => {
      setFailedFor(requestKey)
      controller.abort()
    }, 10_000)

    getBuildPerformance(projectId, buildId, controller.signal)
      .then((response) => {
        window.clearTimeout(timeout)
        setFailedFor(null)
        setData(response)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        window.clearTimeout(timeout)
        setFailedFor(requestKey)
      })

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [buildId, projectId])

  const runs = useMemo(() => sortByStartedAt(data?.runs ?? []), [data])

  // agent 가 run 의 상세 보고서를 여는 길. 표의 `detailLink` 와 같은 주소로 이동한다.
  const navigate = useNavigate()
  const reportRef = useRef<HTMLDivElement>(null)
  useFieldBinding(PERFORMANCE_LISTED_FIELD, {
    target: () => reportRef.current,
    read: () => runs.length,
    options: () =>
      listedOptions(runs, (run) => ({
        value: String(run.runId),
        label: `Run ${run.runId} · ${run.startedAt} · ${run.hitchesPerMinute} hitches/min`,
      })),
    write: readOnlyListWrite(PERFORMANCE_LISTED_FIELD.name, 'use performance.openRunReport.'),
  })
  useActionBinding(PERFORMANCE_OPEN_RUN_REPORT_ACTION, {
    target: () => reportRef.current?.querySelector<HTMLElement>('.pf-runs a') ?? reportRef.current,
    blocked: () => {
      if (data === null) return copy.loading
      return runs.length === 0 ? copy.emptyTitle : null
    },
    run: async (args) => {
      const run = resolveExactEntry(
        'performance run',
        args.runId,
        runLookups(runs, (one) => String(one.runId)),
      )
      navigate(runReportPath(projectId, String(run.runId)))
      return { runId: String(run.runId) }
    },
  })

  const isStale =
    data === null || String(data.projectId) !== projectId || String(data.gameBuildId) !== buildId
  const failed = failedFor === `${projectId}:${buildId}`
  const label = buildLabel ?? buildId
  const openRun = (runId: number) => navigate(runReportPath(projectId, runId))

  return (
    <div className="pf-main-frame" ref={reportRef}>
      <div className="pf-main" ref={setScroller}>
        {showHeader && data !== null && (
          <header className="pf-page-head">
            <Link className="back-link" to={`/projects/${encodeURIComponent(projectId)}/qa`}>
              {copy.back}
            </Link>
            <p className="pf-eyebrow">{copy.eyebrow(data.gameBuildId)}</p>
            <h1>
              {copy.title}
              <InfoHint>{copy.subtitle}</InfoHint>
            </h1>
          </header>
        )}

        {failed ? (
          <div className="panel-message" role="alert">
            {copy.loadFailed}
          </div>
        ) : isStale ? (
          <p aria-busy="true" className="panel-empty">
            {copy.loading}
          </p>
        ) : runs.length === 0 ? (
          <EmptyBuild label={label} onPickBuild={onPickBuild} others={others} />
        ) : (
          <>
            <TrendKpis runs={runs} />
            <TrendPanel label={label} onOpenRun={openRun} runs={runs} />
            <RunTable onOpenRun={openRun} projectId={projectId} runs={runs} />
          </>
        )}
      </div>
      <EdgeScrollbar label={label} scroller={scroller} side="right" />
    </div>
  )
}

function runReportPath(projectId: string, runId: string | number): string {
  return `/projects/${encodeURIComponent(projectId)}/qa-runs/${runId}/performance`
}

/** 차이 하나를 부호와 함께 쓰고, 좋아졌는지에 따라 색을 고른다. */
function Delta({ value, lowerBetter, digits = 1 }: { value: number; lowerBetter: boolean; digits?: number }) {
  const rounded = Number(value.toFixed(digits))
  const tone = rounded === 0 ? '' : rounded < 0 === lowerBetter ? ' pf-good' : ' pf-bad'
  return <span className={`pf-num${tone}`}>{`${rounded > 0 ? '+' : ''}${rounded.toFixed(digits)}`}</span>
}

/** 위쪽 요약 네 칸. 가장 최근 런과 그 직전 런을 견준다. */
function TrendKpis({ runs }: { runs: BuildPerformanceRun[] }) {
  const { t } = useI18n()
  const copy = t.performance.overview
  const { latest, previous } = latestPair(runs)
  if (latest === null) return null

  const ratio = budgetRatio(latest.frameP95Ms, latest.budgetMs)
  const excluded = runs.filter((run) => isLowConfidence(run)).length
  const hitchDiff = difference(latest.hitchesPerMinute, previous?.hitchesPerMinute ?? null)
  const lowDiff = difference(latest.onePercentLowFps, previous?.onePercentLowFps ?? null)

  return (
    <div className="pf-kpis">
      <Kpi label={copy.kpiHitches} value={latest.hitchesPerMinute.toFixed(1)}>
        {hitchDiff === null ? copy.noPrevious : (
          <>
            {copy.vsPrevious('')}
            <Delta lowerBetter={lowerIsBetter('hitchesPerMinute')} value={hitchDiff} />
          </>
        )}
      </Kpi>
      <Kpi
        label={copy.kpiRatio}
        unit={ratio === null ? ' ms' : '×'}
        value={ratio === null ? latest.frameP95Ms.toFixed(1) : ratio.toFixed(2)}
        warning={ratio !== null && ratio > 1}
      >
        {latest.budgetMs === null
          ? copy.ratioUnknown
          : copy.ratioDetail(latest.frameP95Ms.toFixed(1), latest.budgetMs.toFixed(2))}
      </Kpi>
      <Kpi label={copy.kpiLow} value={latest.onePercentLowFps.toFixed(0)}>
        {lowDiff === null ? copy.noPrevious : (
          <>
            {copy.vsPrevious('')}
            <Delta digits={0} lowerBetter={lowerIsBetter('onePercentLowFps')} value={lowDiff} />
          </>
        )}
      </Kpi>
      <Kpi label={copy.kpiTrusted} unit={`/ ${runs.length}`} value={String(runs.length - excluded)} warning={excluded > 0}>
        {copy.trustedDetail(excluded)}
      </Kpi>
    </div>
  )
}

function Kpi({
  label,
  value,
  unit,
  warning = false,
  children,
}: React.PropsWithChildren<{ label: string; value: string; unit?: string; warning?: boolean }>) {
  return (
    <div className={`pf-kpi${warning ? ' pf-kpi--warning' : ''}`}>
      <span className="pf-kpi-label">{label}</span>
      <strong className="pf-kpi-value">
        {value}
        {unit !== undefined && <small>{unit}</small>}
      </strong>
      <span className="pf-kpi-detail">{children}</span>
    </div>
  )
}

/** 추세 차트가 줄어들 수 있는 가장 낮은 높이. 남는 세로 공간은 차트가 채운다. */
const MIN_HEIGHT = 240
const PAD_LEFT = 56
const PAD_RIGHT = 24
const PAD_TOP = 16
const PAD_BOTTOM = 34

function formatMetric(metric: TrendMetric, value: number): string {
  if (metric === 'p95BudgetRatio') return `${value.toFixed(2)}×`
  if (metric === 'workingSetBytesMax') return `${(value / 1024 / 1024).toFixed(0)} MiB`
  if (metric === 'onePercentLowFps') return value.toFixed(0)
  return value.toFixed(1)
}

function formatTick(metric: TrendMetric, value: number): string {
  if (metric === 'p95BudgetRatio') return `${Number(value.toFixed(2))}×`
  if (metric === 'workingSetBytesMax') return `${(value / 1024 / 1024).toFixed(0)}`
  return String(Number(value.toFixed(2)))
}

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/**
 * 런별 추세. 지표를 바꿔 볼 수 있고, 눈금 · 날짜 · 점 위 풀이를 단다(ARTEL-1207).
 *
 * 선을 잇는 규칙은 지표와 상관없이 같다: 비교 주의 런과 값이 없는 런에서 끊는다.
 */
function TrendPanel({
  runs,
  label,
  onOpenRun,
}: {
  runs: BuildPerformanceRun[]
  label: string
  onOpenRun: (runId: number) => void
}) {
  const { t } = useI18n()
  const copy = t.performance.build
  const overview = t.performance.overview
  const [metric, setMetric] = useState<TrendMetric>('hitchesPerMinute')
  const [hovered, setHovered] = useState<number | null>(null)
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const size = useElementSize(box, { width: 960, height: 280 })
  const WIDTH = Math.max(size.width, 320)
  const HEIGHT = Math.max(size.height, MIN_HEIGHT)

  const values = runs.map((run) => trendValue(run, metric))
  const measured = values.filter((value): value is number => value !== null)
  const reference = metric === 'p95BudgetRatio' ? 1 : null
  const top = niceCeil(Math.max(...measured, reference ?? 0, metric === 'hitchesPerMinute' ? 1 : 0) * 1.15)
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const x = (index: number) => (runs.length === 1 ? PAD_LEFT + plotWidth / 2 : PAD_LEFT + (index / (runs.length - 1)) * plotWidth)
  const y = (value: number) => HEIGHT - PAD_BOTTOM - (value / top) * (HEIGHT - PAD_TOP - PAD_BOTTOM)

  // Carrying the index through the split keeps each run on its own x position
  // without searching the array for it.
  const placed = runs.map((run, index) => ({ run, index, value: values[index] }))
  const trusted = splitTrustedSegments(placed, (entry) => entry.value === null || isLowConfidence(entry.run))
  // 날짜가 겹치지 않을 만큼만 적는다.
  const labelEvery = Math.max(1, Math.ceil(runs.length / 8))
  const tip = hovered === null ? null : placed[hovered]

  return (
    <section className="pf-panel pf-panel--grow">
      <header className="pf-panel-head">
        <h2>
          {overview.trendTitle(label)}
          {runs.length > 1 ? <InfoHint>{copy.manyRuns}</InfoHint> : null}
        </h2>
        <div aria-label={overview.metricLabel} className="pf-seg" role="group">
          {TREND_METRICS.map((one) => (
            <button aria-pressed={metric === one} key={one} onClick={() => setMetric(one)} type="button">
              {overview.metrics[one]}
            </button>
          ))}
        </div>
      </header>
      {runs.length === 1 && <p className="pf-panel-note">{copy.singleRun}</p>}
      <div className="pf-chart-box" ref={setBox}>
        <svg
          aria-label={`${copy.chartLabel} · ${overview.metrics[metric]}`}
          className="pf-chart"
          height={HEIGHT}
          width={WIDTH}
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          {axisTicks(top).map((tick) => (
            <g key={`y-${tick}`}>
              <line className="performance-grid" x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(tick)} y2={y(tick)} />
              <text className="performance-axis-label performance-axis-label--end" x={PAD_LEFT - 8} y={y(tick) + 4}>
                {formatTick(metric, tick)}
              </text>
            </g>
          ))}
          {reference !== null && (
            <line className="pf-reference" x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(reference)} y2={y(reference)} />
          )}
          {runs.map((run, index) =>
            index % labelEvery === 0 || index === runs.length - 1 ? (
              <text className="performance-axis-label performance-axis-label--middle" key={`x-${run.runId}`} x={x(index)} y={HEIGHT - 12}>
                {shortDate.format(new Date(run.startedAt))}
              </text>
            ) : null,
          )}

          {trusted.map((segment) => (
            <polyline
              className="pf-trend-line"
              fill="none"
              key={`segment-${segment[0].index}`}
              points={segment.map((entry) => `${x(entry.index)},${y(entry.value as number)}`).join(' ')}
            />
          ))}

          {placed.map(({ run, index, value }) => {
            if (value === null) {
              return (
                <text className="performance-axis-label performance-axis-label--middle" key={run.runId} x={x(index)} y={HEIGHT - PAD_BOTTOM - 8}>
                  {overview.pointNotMeasured}
                </text>
              )
            }
            const warned = isLowConfidence(run)
            const title = copy.pointTitle(formatDateTime(run.startedAt), formatMetric(metric, value), warned)
            return (
              <circle
                aria-label={title}
                className={`performance-trend-point${warned ? ' performance-trend-point--warning' : ''}`}
                cx={x(index)}
                cy={y(value)}
                key={run.runId}
                onBlur={() => setHovered(null)}
                onClick={() => onOpenRun(run.runId)}
                onFocus={() => setHovered(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpenRun(run.runId)
                  }
                }}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                r={warned ? 6.5 : 5}
                role="link"
                tabIndex={0}
              />
            )
          })}
        </svg>
        {tip !== null && tip.value !== null && (
          <div
            className={`pf-tip${x(tip.index) > WIDTH * 0.7 ? ' pf-tip--left' : ''}`}
            style={{
              left: `${(x(tip.index) / WIDTH) * 100}%`,
              top: `${(y(tip.value) / HEIGHT) * 100}%`,
            }}
          >
            <strong>{formatDateTime(tip.run.startedAt)}</strong>
            <span>
              {overview.metrics[metric]} <span className="pf-num">{formatMetric(metric, tip.value)}</span>
            </span>
            <span className="pf-muted">
              {isLowConfidence(tip.run) ? confidenceText(tip.run, copy) : copy.trusted} · {overview.pointOpen}
            </span>
          </div>
        )}
      </div>
      <ul className="pf-legend">
        <li>
          <span className="pf-legend-line" />
          {copy.legendTrusted}
        </li>
        <li>
          <span className="pf-legend-dot" />
          {copy.legendWarning}
        </li>
        {reference !== null && (
          <li>
            <span className="pf-legend-ref" />
            {overview.legendBudget}
          </li>
        )}
      </ul>
    </section>
  )
}

/** The chart's accessible equivalent, and the only way into a run's detail besides the points. */
function RunTable({
  projectId,
  runs,
  onOpenRun,
}: {
  projectId: string
  runs: BuildPerformanceRun[]
  onOpenRun: (runId: number) => void
}) {
  const { t } = useI18n()
  const copy = t.performance.build
  const overview = t.performance.overview
  const newestFirst = [...runs].reverse()
  const most = Math.max(...runs.map((run) => run.hitchesPerMinute), 0.1)

  return (
    <section className="pf-panel">
      <header className="pf-panel-head">
        <h2>
          {overview.tableTitle} <span className="pf-num pf-muted">{runs.length}</span>
        </h2>
        <span className="pf-panel-hint">{overview.tableHint}</span>
      </header>
      <div className="pf-table-wrap">
        <table className="pf-table pf-runs">
          <thead>
            <tr>
              <th scope="col">{copy.columnStartedAt}</th>
              <th scope="col">{overview.columnDuration}</th>
              <th scope="col">{copy.columnHitches}</th>
              <th scope="col">{copy.columnFrame}</th>
              <th scope="col">{copy.columnBudget}</th>
              <th scope="col">{copy.columnRenderSource}</th>
              <th scope="col">{copy.columnConfidence}</th>
              <th scope="col">
                <span className="visually-hidden">{copy.columnRun}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((run) => {
              const ratio = budgetRatio(run.frameP95Ms, run.budgetMs)
              const warned = isLowConfidence(run)
              return (
                <tr className={warned ? 'is-warning' : ''} key={run.runId} onClick={() => onOpenRun(run.runId)}>
                  <td>{formatDateTime(run.startedAt)}</td>
                  <td className="pf-num">{formatDuration(run.durationMs, overview.duration)}</td>
                  <td>
                    <span className="pf-bar">
                      <span className="pf-bar-track">
                        <span className="pf-bar-fill" style={{ width: `${(run.hitchesPerMinute / most) * 100}%` }} />
                      </span>
                      <span className="pf-num">{run.hitchesPerMinute.toFixed(1)}</span>
                    </span>
                  </td>
                  <td className="pf-num">
                    {run.frameMeanMs.toFixed(1)} / {run.frameP95Ms.toFixed(1)} ms
                  </td>
                  <td>
                    {ratio === null || run.budgetMs === null ? (
                      <span className="pf-chip">{copy.budgetUnknown}</span>
                    ) : (
                      <span className={`pf-chip ${ratio > 1.5 ? 'pf-chip--critical' : ratio > 1.2 ? 'pf-chip--warning' : 'pf-chip--ok'}`}>
                        <span className="pf-num">{ratio.toFixed(2)}×</span> / {copy.budgetValue(run.budgetMs.toFixed(2))}
                      </span>
                    )}
                  </td>
                  <td>
                    <RenderSource run={run} />
                  </td>
                  <td>
                    <span className={`pf-chip ${warned ? 'pf-chip--warning' : 'pf-chip--ok'}`}>{confidenceText(run, copy)}</span>
                  </td>
                  <td>
                    <Link
                      className="pf-row-link"
                      onClick={(event) => event.stopPropagation()}
                      to={runReportPath(projectId, run.runId)}
                    >
                      {copy.detailLink} →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function formatDuration(ms: number, format: (minutes: number, seconds: number) => string): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return format(Math.floor(total / 60), total % 60)
}

/**
 * Render counters are listed per run and never joined into a trend line.
 *
 * Editor `UnityStats` and standalone `ProfilerRecorder` report the same names for
 * different things, so a single line across both would compare two measurements
 * that were never the same measurement. Showing the source per row makes the
 * incomparability visible instead of averaging it away.
 */
function RenderSource({ run }: { run: BuildPerformanceRun }) {
  const { t } = useI18n()
  const copy = t.performance.groups
  const group = run.groups.renderCounters
  if (group === undefined) return <span className="pf-muted">{t.performance.unmeasured}</span>
  if (group.source !== null) {
    return (
      <span className={`pf-chip${group.source === 'EDITOR_UNITY_STATS' ? ' pf-chip--editor' : ''}`}>
        {copy.sources[group.source] ?? group.source}
      </span>
    )
  }
  return <span className="pf-chip">{copy.availability[group.availability]}</span>
}

function confidenceText(
  run: BuildPerformanceRun,
  copy: {
    lowCoverage: (percent: string) => string
    highDischarging: (percent: string) => string
    trusted: string
  },
): string {
  if (isLowCoverage(run.coverageRatio)) return copy.lowCoverage((run.coverageRatio * 100).toFixed(0))

  if (isHighDischarging(run.dischargingRatio)) {
    return copy.highDischarging((run.dischargingRatio * 100).toFixed(0))
  }

  return copy.trusted
}

/** 런 없는 빌드. 빈칸 대신 모으는 방법과 런이 있는 다른 빌드를 보인다(ARTEL-1207). */
function EmptyBuild({
  label,
  others,
  onPickBuild,
}: {
  label: string
  others?: OtherBuild[]
  onPickBuild?: (buildId: string) => void
}) {
  const { t } = useI18n()
  const copy = t.performance.build
  const overview = t.performance.overview

  return (
    <section className="pf-panel pf-panel--grow">
      <header className="pf-panel-head">
        <h2>{label}</h2>
        <span className="pf-chip">{overview.noRuns}</span>
      </header>
      <div className={`pf-empty${others === undefined ? ' pf-empty--single' : ''}`}>
        <div>
          <h3>{copy.emptyBody}</h3>
          <p>{overview.emptyHow}</p>
          <ol className="pf-steps">
            {overview.emptySteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        {others !== undefined && (
          <div>
            <h3>{overview.othersTitle}</h3>
            <p>{others.length === 0 ? overview.othersNone : overview.othersBody}</p>
            {others.length > 0 && (
              <ul className="pf-others">
                {others.map((other) => (
                  <li key={other.id}>
                    <button onClick={() => onPickBuild?.(other.id)} type="button">
                      <span className="pf-others-name">{other.name}</span>
                      <span className="pf-muted pf-num">{overview.runsLatest(other.runCount, other.latest.toFixed(1))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {/* 추세가 그려질 자리. 빈 칸으로 두지 않고 무엇이 생길지 보인다. */}
      <div aria-hidden="true" className="pf-ghost">
        <span>{overview.emptyGhost}</span>
      </div>
    </section>
  )
}
