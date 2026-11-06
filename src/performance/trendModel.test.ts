import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseBuildPerformance } from './performanceApi'
import { mockBuildPerformance } from './performanceFixtures'
import { axisTicks, buildDigest, difference, latestPair, niceCeil, trendValue } from './trendModel'

const runs = parseBuildPerformance(mockBuildPerformance('1', '7')).runs

describe('trendValue', () => {
  it('keeps an undetermined budget as null rather than a ratio of zero', () => {
    // 1203 has no budget in the fixture.
    const run = runs.find((one) => one.budgetMs === null)
    assert.ok(run)
    assert.equal(trendValue(run, 'p95BudgetRatio'), null)
  })

  it('keeps an unmeasured working set as null', () => {
    const run = runs.find((one) => one.workingSetBytesMax === null)
    assert.ok(run)
    assert.equal(trendValue(run, 'workingSetBytesMax'), null)
  })

  it('divides p95 by the run budget', () => {
    const run = runs[0]
    assert.equal(trendValue(run, 'p95BudgetRatio'), run.frameP95Ms / (run.budgetMs as number))
  })
})

describe('niceCeil and axisTicks', () => {
  it('rounds up to a readable top', () => {
    assert.equal(niceCeil(4.7), 5)
    assert.equal(niceCeil(1.3), 2)
    assert.equal(niceCeil(23), 25)
    assert.equal(niceCeil(0), 1)
  })

  it('spaces ticks evenly from zero to the top', () => {
    assert.deepEqual(axisTicks(5), [0, 1.25, 2.5, 3.75, 5])
  })
})

describe('buildDigest', () => {
  it('leaves low-confidence runs out of the sparkline but counts them', () => {
    const digest = buildDigest(runs)
    assert.equal(digest.runCount, 5)
    assert.equal(digest.latest, runs[4].hitchesPerMinute)
    // Runs 1202 (low coverage) and 1203 (discharging) are cut.
    assert.deepEqual(digest.spark, [runs[0], runs[1], runs[4]].map((run) => run.hitchesPerMinute))
  })

  it('has no latest value without runs', () => {
    assert.deepEqual(buildDigest([]), { runCount: 0, latest: null, spark: [] })
  })
})

describe('latestPair and difference', () => {
  it('has no previous run when there is one run', () => {
    assert.deepEqual(latestPair([1]), { latest: 1, previous: null })
  })

  it('gives no difference when either side was not measured', () => {
    assert.equal(difference(3, null), null)
    assert.equal(difference(null, 3), null)
    assert.equal(difference(3, 1), 2)
  })
})
