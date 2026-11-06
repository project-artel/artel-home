import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBuildPerformance, parseRunPerformance } from './performanceApi'
import { mockBuildPerformance, mockRunPerformance } from './performanceFixtures'

/**
 * The parser is the executable half of the contract, so these tests are written
 * against the rule rather than against the current server: the envelope is
 * strict, group interiors are lenient. Both halves have to be pinned — a parser
 * that is strict everywhere breaks the site on every server-first deploy, and one
 * that is lenient everywhere lets a malformed payload become a plausible chart.
 */

function runPayload(overrides: Record<string, unknown> = {}) {
  return {
  runId: 1,
  gameInstanceId: 7,
  gameBuildId: 3,
  startedAt: '2026-08-18T00:00:00Z',
  completedAt: '2026-08-18T00:10:00Z',
  summary: {
    sampleCount: 10,
    coveredMs: 10000,
    coverageRatio: 0.99,
    frameMeanMs: 16.7,
    frameP95Ms: 21,
    frameP99Ms: 40,
    onePercentLowFps: 25,
    hitchCount: 3,
    hitchesPerMinute: 18,
    budgetMs: 16.67,
    cpuPercentMean: 20,
    cpuPercentMax: 41,
    workingSetBytesMax: 900,
    gcCollections: { gen0: 1, gen1: 0, gen2: 0 },
    dischargingRatio: 0,
    processSampleRatio: 1,
    ...overrides,
  },
  device: null,
  series: { bucketMs: 1000, points: [] },
  }
}

test('keeps a group this build has never heard of', () => {
  const parsed = parseRunPerformance(
    runPayload({
      groups: {
        groupFromTheFuture: { availability: 'MEASURED', sampleRatio: 1, metrics: { odd: 4 } },
      },
    }),
  )

  // Server-first deploys are the normal order. An unknown group is expected traffic.
  assert.equal(parsed.summary?.groups.groupFromTheFuture.availability, 'MEASURED')
  assert.deepEqual(parsed.summary?.groups.groupFromTheFuture.metrics, { odd: 4 })
})

test('ignores unknown fields inside a known group', () => {
  const parsed = parseRunPerformance(
    runPayload({
      groups: {
        gc: { availability: 'MEASURED', sampleRatio: 1, metrics: { gcUsedBytesMax: 8 }, futureField: 'x' },
      },
    }),
  )

  assert.deepEqual(parsed.summary?.groups.gc.metrics, { gcUsedBytesMax: 8 })
})

test('keeps the three availability states apart', () => {
  const parsed = parseRunPerformance(
    runPayload({
      groups: {
        gc: { availability: 'MEASURED', sampleRatio: 0.5, metrics: { a: 1 } },
        renderCounters: { availability: 'UNSUPPORTED', sampleRatio: 0, metrics: null, source: 'PROFILER_RECORDER' },
        sdkOverhead: { availability: 'NOT_REPORTED', sampleRatio: 0, metrics: null },
      },
    }),
  )
  const groups = parsed.summary!.groups

  assert.equal(groups.gc.availability, 'MEASURED')
  assert.equal(groups.renderCounters.availability, 'UNSUPPORTED')
  assert.equal(groups.renderCounters.source, 'PROFILER_RECORDER')
  assert.equal(groups.sdkOverhead.availability, 'NOT_REPORTED')
})

test('drops values on a group that is not MEASURED', () => {
  const parsed = parseRunPerformance(
    runPayload({
      groups: { gc: { availability: 'UNSUPPORTED', sampleRatio: 0, metrics: { leftOver: 9 } } },
    }),
  )

  // Otherwise an unsupported group renders as if the counters had been read.
  assert.equal(parsed.summary?.groups.gc.metrics, null)
})

test('degrades an availability state it does not recognise instead of throwing', () => {
  const parsed = parseRunPerformance(
    runPayload({ groups: { gc: { availability: 'SOMETHING_NEW', sampleRatio: 1, metrics: { a: 1 } } } }),
  )

  assert.equal(parsed.summary?.groups.gc.availability, 'NOT_REPORTED')
  assert.equal(parsed.summary?.groups.gc.metrics, null)
})

test('treats a response with no groups key as a run that reported none', () => {
  assert.deepEqual(parseRunPerformance(runPayload()).summary?.groups, {})
})

test('still rejects a malformed fixed field', () => {
  // Leniency is scoped to group interiors. The envelope decides whether a build
  // regressed, so drift there has to surface rather than draw a plausible chart.
  assert.throws(() => parseRunPerformance(runPayload({ frameMeanMs: 'fast' })), /summary\.frameMeanMs/)
})

test('rejects a groups envelope that is not an object', () => {
  assert.throws(() => parseRunPerformance(runPayload({ groups: [] })), /summary\.groups/)
})

test('reads groups on series points without an availability of their own', () => {
  const payload = runPayload()
  const parsed = parseRunPerformance({
    ...payload,
    series: {
      bucketMs: 1000,
      points: [
        {
          atMs: 0,
          frameMeanMs: 16,
          frameP95Ms: 18,
          frameMaxMs: 20,
          hitchCount: 0,
          cpuPercent: null,
          workingSetBytes: null,
          isFocused: true,
          groups: { gc: { metrics: { collections: { gen0: 2 } } } },
        },
        {
          atMs: 1000,
          frameMeanMs: null,
          frameP95Ms: null,
          frameMaxMs: null,
          hitchCount: null,
          cpuPercent: null,
          workingSetBytes: null,
          isFocused: false,
        },
      ],
    },
  })

  assert.deepEqual(parsed.series.points[0].groups.gc.metrics, { collections: { gen0: 2 } })
  // A bucket with no samples carries no group keys, not empty ones.
  assert.deepEqual(parsed.series.points[1].groups, {})
})

// The fixtures below are shapes a healthy server rarely produces. If the parser
// stops accepting one, the screens have quietly lost a case they were built for.

test('every run boundary fixture still parses', () => {
  for (const id of ['1', '2', '3', '4', '5', '6']) {
    assert.doesNotThrow(() => parseRunPerformance(mockRunPerformance(id)), `run fixture ${id}`)
  }
})

test('every build boundary fixture still parses', () => {
  // 0 runs, 1 run, and many runs — the trend screen has to survive all three.
  for (const id of ['10', '1', '2']) {
    assert.doesNotThrow(() => parseBuildPerformance(mockBuildPerformance('1', id)), `build fixture ${id}`)
  }
})

test('carries a different render source on alternating runs', () => {
  const build = parseBuildPerformance(mockBuildPerformance('1', '2'))
  const sources = build.runs.map((run) => run.groups.renderCounters?.source)

  // Nothing may draw one line across these. The build screen lists them per run.
  assert.ok(new Set(sources).size > 1)
})
