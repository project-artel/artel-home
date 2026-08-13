import type { BuildPerformance, RunPerformance } from './performanceTypes'

/**
 * Development fixtures for the performance screens.
 *
 * These exist to reproduce the boundaries the contract allows but a healthy
 * server rarely produces, so the screens can be checked against them before
 * the real API lands. They are shaped as raw JSON and go through the same
 * strict parser as a server response — a fixture that drifts from the contract
 * fails the test suite rather than quietly teaching the UI a wrong shape.
 *
 * Which boundary comes back is chosen by the last digit of the id.
 */

const STANDALONE_DEVICE = {
  isEditor: false,
  scriptingBackend: 'Mono',
  sdkVersion: '0.1.0',
  deviceModel: 'Custom Desktop',
  processorType: 'AMD Ryzen 9 5900X 12-Core Processor',
  processorCount: 24,
  graphicsDeviceName: 'NVIDIA GeForce RTX 3080',
  graphicsDeviceType: 'Direct3D11',
  operatingSystem: 'Windows 11 (10.0.22631) 64bit',
  targetFrameRate: -1,
  vSyncCount: 1,
  refreshRateHz: 143.98,
}

/** An editor capture, which the build trend excludes but a run detail can show. */
const EDITOR_DEVICE = {
  ...STANDALONE_DEVICE,
  isEditor: true,
  targetFrameRate: 60,
  vSyncCount: 0,
  // The SDK pushes 0 when it cannot read the display; the screen must not print "0 Hz".
  refreshRateHz: 0,
}

/**
 * `atMs, frameMeanMs, frameP95Ms, frameMaxMs, hitchCount, cpuPercent, workingSetBytes, isFocused`
 *
 * Two shapes matter here and must not be confused with each other: the pair at
 * 2000/3000 is an unmeasured window (focus lost), while 4000 is a bucket that
 * was measured and genuinely idle. 6000 is measured frames without `process`,
 * which is the gap the contract says can appear on its own.
 */
const POINTS = [
  [0, 16.6, 18.3, 22, 0, 18, 780_000_000, true],
  [1000, 17.1, 22.4, 41, 1, 22, 802_000_000, true],
  [2000, null, null, null, null, null, null, false],
  [3000, null, null, null, null, null, null, false],
  [4000, 16.8, 19.2, 24, 0, 0, 0, true],
  [5000, 21.2, 38.7, 92, 2, 48, 846_000_000, true],
  [6000, 17.4, 20.1, 25, 0, null, null, true],
] as const

export function mockRunPerformance(runId: string): RunPerformance {
  const noSamples = runId.endsWith('0')
  const noProcess = runId.endsWith('1')
  const noBudget = runId.endsWith('2')
  const editor = runId.endsWith('4')
  const noDevice = runId.endsWith('5')

  const device = noDevice ? null : editor ? EDITOR_DEVICE : STANDALONE_DEVICE

  return {
    runId: Number(runId),
    gameInstanceId: 77,
    gameBuildId: 9,
    startedAt: '2026-08-13T02:10:00Z',
    completedAt: '2026-08-13T02:24:31Z',
    summary: noSamples
      ? null
      : {
          sampleCount: 871,
          coveredMs: 5_000,
          coverageRatio: 0.67,
          frameMeanMs: 17.9,
          frameP95Ms: 26.2,
          frameP99Ms: 92,
          onePercentLowFps: 10.9,
          hitchCount: 3,
          hitchesPerMinute: 45,
          budgetMs: noBudget ? null : 16.67,
          cpuPercentMean: noProcess ? null : 22,
          cpuPercentMax: noProcess ? null : 48,
          workingSetBytesMax: noProcess ? null : 846_000_000,
          gcCollections: { gen0: 12, gen1: 2, gen2: 0 },
          dischargingRatio: 0.35,
          processSampleRatio: noProcess ? 0 : 0.67,
        },
    device,
    series: {
      bucketMs: 1000,
      points: noSamples
        ? []
        : POINTS.map(
            ([
              atMs,
              frameMeanMs,
              frameP95Ms,
              frameMaxMs,
              hitchCount,
              cpuPercent,
              workingSetBytes,
              isFocused,
            ]) => ({
              atMs,
              frameMeanMs,
              frameP95Ms,
              frameMaxMs,
              hitchCount,
              cpuPercent: noProcess ? null : cpuPercent,
              workingSetBytes: noProcess ? null : workingSetBytes,
              isFocused,
            }),
          ),
    },
  }
}

/**
 * Run 1203 is the low-confidence one: it discharged and has no `process`
 * samples. Run 1202 has low coverage. The budgets differ on purpose — the same
 * absolute frame time is healthy under 33.33 ms and broken under 6.94 ms.
 */
export function mockBuildPerformance(projectId: string, buildId: string): BuildPerformance {
  const runCount = buildId.endsWith('0') ? 0 : buildId.endsWith('1') ? 1 : 5
  const budgets = [33.33, 6.94, 16.67, null, 16.67]
  const hitchesPerMinute = [1.2, 2.1, 1.8, 4.7, 3.5]

  return {
    projectId: Number(projectId),
    gameBuildId: Number(buildId),
    runs: Array.from({ length: runCount }, (_, index) => ({
      runId: 1200 + index,
      startedAt: `2026-08-${String(8 + index).padStart(2, '0')}T02:10:00Z`,
      durationMs: 300_000 + index * 50_000,
      status: 'COMPLETED',
      frameMeanMs: 18 + index,
      frameP95Ms: 28 + index * 2,
      frameP99Ms: 45 + index * 6,
      onePercentLowFps: 18 - index,
      hitchesPerMinute: hitchesPerMinute[index],
      budgetMs: budgets[index],
      cpuPercentMean: index === 3 ? null : 22 + index,
      workingSetBytesMax: index === 3 ? null : 800_000_000 + index * 20_000_000,
      coverageRatio: index === 2 ? 0.61 : 0.96,
      dischargingRatio: index === 3 ? 0.48 : 0,
      processSampleRatio: index === 3 ? 0 : 1,
    })),
  }
}
