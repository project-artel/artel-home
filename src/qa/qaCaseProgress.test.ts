import { TestCaseIdentifiersContext } from '../testCases/testCaseIdentifiers'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleContext } from '../i18n/LocaleContext'
import { messages } from '../i18n/messages'
import { createEmptyStep, type ExecutionMode } from '../testScenarios/scenarioTypes'
import { QaScenarioSteps } from './QaScenarioSteps'
import { deriveQaCaseReports, summarizeQaCases } from './qaCaseProgress'
import { deriveQaProgress } from './qaProgress'
import type { QaLog } from './qaTypes'

function log(id: string, payload: unknown, type: QaLog['type'] = 'STATUS'): QaLog {
  return { id, payload, type, qaTryId: '6', messageId: null, correlationId: null,
    direction: 'AGENT_TO_ORCHE', message: id, createdAt: '2026-10-28T00:00:00Z' }
}
const steps = [1, 2, 3, 4, 5].map((case_id) => ({ ...createEmptyStep(), case_id, action: `case ${case_id}` }))
// QA 6의 report_test_case payload와 같은 형식이다. step은 포함되지 않는다.
const reports = [1, 2, 3, 5, 4].map((case_id) => log(`report-${case_id}`, {
  case_id, attempt_id: case_id, is_verification: true,
  status: case_id === 4 ? 'INCONCLUSIVE' : 'COMPLETED',
  case_outcome: case_id === 4 ? 'INCONCLUSIVE' : 'PASSED',
}))
function progress(logs: QaLog[], executionMode: ExecutionMode = 'FREE', terminal = false) {
  return deriveQaProgress({ scenarioSteps: steps, logs, executionMode,
    status: terminal ? 'FAILED' : 'RUNNING', historyComplete: terminal })
}
function render(logs: QaLog[], executionMode: ExecutionMode = 'FREE', scenarioSteps = steps) {
  return renderToStaticMarkup(createElement(LocaleContext.Provider, {
    value: { locale: 'ko', setLocale: () => {}, t: messages.ko },
  }, createElement(TestCaseIdentifiersContext.Provider, { value: { projectId: '1', numbers: new Map([1,2,3,4,5].map(n => [String(n), String(n)])) } }, createElement(QaScenarioSteps, { projectId: '1', scenarioSteps, executionMode,
    progress: deriveQaProgress({ scenarioSteps, logs, executionMode, status: 'RUNNING', historyComplete: false }),
    caseReports: deriveQaCaseReports(logs), onJump: () => {} }))))
}

test('TC 판정이 도착한 순서와 무관하게 해당 TC에 표시된다', () => {
  const actual = progress(reports)
  assert.deepEqual(actual.steps.map((step) => step.state), ['passed', 'passed', 'passed', 'inconclusive', 'passed'])
  assert.deepEqual(actual.steps.map((step) => step.verdictLogId), ['report-1', 'report-2', 'report-3', 'report-4', 'report-5'])
  assert.deepEqual([actual.reported, actual.passed, actual.failed], [5, 4, 0])
  assert.deepEqual(summarizeQaCases(steps, deriveQaCaseReports(reports)),
    { total: 5, reported: 5, passed: 4, failed: 0, inconclusive: 1 })
})

test('실시간으로 추가된 TC 재시도 판정은 해당 행만 갱신하고 재조회해도 유지된다', () => {
  const initial = reports.slice(0, 1)
  assert.equal(progress(initial).steps[1].state, 'pending')
  const retry = [...reports, log('retry-1', { case_id: '1', case_outcome: 'FAILED', attempt_id: 6 })]
  assert.deepEqual(progress(retry).steps.map((step) => step.state), ['failed', 'passed', 'passed', 'inconclusive', 'passed'])
  assert.equal(progress(retry, 'FREE', true).steps[0].verdictLogId, 'retry-1')
  const labeled = [{ ...steps[0], expected_passed: true }]
  const actual = deriveQaProgress({ scenarioSteps: labeled, logs: [log('unknown', { case_id: 1, case_outcome: 'INCONCLUSIVE' })],
    executionMode: 'FREE', status: 'RUNNING', historyComplete: false })
  assert.equal(actual.steps[0].grade, null)
  assert.equal(actual.failed, 0)
})

test('이전 CASE_VERDICT는 현재 실행의 TC report를 덮지 않는다', () => {
  const legacy = log('saved', { case_id: 1, verification_status: 'FAILED' }, 'CASE_VERDICT')
  assert.equal(deriveQaCaseReports([legacy]).get('1')?.state, 'failed')
  for (const logs of [[legacy, reports[0]], [reports[0], legacy]]) {
    assert.equal(deriveQaCaseReports(logs).get('1')?.state, 'passed')
  }
})

test('참고 step·실행 종료·잘못된 ID·미완료 이벤트는 TC 판정에 포함하지 않는다', () => {
  const ignored = [
    log('step', { case_id: 1, step: 1, status: 'COMPLETED' }),
    log('run', { case_id: 1, result: 'FAILED', status: 'FAILED' }),
    log('invalid', { case_id: 'bad', case_outcome: 'PASSED' }),
    log('zero', { case_id: 0, case_outcome: 'PASSED' }),
    log('pending', { case_id: 1, status: 'RUNNING' }),
    log('tool', { case_id: 1, case_outcome: 'PASSED' }, 'TOOL'),
  ]
  assert.equal(deriveQaCaseReports(ignored).size, 0)
  const unrelated = log('other', { case_id: 999, case_outcome: 'FAILED' })
  assert.deepEqual(summarizeQaCases([...steps, steps[0]], deriveQaCaseReports([...reports, unrelated])),
    { total: 5, reported: 5, passed: 4, failed: 0, inconclusive: 1 })
})

test('FREE 목록은 통과 체크 네 개와 판단 불가 및 실제 판정 수를 렌더링한다', () => {
  const html = render(reports)
  assert.equal((html.match(/qa-rail-step--passed/g) ?? []).length, 4)
  assert.equal((html.match(/qa-rail-step--inconclusive/g) ?? []).length, 1)
  assert.equal((html.match(/✓/g) ?? []).length, 4)
  assert.match(html, /판단 불가/)
  assert.ok(html.includes(messages.ko.qa.steps.summary(5, 5, 4, 0)))
  assert.doesNotMatch(html, /qa-rail-step--failed/)
})

test('ORDERED의 TC 머리에는 판정을 표시하고 참고 절차를 완료 처리하지 않는다', () => {
  const html = render(reports, 'ORDERED')
  assert.equal((html.match(/qa-rail-case-verdict--passed/g) ?? []).length, 4)
  assert.match(html, /qa-rail-case-verdict--inconclusive/)
  assert.match(html, /aria-label="TC-001 · /)
  assert.equal((html.match(/qa-rail-step--neutral/g) ?? []).length, 5)
  assert.doesNotMatch(html, /qa-rail-step--passed/)
})

test('이전 ORDERED의 step 판정과 CASE_VERDICT가 함께 있어도 step 진행 상태와 통계를 유지한다', () => {
  const html = render([
    log('step-1', { step: 1, status: 'COMPLETED' }),
    log('case-1', { case_id: 1, verification_status: 'VERIFIED' }, 'CASE_VERDICT'),
  ], 'ORDERED')
  assert.match(html, /qa-rail-step--passed/)
  assert.match(html, /qa-rail-step--running/)
  assert.equal((html.match(/qa-rail-step--pending/g) ?? []).length, 3)
  assert.doesNotMatch(html, /qa-rail-step--neutral/)
  assert.ok(html.includes(messages.ko.qa.steps.summary(1, 5, 1, 0)))
})

test('이전 CASE_VERDICT는 마지막 step의 expectation grade를 없애지 않는다', () => {
  const html = render([
    log('step-1', { step: 1, status: 'FAILED' }),
    log('case-1', { case_id: 1, verification_status: 'FAILED' }, 'CASE_VERDICT'),
  ], 'ORDERED', [{ ...steps[0], expected_passed: false }])
  assert.match(html, /qa-rail-case-verdict--grade-correct/)
  assert.match(html, /qa-rail-step--grade-correct/)
})

test('이전 FREE의 step 판정만 있어도 TC 행과 판정 수가 일치한다', () => {
  const html = render([log('old-step', { step: 3, status: 'COMPLETED' })])
  assert.match(html, /qa-rail-step--passed/)
  assert.ok(html.includes(messages.ko.qa.steps.summary(1, 5, 1, 0)))
})

test('실제 CASE_VERDICT의 VERIFIED는 통과이며 DRAFT·REGRESSION·BROKEN은 판정이 아니다', () => {
  const logs = ['VERIFIED', 'DRAFT', 'REGRESSION', 'BROKEN'].map((verification_status, index) =>
    log(`legacy-${index}`, { case_id: index + 1, verification_status }, 'CASE_VERDICT'))
  assert.deepEqual([...deriveQaCaseReports(logs)].map(([id, report]) => [id, report.state]), [['1', 'passed']])
  const html = render(logs)
  assert.equal((html.match(/qa-rail-step--passed/g) ?? []).length, 1)
  assert.ok(html.includes(messages.ko.qa.steps.summary(1, 5, 1, 0)))
})
