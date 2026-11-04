import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TrendBucket, TrendBuild } from './qaVerdictTrendApi'
import { buildMarks, dayKey, rollingPassRate, splitAt, summarizeTrend, trendSlots, weekKey } from './trendModel'

const bucket = (key: string, passed: number, failed: number, regression = 0, undecided = 0, extra: Partial<TrendBucket> = {}): TrendBucket => ({
  key,
  startedAt: null,
  runs: 1,
  passed,
  failed,
  regression,
  undecided,
  topFailing: null,
  ...extra,
})
const build = (version: string, createdAt: string): TrendBuild => ({ gameBuildId: version, version, isEditor: false, createdAt })
const SEOUL = 'Asia/Seoul'

describe('dayKey · weekKey', () => {
  it('cuts the day in the given time zone, as the server does', () => {
    // 2026-10-04 23:30 UTC 는 서울에서 10-05 08:30 이다.
    assert.equal(dayKey(new Date('2026-10-04T23:30:00Z'), SEOUL), '2026-10-05')
    assert.equal(dayKey(new Date('2026-10-04T23:30:00Z'), 'UTC'), '2026-10-04')
    assert.equal(weekKey('2026-10-04'), '2026-09-28')
    assert.equal(weekKey('2026-10-05'), '2026-10-05')
  })
})

describe('trendSlots', () => {
  it('fills the days without a verdict so bars keep the calendar spacing', () => {
    const slots = trendSlots([bucket('2026-10-02', 3, 1)], 'DAY', new Date('2026-09-30T15:00:00Z'), new Date('2026-10-03T15:00:00Z'), SEOUL)
    assert.deepEqual(slots.map((slot) => slot.key), ['2026-10-01', '2026-10-02', '2026-10-03'])
    assert.equal(slots[1].judged, 4)
    assert.equal(slots[1].passRate, 0.75)
    assert.equal(slots[0].passRate, null)
  })

  it('fills weeks by Monday and leaves runs as they came', () => {
    const weeks = trendSlots([], 'WEEK', new Date('2026-09-30T15:00:00Z'), new Date('2026-10-12T15:00:00Z'), SEOUL)
    assert.deepEqual(weeks.map((slot) => slot.key), ['2026-09-28', '2026-10-05', '2026-10-12'])
    assert.equal(trendSlots([bucket('9', 1, 0), bucket('12', 0, 1)], 'RUN', new Date(0), new Date(1), SEOUL).length, 2)
  })
})

describe('rollingPassRate', () => {
  it('weights each day by how many verdicts it had', () => {
    const slots = trendSlots([bucket('2026-10-01', 1, 0), bucket('2026-10-02', 0, 9)], 'DAY', new Date('2026-09-30T15:00:00Z'), new Date('2026-10-02T15:00:00Z'), SEOUL)
    // 하루씩 평균하면 50% 지만, 판정 10건 중 1건 통과라 10% 다.
    assert.deepEqual(rollingPassRate(slots, 7), [1, 0.1])
    assert.deepEqual(rollingPassRate(slots, 1), [1, 0])
  })
})

describe('summarizeTrend', () => {
  it('compares with the period before and finds the worst day after a build', () => {
    const all = trendSlots(
      [bucket('2026-10-01', 8, 2), bucket('2026-10-03', 9, 1), bucket('2026-10-04', 1, 3, 1, 4), bucket('2026-10-05', 0, 1)],
      'DAY',
      new Date('2026-09-30T15:00:00Z'),
      new Date('2026-10-05T15:00:00Z'),
      SEOUL,
    )
    const { current, previous } = splitAt(all, new Date('2026-10-02T15:00:00Z'), 'DAY', SEOUL)
    assert.deepEqual(current.map((slot) => slot.key), ['2026-10-03', '2026-10-04', '2026-10-05'])
    const summary = summarizeTrend(current, previous, [build('1.4.0', '2026-10-01T03:00:00Z'), build('1.5.0', '2026-10-09T03:00:00Z')], 'DAY', SEOUL)
    assert.equal(summary.judged, 16)
    assert.equal(summary.passRate, 10 / 16)
    assert.equal(summary.previousPassRate, 0.8)
    assert.equal(summary.failed, 5)
    assert.equal(summary.regression, 1)
    assert.equal(summary.undecided, 4)
    assert.equal(summary.undecidedPeak?.key, '2026-10-04')
    // 10-05 는 판정 1건이라 꼴찌 후보가 아니다.
    assert.equal(summary.worst?.key, '2026-10-04')
    assert.deepEqual(summary.worstAfter && { version: summary.worstAfter.build.version, days: summary.worstAfter.days }, { version: '1.4.0', days: 3 })
  })
})

describe('buildMarks', () => {
  it('puts a build on the day it came up in the time zone', () => {
    const slots = trendSlots([], 'DAY', new Date('2026-09-30T15:00:00Z'), new Date('2026-10-03T15:00:00Z'), SEOUL)
    const marks = buildMarks(slots, [build('1.4.0', '2026-10-01T16:00:00Z'), build('0.9', '2026-09-01T00:00:00Z')], 'DAY', SEOUL)
    assert.deepEqual(marks.map((mark) => [mark.index, mark.build.version]), [[1, '1.4.0']])
  })
})
