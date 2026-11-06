import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCriteriaState, parseProgress, type BuildVerificationSummary, type ReleaseCriteria } from './releaseApi'
import { daysToFinish, evaluateRelease, inconclusiveRateOf, passRateOf } from './releaseModel'

const DEFAULTS: ReleaseCriteria = { maxPending: 0, maxRegression: 0, minPassRate: 95, maxOpenBlockers: 0, maxInconclusiveRate: 5 }

function summary(overrides: Partial<BuildVerificationSummary>): BuildVerificationSummary {
  return {
    build: { gameBuildId: '1', version: '1.4.1', isEditor: true, createdAt: '2026-11-01T00:00:00Z' },
    total: 99,
    passed: 63,
    failed: 12,
    regression: 4,
    inconclusive: 3,
    pending: 17,
    carried: 0,
    openBlockers: 2,
    lastJudgedAt: null,
    ...overrides,
  }
}

describe('evaluateRelease', () => {
  it('판정 전 TC 가 기준보다 많으면 검증 중이다', () => {
    const readiness = evaluateRelease(summary({}), DEFAULTS)
    assert.equal(readiness.level, 'verifying')
    assert.deepEqual(readiness.gates.map((gate) => gate.met), [false, false, false, false, true])
    assert.equal(readiness.met, 1)
  })

  it('다 판정했지만 기준 미달이면 출시 후보, 모두 충족이면 출시 가능이다', () => {
    assert.equal(evaluateRelease(summary({ pending: 0, passed: 80 }), DEFAULTS).level, 'candidate')
    const ready = summary({ total: 99, passed: 95, failed: 3, regression: 0, inconclusive: 1, pending: 0, openBlockers: 0 })
    assert.equal(evaluateRelease(ready, DEFAULTS).level, 'ready')
  })

  it('숫자를 바꾸면 같은 빌드도 판정이 바뀐다', () => {
    const almost = summary({ passed: 92, failed: 8, regression: 0, inconclusive: 0, pending: 0, total: 100, openBlockers: 0 })
    assert.equal(evaluateRelease(almost, DEFAULTS).level, 'candidate')
    assert.equal(evaluateRelease(almost, { ...DEFAULTS, minPassRate: 90 }).level, 'ready')
  })
})

describe('rates', () => {
  it('통과율은 내리고 판정 못함은 올린다', () => {
    // 189 / 200 = 94.5% → 94, 기준 95 에 미달로 보이는 숫자와 판정이 같다
    assert.equal(passRateOf({ passed: 189, failed: 11, regression: 0, inconclusive: 0 }), 94)
    assert.equal(inconclusiveRateOf({ inconclusive: 1, total: 99 }), 2)
    assert.equal(passRateOf({ passed: 0, failed: 0, regression: 0, inconclusive: 0 }), 0)
  })
})

describe('daysToFinish', () => {
  const day = (date: string, passed: number) => ({ date, passed, failed: 0, regression: 0, inconclusive: 0, runs: 0 })

  it('최근 하루 평균으로 남은 날을 잰다', () => {
    assert.deepEqual(daysToFinish([day('11-01', 0), day('11-02', 10), day('11-03', 20)], 30), { days: 3, perDay: 10 })
  })

  it('사흘이 안 되거나 판정이 늘지 않으면 null 이다', () => {
    assert.equal(daysToFinish([day('11-01', 0), day('11-02', 10)], 30), null)
    assert.equal(daysToFinish([day('11-01', 5), day('11-02', 5), day('11-03', 5)], 30), null)
    assert.equal(daysToFinish([day('11-01', 0), day('11-02', 10), day('11-03', 20)], 0), null)
  })
})

describe('parsers', () => {
  it('진행과 기준 응답을 읽고 모양이 틀리면 null 이다', () => {
    const progress = parseProgress({
      summary: { build: { gameBuildId: '11', version: '1.4.1', isEditor: true, createdAt: 'x' }, total: 4, passed: 2, openBlockers: 1 },
      previousBuild: null,
      timeZone: 'Asia/Seoul',
      days: [{ date: '2026-11-04', passed: 2, runs: 1 }, { nope: true }],
    })
    assert.equal(progress?.summary.failed, 0)
    assert.equal(progress?.days.length, 1)
    assert.equal(parseProgress({ summary: {} }), null)
    assert.equal(parseCriteriaState({ criteria: DEFAULTS, defaults: DEFAULTS, isDefault: true })?.criteria.minPassRate, 95)
    assert.equal(parseCriteriaState({ criteria: DEFAULTS }), null)
  })
})
