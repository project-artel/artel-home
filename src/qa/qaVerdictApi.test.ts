import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseQaRunVerdicts, tallyVerdicts } from './qaVerdictApi'
import { readVerdictDetail } from './qaVerdictEvidence'

const run = {
  qaRunId: '16',
  tries: [{
    qaTryId: '33',
    testScenarioId: '668',
    scenarioTitle: '전투',
    status: 'FAILED',
    verdicts: [
      { logId: '1', step: 1, stepTitle: '누른다', caseId: null, isVerification: false, passed: true, message: '눌렀다', reason: null, evidence: 'none', checks: null, captures: [], judgedAt: null },
      {
        logId: '2', step: 2, stepTitle: 'Stage 글자', caseId: '409', isVerification: true, passed: true, message: '보인다', reason: 'Stage 가 떴다',
        evidence: 'verified',
        checks: [{ expected: 'Stage 글자', observed: 'Stage : 0', met: 'yes', sources: [{ kind: 'pulse', key: 'MapScene::stage', value: 'Stage : 0', recorded: 'Stage : 0', citation: 'match' }] }],
        captures: [{ captureId: 'c1', url: 'https://x/c1.jpg', expiresAt: '2026-10-20T00:00:00Z' }, { captureId: 'c2' }],
        judgedAt: '2026-10-20T00:00:00Z',
      },
      { logId: '3', step: 3, stepTitle: '', caseId: '410', isVerification: true, passed: false, message: '안 보인다', reason: '', evidence: 'uncertain', checks: [], captures: [], judgedAt: null },
    ],
  }],
}

describe('parseQaRunVerdicts', () => {
  it('keeps each verdict with its evidence, and drops captures without an address', () => {
    const parsed = parseQaRunVerdicts(run)
    const [first, second, third] = parsed.tries[0].verdicts
    assert.equal(first.detail.status, 'none')
    assert.equal(second.detail.reason, 'Stage 가 떴다')
    assert.equal(second.detail.checks[0].met, 'met')
    assert.equal(second.detail.checks[0].sources[0].citation, 'match')
    assert.deepEqual(second.captures.map((capture) => capture.captureId), ['c1'])
    assert.equal(third.stepTitle, null)
    assert.equal(third.detail.reason, null)
  })

  it('counts only verifying steps', () => {
    const tally = tallyVerdicts(parseQaRunVerdicts(run).tries[0].verdicts)
    assert.deepEqual(tally, { judged: 2, passed: 1, failed: 1, verified: 1, uncertain: 1, none: 0 })
  })
})

describe('readVerdictDetail', () => {
  it('works the status out from the citations when the frame does not say', () => {
    const check = (citation: string) => ({ expected: 'x', observed: 'y', met: 'yes', sources: [{ kind: 'pulse', key: 'k', value: '1', citation }] })
    assert.equal(readVerdictDetail({ message: 'm' }).status, 'none')
    assert.equal(readVerdictDetail({ message: 'm', checks: [check('match')] }).status, 'verified')
    assert.equal(readVerdictDetail({ message: 'm', checks: [check('match'), check('missing')] }).status, 'uncertain')
    assert.equal(readVerdictDetail({ message: 'm', checks: [{ observed: 'no expected item' }] }).checks.length, 0)
  })
})
