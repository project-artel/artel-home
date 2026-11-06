/**
 * The performance contract, as the Notion documents
 * "성능 지표 런 상세 조회" and "성능 지표 빌드 추세 조회" define it.
 *
 * One rule shapes every type here: `null` means "not measured" and `0` means
 * "measured, and it was zero". Nothing in this module may collapse the two.
 *
 * Metric groups add a third state on top of those two. See `MetricGroupAvailability`.
 */

/**
 * Why a group has no values.
 *
 * `null` answers that for a single field. This answers it for a whole group, and
 * the two questions are not the same one. Collapsing `UNSUPPORTED` into
 * `NOT_REPORTED` loses the only signal that separates "this build could not read
 * the counter" from "this SDK does not collect it at all", and without that a
 * disappeared metric cannot be attributed to the game or to the SDK.
 */
export type MetricGroupAvailability = 'MEASURED' | 'UNSUPPORTED' | 'NOT_REPORTED'

/**
 * One metric group's run-level rollup.
 *
 * `metrics` is deliberately untyped past its leaves. The contract's rule is that
 * a client ignores group keys and group-interior fields it does not know, because
 * the server ships before the screen does; typing the interior would turn every
 * server-first deploy into a build break here.
 */
export type MetricGroup = {
  availability: MetricGroupAvailability
  /** Samples carrying this group over all samples. Same kind of number as `processSampleRatio`; no threshold. */
  sampleRatio: number
  metrics: MetricValues | null
  /**
   * Present on `renderCounters` only. Editor `UnityStats` and standalone
   * `ProfilerRecorder` report the same names for different things, so runs are
   * only comparable within one source.
   */
  source: string | null
}

/** A group's metric tree. Leaves are numbers; branches nest one or more levels. */
export type MetricValues = { [key: string]: number | MetricValues }

export type MetricGroups = Record<string, MetricGroup>

/** Groups on a single series bucket. No availability here — that is a run-level verdict. */
export type PointMetricGroups = Record<string, { metrics: MetricValues }>

export type PerformancePoint = {
  atMs: number
  frameMeanMs: number | null
  frameP95Ms: number | null
  frameMaxMs: number | null
  hitchCount: number | null
  cpuPercent: number | null
  workingSetBytes: number | null
  isFocused: boolean
  groups: PointMetricGroups
}

/** Point fields the charts can plot, so a series key cannot name `isFocused` or `groups`. */
export type PlottablePointKey = {
  [K in keyof PerformancePoint]: PerformancePoint[K] extends number | null ? K : never
}[keyof PerformancePoint]

export type PerformanceSummary = {
  sampleCount: number
  coveredMs: number
  coverageRatio: number
  frameMeanMs: number
  frameP95Ms: number
  frameP99Ms: number
  onePercentLowFps: number
  hitchCount: number
  hitchesPerMinute: number
  budgetMs: number | null
  cpuPercentMean: number | null
  cpuPercentMax: number | null
  workingSetBytesMax: number | null
  gcCollections: { gen0: number; gen1: number; gen2: number }
  dischargingRatio: number
  processSampleRatio: number
  groups: MetricGroups
}

/**
 * The `DEVICE_CONTEXT` that was current during the run.
 *
 * Every field is nullable even though the contract lists them as present.
 * `device` is capture context, not evidence: a field the server could not fill
 * should cost the reader that one row, not the whole page the way a malformed
 * metric legitimately does.
 */
export type PerformanceDevice = {
  isEditor: boolean | null
  scriptingBackend: string | null
  sdkVersion: string | null
  deviceModel: string | null
  processorType: string | null
  processorCount: number | null
  graphicsDeviceName: string | null
  graphicsDeviceType: string | null
  operatingSystem: string | null
  targetFrameRate: number | null
  vSyncCount: number | null
  refreshRateHz: number | null
}

export type RunPerformance = {
  runId: number
  gameInstanceId: number
  gameBuildId: number | null
  startedAt: string
  completedAt: string | null
  summary: PerformanceSummary | null
  device: PerformanceDevice | null
  series: { bucketMs: number; points: PerformancePoint[] }
}

export type BuildPerformanceRun = {
  runId: number
  startedAt: string
  durationMs: number
  status: string
  frameMeanMs: number
  frameP95Ms: number
  frameP99Ms: number
  onePercentLowFps: number
  hitchesPerMinute: number
  budgetMs: number | null
  cpuPercentMean: number | null
  workingSetBytesMax: number | null
  coverageRatio: number
  dischargingRatio: number
  processSampleRatio: number
  groups: MetricGroups
}

export type BuildPerformance = {
  gameBuildId: number
  projectId: number
  runs: BuildPerformanceRun[]
}

/**
 * Confidence thresholds from the contract. Both are exclusive: a run sitting
 * exactly on 0.8 coverage or 0.2 discharging is still trusted.
 */
export const LOW_COVERAGE_RATIO = 0.8
export const HIGH_DISCHARGING_RATIO = 0.2

export function isLowCoverage(coverageRatio: number): boolean {
  return coverageRatio < LOW_COVERAGE_RATIO
}

export function isHighDischarging(dischargingRatio: number): boolean {
  return dischargingRatio > HIGH_DISCHARGING_RATIO
}

/**
 * A run whose summary should not be compared on the same line as the others.
 * The value is still shown — the reader decides what to do with it.
 */
export function isLowConfidence(
  run: Pick<BuildPerformanceRun, 'coverageRatio' | 'dischargingRatio'>,
): boolean {
  return isLowCoverage(run.coverageRatio) || isHighDischarging(run.dischargingRatio)
}

/**
 * How a frame time reads against the run's own budget.
 *
 * The whole point of carrying `budgetMs`: 33 ms is healthy under a 30 fps cap
 * and broken on a 144 Hz display. Returns null when the server could not
 * decide on a budget, and the screen then shows absolute milliseconds only.
 */
export function budgetRatio(frameMs: number, budgetMs: number | null): number | null {
  if (budgetMs === null || budgetMs <= 0) return null

  return frameMs / budgetMs
}

/**
 * The SDK pushes `0` when it cannot read the display rather than NaN, so zero
 * here is absence rather than a zero-hertz screen.
 */
export function readRefreshRateHz(device: PerformanceDevice): number | null {
  return device.refreshRateHz !== null && device.refreshRateHz > 0 ? device.refreshRateHz : null
}

/** Unity reports `-1` for "no cap", which is a state rather than a rate. */
export function isFrameRateUncapped(device: PerformanceDevice): boolean {
  return device.targetFrameRate !== null && device.targetFrameRate < 0
}

/**
 * Groups worth giving a labelled panel to, in display order.
 *
 * This is a display list, not a validation list. A group outside it still parses
 * and still reaches the screen; it just renders under its own raw key rather than
 * a translated title. Keeping the two concerns apart is what lets the server ship
 * a new group before this file learns about it.
 */
export const NAMED_METRIC_GROUPS = ['gc', 'renderCounters', 'sdkOverhead', 'editorRender'] as const

/** Groups the run actually has something to say about, named ones first. */
export function orderedGroupNames(groups: MetricGroups): string[] {
  const named = NAMED_METRIC_GROUPS.filter((name) => name in groups)
  const rest = Object.keys(groups)
    .filter((name) => !NAMED_METRIC_GROUPS.includes(name as (typeof NAMED_METRIC_GROUPS)[number]))
    .sort()

  return [...named, ...rest]
}

/** Flattens a metric tree to `path -> value` so a panel can list it without knowing its shape. */
export function flattenMetrics(values: MetricValues, prefix = ''): [string, number][] {
  return Object.entries(values).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`

    return typeof value === 'number' ? [[path, value] as [string, number]] : flattenMetrics(value, path)
  })
}
