import assert from 'node:assert/strict'
import test from 'node:test'
import { sortByStartedAt, splitMeasuredSegments, splitTrustedSegments } from './chartModel'
import { parseBuildPerformance, parseRunPerformance } from './performanceApi'
import { mockBuildPerformance, mockRunPerformance } from './performanceMock'
import { isLowConfidence } from './performanceTypes'

test('null points split lines without turning missing values into zero', () => {
  const points = [{ value: 1 }, { value: 0 }, { value: null }, { value: null }, { value: 2 }]
  assert.deepEqual(splitMeasuredSegments(points, (point) => point.value), [[points[0], points[1]], [points[4]]])
})

test('mock boundaries pass the same strict parser as server payloads', () => {
  assert.equal(parseRunPerformance(mockRunPerformance('10')).summary, null)
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

test('server point order is retained while only build runs are sorted', () => {
  const run = parseRunPerformance(mockRunPerformance('13'))
  assert.deepEqual(run.series.points.map((point) => point.atMs), [0, 1000, 2000, 3000, 4000, 5000])
  const input = [{ startedAt: '2026-02-02' }, { startedAt: '2026-01-01' }]
  assert.deepEqual(sortByStartedAt(input).map((run) => run.startedAt), ['2026-01-01', '2026-02-02'])
  assert.deepEqual(input.map((run) => run.startedAt), ['2026-02-02', '2026-01-01'])
})

test('low-confidence runs remain present but break trusted trend lines', () => {
  const runs = parseBuildPerformance(mockBuildPerformance('3', '99')).runs
  const segments = splitTrustedSegments(runs, isLowConfidence)
  assert.equal(runs.length, 5)
  assert.deepEqual(segments.map((segment) => segment.map((run) => run.runId)), [[1200, 1201], [1204]])
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
