import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseQaRunVerdicts } from './qaVerdictApi'
import { readVerdictDetail } from './qaVerdictEvidence'
import { actionLabel, defaultStep, earlierIssue, stepRows, tallyRows, textParts } from './verdicts/verdictModel'

const scenario = {
  qaTryId: '33',
  testScenarioId: '668',
  scenarioTitle: '전투',
  executionMode: 'ORDERED',
  status: 'FAILED',
  model: 'openai/gpt-6-luna',
  startedAt: '2026-10-08T05:00:00Z',
  completedAt: '2026-10-08T05:03:39Z',
  steps: [
    { step: 1, title: '맵으로 간다', caseId: null, expected: null },
    { step: 2, title: 'Stage 글자', caseId: '409', expected: '`Canvas/Stage` 이(가) 화면에 있다' },
    { step: 3, title: '카드를 조합한다', caseId: null, expected: null },
    { step: 4, title: '카드를 끈다', caseId: '402', expected: '`DraggableCard` 의 위치가 바뀐다' },
  ],
  verdicts: [
    { logId: '1', step: 1, stepTitle: '맵으로 간다', caseId: null, isVerification: false, passed: true, message: '갔다', actions: [{ kind: 'key', label: 'Return', count: 2 }, { kind: 'wave' }] },
    {
      logId: '2', step: 2, caseId: '409', isVerification: true, passed: true, message: '보인다', reason: 'Stage 가 떴다', evidence: 'verified',
      checks: [{ expected: 'Stage 글자', observed: 'Stage : 0', met: 'yes', sources: [{ kind: 'pulse', key: 'MapScene::stage', value: 'Stage : 0', recorded: 'Stage : 0', citation: 'match' }] }],
      captures: [{ captureId: 'c1', url: 'https://x/c1.jpg', expiresAt: '' }, { captureId: 'c2' }],
    },
    { logId: '3', step: 3, isVerification: false, passed: false, message: '카드가 안 생겼다' },
    { logId: '4', step: 4, caseId: '402', isVerification: true, passed: false, message: '끌 카드가 없다' },
  ],
  issues: [{ issueId: '9', title: '카드가 안 생긴다', severity: 'MAJOR', step: 3 }, { title: 'id 없음' }],
}

const run = {
  qaRunId: '16', testRunId: '95', testRunName: 'E2E 1.1 회귀', gameBuildVersion: '1.1-e2e', status: 'FAILED',
  startedAt: '2026-10-08T05:00:00Z', completedAt: null, tries: [scenario],
}

describe('parseQaRunVerdicts', () => {
  it('reads the run context, every step, the issues and each verdict with its evidence', () => {
    const parsed = parseQaRunVerdicts(run)
    assert.equal(parsed.testRunName, 'E2E 1.1 회귀')
    assert.equal(parsed.completedAt, null)
    const [qaTry] = parsed.tries
    assert.equal(qaTry.steps.length, 4)
    assert.deepEqual(qaTry.issues.map((issue) => issue.issueId), ['9'])
    assert.deepEqual(qaTry.verdicts[0].actions, [{ kind: 'key', label: 'Return', count: 2 }])
    assert.equal(qaTry.verdicts[1].detail.checks[0].sources[0].citation, 'match')
    assert.deepEqual(qaTry.verdicts[1].captures.map((capture) => capture.captureId), ['c1'])
  })
})

describe('stepRows', () => {
  const rows = stepRows(parseQaRunVerdicts(run).tries[0])

  it('marks verifying and action steps and carries each step\'s issues', () => {
    assert.deepEqual(rows.map((row) => [row.step, row.verifying, row.state]), [
      [1, false, 'passed'], [2, true, 'passed'], [3, false, 'failed'], [4, true, 'failed'],
    ])
    assert.equal(rows[2].issues[0].title, '카드가 안 생긴다')
    assert.deepEqual(tallyRows(rows), { checks: 2, passed: 1, failed: 2, actions: 2, issues: 1, judged: 4 })
  })

  it('points a later failure at the issue before it and opens on the first failed check', () => {
    assert.equal(earlierIssue(rows, 4)?.step, 3)
    assert.equal(earlierIssue(rows, 2), null)
    assert.equal(defaultStep(rows), 4)
  })

  it('shows the frontier as running and the rest as waiting while the run is going', () => {
    const live = stepRows({ ...parseQaRunVerdicts(run).tries[0], status: 'RUNNING', verdicts: parseQaRunVerdicts(run).tries[0].verdicts.slice(0, 2) })
    assert.deepEqual(live.map((row) => row.state), ['passed', 'passed', 'running', 'pending'])
    assert.equal(live[3].verifying, true)
  })
})

describe('labels', () => {
  it('turns backticks into code parts and counts repeated actions', () => {
    assert.deepEqual(textParts('`DraggableCard` 의 위치'), [{ text: 'DraggableCard', code: true }, { text: ' 의 위치', code: false }])
    assert.equal(actionLabel({ kind: 'key', label: 'Return', count: 2 }, { click: '클릭', drag: '드래그' }), 'Return ×2')
    assert.equal(actionLabel({ kind: 'click', label: null, count: 1 }, { click: '클릭', drag: '드래그' }), '클릭')
  })
})

describe('readVerdictDetail', () => {
  it('works the status out from the citations when the frame does not say', () => {
    const check = (citation: string) => ({ expected: 'x', observed: 'y', met: 'yes', sources: [{ kind: 'pulse', key: 'k', value: '1', citation }] })
    assert.equal(readVerdictDetail({ message: 'm' }).status, 'none')
    assert.equal(readVerdictDetail({ message: 'm', checks: [check('match')] }).status, 'verified')
    assert.equal(readVerdictDetail({ message: 'm', checks: [check('match'), check('missing')] }).status, 'uncertain')
  })
})
