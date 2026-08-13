import type { BuildPerformance, RunPerformance } from './performanceTypes'

const points = [
  [0, 16.6, 18.3, 22, 0, 18, 780_000_000, true],
  [1000, 17.1, 22.4, 41, 1, 22, 802_000_000, true],
  [2000, null, null, null, null, null, null, false],
  [3000, null, null, null, null, null, null, false],
  [4000, 16.8, 19.2, 24, 0, 0, 0, true],
  [5000, 21.2, 38.7, 92, 2, 48, 846_000_000, true],
] as const

export function mockRunPerformance(runId: string): RunPerformance {
  const empty = runId.endsWith('0')
  const noProcess = runId.endsWith('1')
  const noBudget = runId.endsWith('2')
  return {
    runId: Number(runId), gameInstanceId: 77, gameBuildId: 9,
    startedAt: '2026-08-13T02:10:00Z', completedAt: '2026-08-13T02:24:31Z',
    summary: empty ? null : {
      sampleCount: 871, coveredMs: 4_000, coverageRatio: 0.67,
      frameMeanMs: 17.9, frameP95Ms: 26.2, frameP99Ms: 92, onePercentLowFps: 10.9,
      hitchCount: 3, hitchesPerMinute: 45, budgetMs: noBudget ? null : 16.67,
      cpuPercentMean: noProcess ? null : 22, cpuPercentMax: noProcess ? null : 48,
      workingSetBytesMax: noProcess ? null : 846_000_000,
      gcCollections: { gen0: 12, gen1: 2, gen2: 0 }, dischargingRatio: 0.35,
      processSampleRatio: noProcess ? 0 : 0.67,
    },
    device: null,
    series: {
      bucketMs: 1000,
      points: empty ? [] : points.map(([atMs, frameMeanMs, frameP95Ms, frameMaxMs, hitchCount, cpuPercent, workingSetBytes, isFocused]) => ({
        atMs, frameMeanMs, frameP95Ms, frameMaxMs, hitchCount, cpuPercent: noProcess ? null : cpuPercent,
        workingSetBytes: noProcess ? null : workingSetBytes, isFocused,
      })),
    },
  }
}

export function mockBuildPerformance(projectId: string, buildId: string): BuildPerformance {
  const count = buildId.endsWith('0') ? 0 : buildId.endsWith('1') ? 1 : 5
  const budgets = [33.33, 6.94, 16.67, null, 16.67]
  return {
    projectId: Number(projectId), gameBuildId: Number(buildId),
    runs: Array.from({ length: count }, (_, index) => ({
      runId: 1200 + index, startedAt: `2026-08-${String(8 + index).padStart(2, '0')}T02:10:00Z`,
      durationMs: 300_000 + index * 50_000, status: 'COMPLETED', frameMeanMs: 18 + index,
      frameP95Ms: 28 + index * 2, frameP99Ms: 45 + index * 6, onePercentLowFps: 18 - index,
      hitchesPerMinute: [1.2, 2.1, 1.8, 4.7, 3.5][index], budgetMs: budgets[index],
      cpuPercentMean: index === 3 ? null : 22 + index, workingSetBytesMax: index === 3 ? null : 800_000_000 + index * 20_000_000,
      coverageRatio: index === 2 ? 0.61 : 0.96, dischargingRatio: index === 3 ? 0.48 : 0,
      processSampleRatio: index === 3 ? 0 : 1,
    })),
  }
}
