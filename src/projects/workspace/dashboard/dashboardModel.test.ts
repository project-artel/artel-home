import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TestCase, VerificationStatus } from '../../../testCases/testCaseTypes'
import type { VersionCaseRow, VersionPresence } from '../../../testCases/testCaseVersions'
import { compareVersions, costByRun, countByDay, countByWeek, scenarioHistories, weekStarts } from './dashboardModel'

const row = (id: string, now: VerificationStatus | null, before: VerificationStatus | null, presence: VersionPresence = 'BOTH'): VersionCaseRow => ({
  testCase: { id } as TestCase,
  origin: 'MAP',
  verificationStatus: now,
  compareVerificationStatus: before,
  presence,
})

describe('compareVersions', () => {
  it('splits what is left by how it went in the previous build, and counts what changed', () => {
    // 1.1-e2e 를 1.0 과 견준 실측과 같은 꼴: 실패→판정 전, 통과→판정 전, 처음, 고쳐짐, 그대로 실패, 빠진 TC.
    const result = compareVersions(
      [
        row('1', 'DRAFT', 'FAILED'),
        row('2', 'DRAFT', 'REGRESSION'),
        row('3', 'DRAFT', 'VERIFIED'),
        row('4', 'DRAFT', 'DRAFT'),
        row('5', 'VERIFIED', 'FAILED'),
        row('6', 'FAILED', 'FAILED'),
        row('7', 'FAILED', 'VERIFIED'),
        row('8', 'VERIFIED', 'VERIFIED'),
        row('9', null, 'VERIFIED', 'ONLY_OTHER'),
        row('10', 'DRAFT', null, 'ONLY_THIS'),
      ],
      true,
    )
    assert.deepEqual(result.remaining, { wasFailing: ['1', '2'], wasPassing: ['3'], firstTime: ['4', '10'] })
    assert.equal(result.total, 9)
    assert.equal(result.fixed, 1)
    assert.equal(result.broke, 1)
    assert.equal(result.stillFailing, 1)
    assert.equal(result.dropped, 1)
    assert.equal(result.added, 1)
    assert.deepEqual(result.current, { passed: 2, failed: 2, regression: 0, pending: 5, broken: 0 })
    assert.deepEqual(result.previous, { passed: 4, failed: 3, regression: 1, pending: 1, broken: 0 })
  })

  it('has nothing to compare when there is one build', () => {
    const result = compareVersions([row('1', 'DRAFT', null, 'BOTH'), row('2', 'VERIFIED', null)], false)
    assert.equal(result.previous, null)
    assert.deepEqual(result.remaining.firstTime, ['1'])
    assert.equal(result.fixed + result.broke + result.dropped, 0)
  })
})

describe('scenarioHistories', () => {
  const t = (testScenarioId: string, status: string, minute: number) => ({ testScenarioId, status, startedAt: `2026-10-20T07:${String(minute).padStart(2, '0')}:00Z` })
  it('orders by failures and tags each scenario by its recent results', () => {
    const rows = scenarioHistories(
      [t('a', 'FAILED', 1), t('a', 'FAILED', 2), t('b', 'CANCELLED', 1), t('b', 'COMPLETED', 2), t('b', 'FAILED', 3), t('c', 'COMPLETED', 1), t('d', 'COMPLETED', 1), t('d', 'FAILED', 2), t('d', 'COMPLETED', 3)],
      (id) => (id === 'a' ? '맵에서 첫 스테이지 전투' : null),
    )
    assert.deepEqual(rows.map((r) => [r.testScenarioId, r.verdict]), [['a', 'ALWAYS_FAILING'], ['b', 'BROKE_AGAIN'], ['d', 'FLAKY'], ['c', 'PASSING']])
    assert.equal(rows[0].title, '맵에서 첫 스테이지 전투')
    assert.equal(rows[1].title, '#b')
    assert.deepEqual(rows[1].outcomes, ['CANCEL', 'PASS', 'FAIL'])
  })

  it('keeps the latest results only', () => {
    const many = Array.from({ length: 14 }, (_, i) => t('a', i < 4 ? 'COMPLETED' : 'FAILED', i))
    assert.deepEqual(scenarioHistories(many, () => null)[0].outcomes, Array(10).fill('FAIL'))
  })
})

describe('costByRun', () => {
  it('joins tries to runs to builds and sums per run', () => {
    const points = costByRun(
      [
        { qaTryId: '45', totals: { inputTokens: 1_000, outputTokens: 10, costUsd: 0.02 } },
        { qaTryId: '46', totals: { inputTokens: 2_000, outputTokens: 20, costUsd: 0.03 } },
        { qaTryId: '30', totals: { inputTokens: 500, outputTokens: 5, costUsd: null } },
        { qaTryId: '99', totals: { inputTokens: 9, outputTokens: 9, costUsd: 1 } },
        { qaTryId: '12', totals: { inputTokens: 0, outputTokens: 0, costUsd: 0 } },
      ],
      new Map([['45', '24'], ['46', '24'], ['30', '17'], ['12', '9']]),
      [
        { id: '24', startedAt: '2026-10-20T07:45:00Z', gameBuildVersion: '1.0' },
        { id: '17', startedAt: '2026-10-13T06:37:00Z', gameBuildVersion: '1.1-e2e' },
        { id: '9', startedAt: '2026-10-01T06:37:00Z', gameBuildVersion: '0.9' },
      ],
    )
    assert.deepEqual(points.map((p) => [p.qaRunId, p.build, p.tokens]), [['17', '1.1-e2e · Unknown', 505], ['24', '1.0 · Unknown', 3_030]])
    assert.equal(points[1].costUsd?.toFixed(2), '0.05')
    // 단가를 모르는 시도가 섞이면 그 실행의 비용은 모른다.
    assert.equal(points[0].costUsd, null)
    // 모델을 안 부른 실행(#9)은 점이 없다.
  })
})

describe('weeks and days', () => {
  it('counts into Monday weeks ending this week', () => {
    const now = new Date('2026-10-20T12:00:00')
    const starts = weekStarts(now, 3)
    assert.deepEqual(starts.map((d) => d.getDate()), [5, 12, 19])
    assert.deepEqual(countByWeek(['2026-10-06T09:00:00', '2026-10-19T00:00:00', '2026-10-20T08:00:00', '2026-09-01T00:00:00', null], starts), [1, 0, 2])
  })

  it('counts per day with today last', () => {
    assert.deepEqual(countByDay(['2026-10-20T01:00:00', '2026-10-18T23:00:00', '2026-10-20T09:00:00'], new Date('2026-10-20T12:00:00'), 3), [1, 0, 2])
  })
})
