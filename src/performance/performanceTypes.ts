/**
 * The performance contract, as the Notion documents
 * "성능 지표 런 상세 조회" and "성능 지표 빌드 추세 조회" define it.
 *
 * One rule shapes every type here: `null` means "not measured" and `0` means
 * "measured, and it was zero". Nothing in this module may collapse the two.
 */

export type PerformancePoint = {
  atMs: number
  frameMeanMs: number | null
  frameP95Ms: number | null
  frameMaxMs: number | null
  hitchCount: number | null
  cpuPercent: number | null
  workingSetBytes: number | null
  isFocused: boolean
}

/** Point fields the charts can plot, so a series key cannot name `isFocused`. */
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
