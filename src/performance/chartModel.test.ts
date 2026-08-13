import assert from 'node:assert/strict'
import test from 'node:test'
import { findGapRanges, sortByStartedAt, splitMeasuredSegments, splitTrustedSegments } from './chartModel'
import { parseBuildPerformance, parseRunPerformance } from './performanceApi'
import { mockBuildPerformance, mockRunPerformance } from './performanceMock'
import {
  budgetRatio,
  isFrameRateUncapped,
  isLowConfidence,
  readRefreshRateHz,
} from './performanceTypes'

test('null points split lines without turning missing values into zero', () => {
  const points = [{ value: 1 }, { value: 0 }, { value: null }, { value: null }, { value: 2 }]

  assert.deepEqual(splitMeasuredSegments(points, (point) => point.value), [
    [points[0], points[1]],
    [points[4]],
  ])
})

test('consecutive unmeasured points become one shaded gap, and a measured zero none', () => {
  const points = [{ value: 1 }, { value: null }, { value: null }, { value: 0 }, { value: null }]

  assert.deepEqual(findGapRanges(points, (point) => point.value), [
    { from: 1, to: 2 },
    { from: 4, to: 4 },
  ])
  assert.deepEqual(findGapRanges([{ value: 0 }], (point) => point.value), [])
})

test('mock boundaries pass the same strict parser as server payloads', () => {
  assert.equal(parseRunPerformance(mockRunPerformance('10')).summary, null)
  assert.deepEqual(parseRunPerformance(mockRunPerformance('10')).series.points, [])

  const noProcess = parseRunPerformance(mockRunPerformance('11'))
  assert.equal(noProcess.summary?.processSampleRatio, 0)
  assert.equal(noProcess.series.points[0].cpuPercent, null)

  const noBudget = parseRunPerformance(mockRunPerformance('12'))
  assert.equal(noBudget.summary?.budgetMs, null)

  const measuredZero = parseRunPerformance(mockRunPerformance('13')).series.points[4]
  assert.equal(measuredZero.cpuPercent, 0)
  assert.equal(measuredZero.workingSetBytes, 0)

  assert.equal(parseBuildPerformance(mockBuildPerformance('3', '10')).runs.length, 0)
  assert.equal(parseBuildPerformance(mockBuildPerformance('3', '11')).runs.length, 1)
})

test('a measured bucket can still be missing its process samples', () => {
  const point = parseRunPerformance(mockRunPerformance('13')).series.points[6]

  assert.equal(point.isFocused, true)
  assert.equal(point.frameMeanMs, 17.4)
  assert.equal(point.cpuPercent, null)
  assert.equal(point.workingSetBytes, null)
})

test('the unmeasured window is one gap on frames but leaves process gaps of its own', () => {
  const points = parseRunPerformance(mockRunPerformance('13')).series.points

  assert.deepEqual(findGapRanges(points, (point) => point.frameMeanMs), [{ from: 2, to: 3 }])
  assert.deepEqual(points.slice(2, 4).map((point) => point.isFocused), [false, false])
  assert.deepEqual(findGapRanges(points, (point) => point.cpuPercent), [
    { from: 2, to: 3 },
    { from: 6, to: 6 },
  ])
})

test('server point order is retained while only build runs are sorted', () => {
  const run = parseRunPerformance(mockRunPerformance('13'))

  assert.deepEqual(
    run.series.points.map((point) => point.atMs),
    [0, 1000, 2000, 3000, 4000, 5000, 6000],
  )

  const input = [{ startedAt: '2026-02-02' }, { startedAt: '2026-01-01' }]
  assert.deepEqual(sortByStartedAt(input).map((run) => run.startedAt), ['2026-01-01', '2026-02-02'])
  assert.deepEqual(input.map((run) => run.startedAt), ['2026-02-02', '2026-01-01'])
})

test('low-confidence runs remain present but break trusted trend lines', () => {
  const runs = parseBuildPerformance(mockBuildPerformance('3', '99')).runs
  const segments = splitTrustedSegments(runs, isLowConfidence)

  assert.equal(runs.length, 5)
  assert.deepEqual(
    segments.map((segment) => segment.map((run) => run.runId)),
    [[1200, 1201], [1204]],
  )
})

test('malformed contract payload fails before rendering', () => {
  assert.throws(() => parseRunPerformance({ runId: 1 }), /Malformed performance response/)
  assert.throws(() => parseBuildPerformance({ gameBuildId: 1, projectId: 2 }), /Malformed performance response/)
})

test('contract thresholds exclude exact boundary and flag values beyond it', () => {
  assert.equal(isLowConfidence({ coverageRatio: 0.8, dischargingRatio: 0.2 }), false)
  assert.equal(isLowConfidence({ coverageRatio: 0.79, dischargingRatio: 0 }), true)
  assert.equal(isLowConfidence({ coverageRatio: 1, dischargingRatio: 0.21 }), true)
})

test('the same frame time reads differently against each budget', () => {
  assert.equal(budgetRatio(33.33, 33.33), 1)
  assert.equal((budgetRatio(33.33, 6.94) ?? 0) > 4, true)
  assert.equal(budgetRatio(33.33, null), null)
})

test('device context separates an unreadable display from a real value', () => {
  const standalone = parseRunPerformance(mockRunPerformance('13')).device
  assert.equal(standalone?.isEditor, false)
  assert.equal(readRefreshRateHz(standalone!), 143.98)
  assert.equal(isFrameRateUncapped(standalone!), true)

  const editor = parseRunPerformance(mockRunPerformance('14')).device
  assert.equal(editor?.isEditor, true)
  // 0 Hz is the SDK saying it could not read the display, not a zero refresh rate.
  assert.equal(readRefreshRateHz(editor!), null)
  assert.equal(isFrameRateUncapped(editor!), false)

  assert.equal(parseRunPerformance(mockRunPerformance('15')).device, null)
})

test('a device field the server omits costs that row, not the whole response', () => {
  const payload = mockRunPerformance('13') as unknown as { device: Record<string, unknown> }
  delete payload.device.graphicsDeviceName

  assert.equal(parseRunPerformance(payload).device?.graphicsDeviceName, null)
  assert.equal(parseRunPerformance(payload).device?.scriptingBackend, 'Mono')
})
