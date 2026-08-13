import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { sortByStartedAt, splitTrustedSegments } from './chartModel'
import { getBuildPerformance } from './performanceApi'
import {
  isHighDischarging,
  isLowConfidence,
  isLowCoverage,
  type BuildPerformance,
  type BuildPerformanceRun,
} from './performanceTypes'

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
  return <BuildPerformanceReport buildId={buildId} projectId={projectId} />
}

export function BuildPerformanceReport({
  buildId,
  projectId,
  showHeader = true,
}: {
  buildId: string
  projectId: string
  showHeader?: boolean
}) {
  const { t } = useI18n()
  const copy = t.performance.build

  const [data, setData] = useState<BuildPerformance | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)

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

  if (failedFor === `${projectId}:${buildId}`) {
    return (
      <section className="page">
        <div className="panel-message" role="alert">
          {copy.loadFailed}
        </div>
      </section>
    )
  }

  const isStale =
    data === null || String(data.projectId) !== projectId || String(data.gameBuildId) !== buildId

  if (isStale) {
    return (
      <section className="page" aria-busy="true">
        <p className="panel-empty">{copy.loading}</p>
      </section>
    )
  }

  return (
    <section className="page performance-page">
      {showHeader && <header className="performance-page-head">
        <div>
          <Link className="back-link" to={`/projects/${encodeURIComponent(projectId)}/qa`}>
            {copy.back}
          </Link>
          <p className="performance-eyebrow">{copy.eyebrow(data.gameBuildId)}</p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
      </header>}

      {runs.length === 0 ? (
        <div className="performance-empty">
          <strong>{copy.emptyTitle}</strong>
          <p>{copy.emptyBody}</p>
        </div>
      ) : (
        <section className="performance-panel">
          <header>
            <div>
              <h2>{copy.panelTitle}</h2>
              <p>{runs.length === 1 ? copy.singleRun : copy.manyRuns}</p>
            </div>
          </header>
          <TrendChart runs={runs} />
          <RunTable projectId={projectId} runs={runs} />
        </section>
      )}
    </section>
  )
}

const WIDTH = 900
const HEIGHT = 260
const PAD = 36

function TrendChart({ runs }: { runs: BuildPerformanceRun[] }) {
  const { t } = useI18n()
  const copy = t.performance.build

  const maxValue = Math.max(...runs.map((run) => run.hitchesPerMinute), 1) * 1.15
  // A lone run sits in the middle rather than collapsing the x scale.
  const x = (index: number) =>
    runs.length === 1 ? WIDTH / 2 : PAD + (index / (runs.length - 1)) * (WIDTH - PAD * 2)
  const y = (value: number) => HEIGHT - PAD - (value / maxValue) * (HEIGHT - PAD * 2)

  // Carrying the index through the split keeps each run on its own x position
  // without searching the array for it.
  const placed = runs.map((run, index) => ({ run, index }))
  const trusted = splitTrustedSegments(placed, (entry) => isLowConfidence(entry.run))

  return (
    <div className="performance-chart-wrap">
      <svg
        aria-label={copy.chartLabel}
        className="performance-chart"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <line
          className="performance-axis"
          x1={PAD}
          x2={WIDTH - PAD}
          y1={HEIGHT - PAD}
          y2={HEIGHT - PAD}
        />

        {trusted.map((segment) => (
          <polyline
            className="performance-line performance-line--mean"
            fill="none"
            key={`segment-${segment[0].index}`}
            points={segment
              .map((entry) => `${x(entry.index)},${y(entry.run.hitchesPerMinute)}`)
              .join(' ')}
          />
        ))}

        {placed.map(({ run, index }) => {
          const warned = isLowConfidence(run)

          return (
            <circle
              className={`performance-trend-point${warned ? ' performance-trend-point--warning' : ''}`}
              cx={x(index)}
              cy={y(run.hitchesPerMinute)}
              key={run.runId}
              r={warned ? 7 : 5}
            >
              <title>
                {copy.pointTitle(
                  new Date(run.startedAt).toLocaleString(),
                  run.hitchesPerMinute.toFixed(1),
                  warned,
                )}
              </title>
            </circle>
          )
        })}

        <text className="performance-axis-label" x={PAD} y={PAD - 8}>
          {maxValue.toFixed(1)}
        </text>
      </svg>

      <ul className="performance-legend">
        <li>
          <span className="performance-trend-point" />
          {copy.legendTrusted}
        </li>
        <li>
          <span className="performance-trend-point performance-trend-point--warning" />
          {copy.legendWarning}
        </li>
      </ul>
    </div>
  )
}

/** The chart's accessible equivalent, and the only way into a run's detail. */
function RunTable({ projectId, runs }: { projectId: string; runs: BuildPerformanceRun[] }) {
  const { t } = useI18n()
  const copy = t.performance.build

  return (
    <div className="performance-table-wrap">
      <table className="performance-table">
        <thead>
          <tr>
            <th scope="col">{copy.columnStartedAt}</th>
            <th scope="col">{copy.columnHitches}</th>
            <th scope="col">{copy.columnFrame}</th>
            <th scope="col">{copy.columnBudget}</th>
            <th scope="col">{copy.columnConfidence}</th>
            <th scope="col">{copy.columnRun}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr className={isLowConfidence(run) ? 'performance-row--warning' : ''} key={run.runId}>
              <td>{new Date(run.startedAt).toLocaleString()}</td>
              <td>{run.hitchesPerMinute.toFixed(1)}</td>
              <td>
                {run.frameMeanMs.toFixed(1)} / {run.frameP95Ms.toFixed(1)} ms
              </td>
              <td>
                {run.budgetMs === null
                  ? copy.budgetUnknown
                  : copy.budgetValue(run.budgetMs.toFixed(2))}
              </td>
              <td>{confidenceLabel(run, copy)}</td>
              <td>
                <Link
                  to={`/projects/${encodeURIComponent(projectId)}/qa-runs/${run.runId}/performance`}
                >
                  {copy.detailLink}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function confidenceLabel(
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
