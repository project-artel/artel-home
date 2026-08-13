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

export type RunPerformance = {
  runId: number
  gameInstanceId: number
  gameBuildId: number | null
  startedAt: string
  completedAt: string | null
  summary: PerformanceSummary | null
  device: Record<string, unknown> | null
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

export type BuildPerformance = { gameBuildId: number; projectId: number; runs: BuildPerformanceRun[] }

export const LOW_COVERAGE_RATIO = 0.8
export const HIGH_DISCHARGING_RATIO = 0.2

export function isLowConfidence(run: Pick<BuildPerformanceRun, 'coverageRatio' | 'dischargingRatio'>) {
  return run.coverageRatio < LOW_COVERAGE_RATIO || run.dischargingRatio > HIGH_DISCHARGING_RATIO
}
