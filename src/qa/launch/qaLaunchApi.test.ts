import assert from 'node:assert/strict'
import test from 'node:test'
import { parseQaRunSummary, parseSinceLastQa, passRate, quickStarts, runDuration, type QaRunSummary } from './qaLaunchApi'

// QA 실행 화면이 읽는 두 조회(ARTEL-1084). 서버 응답이 비거나 칸이 빠져도 화면이 깨지지 않아야 한다.

function run(overrides: Partial<QaRunSummary>): QaRunSummary {
  return {
    id: '1', testRunId: 'r1', testRunName: '회귀 1차', gameInstanceId: 'g1', gameInstanceName: 'MacBook',
    gameBuildVersion: '1.1', model: 'openai/gpt-6.1-sol', reasoningEffort: 'medium', keySource: 'platform',
    status: 'COMPLETED', startedAt: '2026-10-13T07:00:00Z', completedAt: '2026-10-13T07:13:42Z',
    casesPassed: 40, casesTotal: 42, issueCount: 2,
    ...overrides,
  }
}

test('실행 한 줄을 읽고, 판정이 없으면 케이스 수는 null 로 둔다', () => {
  const parsed = parseQaRunSummary({ id: '17', testRunId: '99', status: 'CANCELLED', startedAt: 'x', casesPassed: null })
  assert.ok(parsed !== null)
  assert.equal(parsed.casesPassed, null)
  assert.equal(parsed.casesTotal, null)
  assert.equal(parsed.issueCount, 0)
  assert.equal(parseQaRunSummary({}), null)
})

test('지난 실행 이후 — 마지막 실행이 없으면 빈 모양, 모르는 변경 종류는 버린다', () => {
  assert.deepEqual(parseSinceLastQa({ lastQaRun: null }), { lastQaRun: null, issues: [], changes: [] })
  const parsed = parseSinceLastQa({
    lastQaRun: { id: '17', testRunId: '99', status: 'COMPLETED', startedAt: 'x' },
    issues: [{ id: '12', title: '배경이 안 바뀜', status: 'OPEN', qaTryId: '31', scenarioId: '5', scenarioTitle: '맵', step: 7, reportedAt: 'x' }, { title: 'id 없음' }],
    changes: [{ kind: 'SCENARIO_ADDED', at: 'x', subjectId: '5', subjectName: '엔딩' }, { kind: 'SOMETHING_NEW', at: 'x' }],
  })
  assert.equal(parsed.lastQaRun?.id, '17')
  assert.deepEqual(parsed.issues.map((issue) => issue.title), ['배경이 안 바뀜'])
  assert.deepEqual(parsed.changes.map((change) => change.kind), ['SCENARIO_ADDED'])
  assert.equal(parsed.changes[0].count, 1)
})

test('빠른 시작은 조합마다 한 칸, 최신순, 지워진 런과 모델 없는 실행은 뺀다', () => {
  const runs = [
    run({ id: '5' }),
    run({ id: '4' }),
    run({ id: '3', testRunId: 'r3', model: 'anthropic/claude-opus-5.5', keySource: 'user' }),
    run({ id: '2', testRunId: 'gone' }),
    run({ id: '1', testRunId: 'r2', model: null }),
  ]
  const starts = quickStarts(runs, new Set(['r1', 'r2', 'r3']))
  assert.deepEqual(starts.map((start) => [start.run.id, start.times]), [['5', 2], ['3', 1]])
})

test('통과율과 걸린 시간 — 모르면 null', () => {
  assert.equal(passRate(run({})), 95)
  assert.equal(passRate(run({ casesTotal: null })), null)
  assert.equal(runDuration(run({})), 822_000)
  assert.equal(runDuration(run({ completedAt: null })), null)
})
