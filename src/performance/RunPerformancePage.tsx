import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { PerformanceChart, type ChartSeries } from './PerformanceChart'
import { getRunPerformance } from './performanceApi'
import {
  budgetRatio,
  isFrameRateUncapped,
  isHighDischarging,
  isLowCoverage,
  readRefreshRateHz,
  type PerformanceDevice,
  type PerformancePoint,
  type PerformanceSummary,
  type RunPerformance,
} from './performanceTypes'

/**
 * One run's performance, in enough detail to say which part of it stalled.
 *
 * The screen exists because a mean frame time hides exactly the thing QA is
 * looking for. So the frame chart carries p95 and max next to the mean, hitch
 * markers sit on the time axis, and the frame budget is drawn as a rule rather
 * than described in prose — 33 ms is healthy under a 30 fps cap and broken on a
 * 144 Hz display, and the reader should not have to remember which this is.
 *
 * Where the run measured nothing, the screen shows nothing. Not zero.
 */
export function RunPerformanceRoute() {
  const { projectId = '', qaRunId = '' } = useParams()
  const { t } = useI18n()
  const copy = t.performance.run

  const [data, setData] = useState<RunPerformance | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    getRunPerformance(qaRunId, controller.signal)
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setFailedFor(qaRunId)
      })

    return () => controller.abort()
  }, [qaRunId])

  if (failedFor === qaRunId) {
    return (
      <section className="page">
        <div className="panel-message" role="alert">
          {copy.loadFailed}
        </div>
      </section>
    )
  }

  // Guard against the previous run's payload rendering under a new id.
  if (data === null || String(data.runId) !== qaRunId) {
    return (
      <section className="page" aria-busy="true">
        <p className="panel-empty">{copy.loading}</p>
      </section>
    )
  }

  const { summary, device } = data

  return (
    <section className="page performance-page">
      <header className="performance-page-head">
        <div>
          <Link
            className="back-link"
            to={`/projects/${encodeURIComponent(projectId)}/qa-runs/${encodeURIComponent(qaRunId)}`}
          >
            {copy.back}
          </Link>
          <p className="performance-eyebrow">{copy.eyebrow(data.runId)}</p>
          <h1>{copy.title}</h1>
          <p>{copy.bucketNote(data.series.bucketMs)}</p>
        </div>
      </header>

      {device?.isEditor === true && (
        <p className="performance-warning" role="status">
          {copy.editorWarning}
        </p>
      )}

      {summary === null ? (
        <div className="performance-empty">
          <strong>{copy.emptyTitle}</strong>
          <p>{copy.emptyBody}</p>
        </div>
      ) : (
        <>
          <SummaryMetrics summary={summary} />

          {isHighDischarging(summary.dischargingRatio) && (
            <p className="performance-warning" role="status">
              {copy.dischargingWarning((summary.dischargingRatio * 100).toFixed(0))}
            </p>
          )}

          <FrameChartPanel points={data.series.points} summary={summary} />
          <ProcessChartPanels points={data.series.points} summary={summary} />
          <BucketTable points={data.series.points} />
        </>
      )}

      <DevicePanel device={device} />
    </section>
  )
}

function SummaryMetrics({ summary }: { summary: PerformanceSummary }) {
  const { t } = useI18n()
  const copy = t.performance.run

  const p95Ratio = budgetRatio(summary.frameP95Ms, summary.budgetMs)
  const overBudget = p95Ratio !== null && p95Ratio > 1
  const lowCoverage = isLowCoverage(summary.coverageRatio)

  const distributionDetail =
    p95Ratio === null
      ? copy.distributionDetail
      : overBudget
        ? copy.overBudget(p95Ratio.toFixed(2))
        : copy.budgetRatio(p95Ratio.toFixed(2))

  return (
    <div className="performance-metrics">
      <Metric
        label={copy.meanLabel}
        value={`${summary.frameMeanMs.toFixed(1)} ms`}
        detail={
          summary.budgetMs === null
            ? copy.budgetUnknown
            : copy.budgetBasis(summary.budgetMs.toFixed(2))
        }
      />
      <Metric
        label={copy.distributionLabel}
        value={`${summary.frameP95Ms.toFixed(1)} / ${summary.frameP99Ms.toFixed(1)} ms`}
        detail={distributionDetail}
        warning={overBudget}
      />
      <Metric
        label={copy.hitchLabel}
        value={summary.hitchesPerMinute.toFixed(1)}
        detail={copy.hitchDetail}
      />
      <Metric
        label={copy.coverageLabel}
        value={`${(summary.coverageRatio * 100).toFixed(0)}%`}
        detail={lowCoverage ? copy.coverageLow : copy.coverageOk}
        warning={lowCoverage}
      />
    </div>
  )
}

function FrameChartPanel({
  points,
  summary,
}: {
  points: PerformancePoint[]
  summary: PerformanceSummary
}) {
  const { t } = useI18n()
  const copy = t.performance.run

  const series: ChartSeries[] = [
    { key: 'frameMeanMs', label: copy.seriesMean, className: 'performance-line performance-line--mean' },
    { key: 'frameP95Ms', label: copy.seriesP95, className: 'performance-line performance-line--p95' },
    { key: 'frameMaxMs', label: copy.seriesMax, className: 'performance-line performance-line--max' },
  ]

  return (
    <Panel title={copy.frameTitle} subtitle={copy.frameSubtitle}>
      <PerformanceChart budgetMs={summary.budgetMs} points={points} series={series} showHitches />
    </Panel>
  )
}

function ProcessChartPanels({
  points,
  summary,
}: {
  points: PerformancePoint[]
  summary: PerformanceSummary
}) {
  const { t } = useI18n()
  const copy = t.performance.run

  // A platform that cannot read `process` reports a ratio of 0, which is not
  // the same as a process that was idle.
  const processSubtitle =
    summary.processSampleRatio === 0
      ? copy.processMissing
      : copy.processCoverage((summary.processSampleRatio * 100).toFixed(0))

  return (
    <div className="performance-columns">
      <Panel title={copy.cpuTitle} subtitle={processSubtitle}>
        <PerformanceChart
          points={points}
          series={[
            { key: 'cpuPercent', label: copy.seriesCpu, className: 'performance-line performance-line--cpu' },
          ]}
        />
      </Panel>
      <Panel
        title={copy.memoryTitle}
        subtitle={
          summary.workingSetBytesMax === null
            ? processSubtitle
            : copy.memoryMax(formatBytes(summary.workingSetBytesMax, t.performance.unmeasured))
        }
      >
        <PerformanceChart
          points={points}
          series={[
            {
              key: 'workingSetBytes',
              label: copy.seriesMemory,
              className: 'performance-line performance-line--memory',
            },
          ]}
        />
      </Panel>
    </div>
  )
}

/** The chart's accessible equivalent: the same buckets, in the same order. */
function BucketTable({ points }: { points: PerformancePoint[] }) {
  const { t } = useI18n()
  const copy = t.performance.run
  const unmeasured = t.performance.unmeasured

  return (
    <Panel title={copy.tableTitle} subtitle={copy.tableSubtitle}>
      <div className="performance-table-wrap">
        <table className="performance-table">
          <thead>
            <tr>
              <th scope="col">{copy.columnElapsed}</th>
              <th scope="col">{copy.columnState}</th>
              <th scope="col">{copy.columnMean}</th>
              <th scope="col">{copy.columnP95}</th>
              <th scope="col">{copy.columnMax}</th>
              <th scope="col">{copy.columnHitch}</th>
              <th scope="col">{copy.columnCpu}</th>
              <th scope="col">{copy.columnMemory}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.atMs}>
                <td>{(point.atMs / 1000).toFixed(1)}s</td>
                <td>{bucketState(point, copy)}</td>
                <td>{formatMs(point.frameMeanMs, unmeasured)}</td>
                <td>{formatMs(point.frameP95Ms, unmeasured)}</td>
                <td>{formatMs(point.frameMaxMs, unmeasured)}</td>
                <td>{point.hitchCount ?? unmeasured}</td>
                <td>
                  {point.cpuPercent === null ? unmeasured : `${point.cpuPercent.toFixed(1)}%`}
                </td>
                <td>{formatBytes(point.workingSetBytes, unmeasured)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/**
 * What the run was captured on, and therefore where its frame budget came from.
 *
 * Shown even when the run has no samples: knowing an editor session produced
 * nothing is more useful than an empty page.
 */
function DevicePanel({ device }: { device: PerformanceDevice | null }) {
  const { t } = useI18n()
  const copy = t.performance.run

  if (device === null) {
    return (
      <Panel title={copy.deviceTitle} subtitle={copy.deviceSubtitle}>
        <p className="performance-unmeasured">{copy.deviceMissing}</p>
      </Panel>
    )
  }

  const refreshRateHz = readRefreshRateHz(device)
  const rows: { label: string; value: string | null }[] = [
    {
      label: copy.deviceRefreshRate,
      value: refreshRateHz === null ? null : `${refreshRateHz.toFixed(2)} Hz`,
    },
    {
      label: copy.deviceTargetFrameRate,
      value: isFrameRateUncapped(device)
        ? copy.deviceUncapped
        : device.targetFrameRate === null
          ? null
          : String(device.targetFrameRate),
    },
    { label: copy.deviceVSync, value: device.vSyncCount === null ? null : String(device.vSyncCount) },
    { label: copy.deviceGpu, value: device.graphicsDeviceName },
    { label: copy.deviceModel, value: device.deviceModel },
    {
      label: copy.deviceProcessor,
      value:
        device.processorType === null
          ? null
          : device.processorCount === null
            ? device.processorType
            : `${device.processorType} · ${copy.deviceCores(device.processorCount)}`,
    },
    { label: copy.deviceOs, value: device.operatingSystem },
    { label: copy.deviceBackend, value: device.scriptingBackend },
    { label: copy.deviceSdkVersion, value: device.sdkVersion },
  ]

  return (
    <Panel title={copy.deviceTitle} subtitle={copy.deviceSubtitle}>
      <div className="performance-device">
        {device.isEditor !== null && (
          <p className="performance-device-kind">
            {device.isEditor ? copy.deviceEditor : copy.deviceStandalone}
          </p>
        )}
        <dl>
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value ?? t.performance.unmeasured}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  )
}

function Metric({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string
  value: string
  detail: string
  warning?: boolean
}) {
  return (
    <div className={`performance-metric${warning ? ' performance-metric--warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function Panel({
  title,
  subtitle,
  children,
}: React.PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <section className="performance-panel">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

function bucketState(
  point: PerformancePoint,
  copy: { stateMeasured: string; stateUnfocused: string; stateUnmeasured: string },
): string {
  if (point.frameMeanMs !== null) return copy.stateMeasured

  // `isFocused` is the reason for the hole, not the test for it.
  return point.isFocused ? copy.stateUnmeasured : copy.stateUnfocused
}

function formatMs(value: number | null, unmeasured: string): string {
  return value === null ? unmeasured : `${value.toFixed(1)} ms`
}

/**
 * Binary megabytes, kept local rather than reusing the shared byte formatter:
 * that one renders 0 as an em dash, and a working set the run actually
 * measured as zero has to stay distinguishable from one it never read.
 */
function formatBytes(value: number | null, unmeasured: string): string {
  return value === null ? unmeasured : `${(value / 1024 / 1024).toFixed(0)} MiB`
}
