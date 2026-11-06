import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { SketchEmpty } from '../emptyStates/SketchEmpty'
import { PerformanceSketch } from '../emptyStates/sketches'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { buildName } from './buildName'
import { MetricGroupList } from './MetricGroupPanel'
import { PerformanceChart, type ChartSeries } from './PerformanceChart'
import { getRunPerformance } from './performanceApi'
import {
  budgetRatio,
  isFrameRateUncapped,
  isHighDischarging,
  isLowConfidence,
  isLowCoverage,
  readRefreshRateHz,
  type PerformanceDevice,
  type PerformancePoint,
  type PerformanceSummary,
  type RunPerformance,
} from './performanceTypes'
import './performance.css'

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

  return <RunReport data={data} projectId={projectId} qaRunId={qaRunId} />
}

/**
 * 본문(요약 · 프레임 · CPU · 메모리 · 버킷)과 오른쪽 칸(수집 환경 · 지표군)으로 나눈다(ARTEL-1207).
 * 두 칸 다 화면 높이에 맞추고 서비스 스크롤 막대로 각자 넘긴다.
 */
function RunReport({ data, projectId, qaRunId }: { data: RunPerformance; projectId: string; qaRunId: string }) {
  const { t } = useI18n()
  const copy = t.performance.run
  const overview = t.performance.overview
  const { builds } = useWorkspace()
  const [mainNode, setMainNode] = useState<HTMLDivElement | null>(null)
  const [sideNode, setSideNode] = useState<HTMLDivElement | null>(null)

  const { summary, device } = data
  const build = data.gameBuildId === null ? undefined : builds.find((one) => one.id === String(data.gameBuildId))
  const lengthMs = data.completedAt === null ? null : Date.parse(data.completedAt) - Date.parse(data.startedAt)
  const careful = summary !== null && isLowConfidence(summary)

  return (
    <section className="pf-run">
      <div className="pf-run-frame">
        <div className="pf-run-main" ref={setMainNode}>
          <header className="pf-page-head">
            <div className="pf-back-links">
              <Link
                className="back-link"
                to={`/projects/${encodeURIComponent(projectId)}/qa-runs/${encodeURIComponent(qaRunId)}`}
              >
                {copy.back}
              </Link>
              {data.gameBuildId !== null && (
                <Link
                  className="back-link"
                  to={`/projects/${encodeURIComponent(projectId)}/performance?build=${data.gameBuildId}`}
                >
                  {overview.backToBuild(build === undefined ? String(data.gameBuildId) : buildName(build))} →
                </Link>
              )}
            </div>
            <p className="pf-eyebrow">{copy.eyebrow(data.runId)}</p>
            <h1>
              {copy.title}
              <InfoHint>{copy.bucketNote(data.series.bucketMs)}</InfoHint>
            </h1>
            <div className="pf-chips">
              <span className="pf-chip">{overview.startedAt(formatDateTime(data.startedAt))}</span>
              {lengthMs !== null && lengthMs >= 0 && (
                <span className="pf-chip">
                  {overview.lengthChip(
                    overview.duration(Math.floor(lengthMs / 60_000), Math.round((lengthMs % 60_000) / 1000)),
                  )}
                </span>
              )}
              {device?.isEditor !== null && device?.isEditor !== undefined && (
                <span className={`pf-chip${device.isEditor ? ' pf-chip--editor' : ''}`}>
                  {device.isEditor ? copy.deviceEditor : copy.deviceStandalone}
                </span>
              )}
              {build !== undefined && <span className="pf-chip">{overview.buildChip(buildName(build))}</span>}
              {careful && <span className="pf-chip pf-chip--warning">{overview.compareWithCare}</span>}
            </div>
          </header>

          {device?.isEditor === true && (
            <p className="pf-warning" role="status">
              {copy.editorWarning}
            </p>
          )}

          {summary === null ? (
            <section className="pf-panel pf-panel--grow">
              <SketchEmpty body={copy.emptyBody} sketch={<PerformanceSketch />} surface title={copy.emptyTitle} />
            </section>
          ) : (
            <>
              {isHighDischarging(summary.dischargingRatio) && (
                <p className="pf-warning" role="status">
                  {copy.dischargingWarning((summary.dischargingRatio * 100).toFixed(0))}
                </p>
              )}

              <SummaryMetrics summary={summary} />
              <FrameChartPanel points={data.series.points} summary={summary} />
              <ProcessChartPanels points={data.series.points} summary={summary} />
              <BucketTable points={data.series.points} />
            </>
          )}
        </div>
        <EdgeScrollbar label={copy.title} scroller={mainNode} side="right" />
      </div>

      <aside className="pf-run-side-frame">
        <div className="pf-run-side" ref={setSideNode}>
          <DevicePanel device={device} />
          {summary !== null && <MetricGroupPanel groups={summary.groups} />}
        </div>
        <EdgeScrollbar label={copy.deviceTitle} scroller={sideNode} side="right" />
      </aside>
    </section>
  )
}

/**
 * Groups live in their own panel rather than folded into the summary tiles.
 *
 * A tile states a number; a group has to state whether there is a number at all
 * and why not. Mixing the two would make an unsupported group look like a zero.
 */
function MetricGroupPanel({ groups }: { groups: PerformanceSummary['groups'] }) {
  const { t } = useI18n()
  const copy = t.performance.groups

  return (
    <Panel hint={copy.subtitle} title={copy.title}>
      <MetricGroupList groups={groups} />
    </Panel>
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
    <div className="pf-kpis">
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
    <Panel grow hint={copy.frameSubtitle} title={copy.frameTitle}>
      <PerformanceChart
        budgetMs={summary.budgetMs}
        fill
        formatValue={(value) => `${Number(value.toFixed(1))} ms`}
        points={points}
        series={series}
        showHitches
        width={960}
      />
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
    <div className="pf-columns">
      <Panel title={copy.cpuTitle} subtitle={processSubtitle}>
        <PerformanceChart
          formatValue={(value) => `${Number(value.toFixed(1))}%`}
          points={points}
          series={[
            { key: 'cpuPercent', label: copy.seriesCpu, className: 'performance-line performance-line--cpu' },
          ]}
          width={480}
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
          formatValue={(value) => formatBytes(value, '')}
          points={points}
          width={480}
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
    <details className="pf-panel pf-buckets">
      <summary className="pf-panel-head">
        <h2>
          {t.performance.overview.bucketsTitle} <span className="pf-num pf-muted">{points.length}</span>
          <InfoHint>{copy.tableSubtitle}</InfoHint>
        </h2>
        <span className="pf-panel-hint">{t.performance.overview.bucketsHint}</span>
      </summary>
      <div className="pf-table-wrap">
        <table className="pf-table">
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
              <tr className={point.frameMeanMs === null ? 'is-gap' : ''} key={point.atMs}>
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
    </details>
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
      <Panel title={copy.deviceTitle} hint={copy.deviceSubtitle}>
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
    <Panel title={copy.deviceTitle} hint={copy.deviceSubtitle}>
      <div className="pf-device">
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
    <div className={`pf-kpi${warning ? ' pf-kpi--warning' : ''}`}>
      <span className="pf-kpi-label">{label}</span>
      <strong className="pf-kpi-value">{value}</strong>
      <span className="pf-kpi-detail">{detail}</span>
    </div>
  )
}

/** `hint` 는 늘 같은 설명이라 info 아이콘으로, `subtitle` 은 이 run 의 측정 상태라 화면에 그대로 둔다. */
function Panel({
  title,
  hint,
  subtitle,
  grow = false,
  children,
}: React.PropsWithChildren<{ title: string; hint?: string; subtitle?: string; grow?: boolean }>) {
  return (
    <section className={`pf-panel${grow ? ' pf-panel--grow' : ''}`}>
      <header className="pf-panel-head">
        <h2>
          {title}
          {hint !== undefined && <InfoHint>{hint}</InfoHint>}
        </h2>
        {subtitle !== undefined && <span className="pf-panel-hint">{subtitle}</span>}
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
