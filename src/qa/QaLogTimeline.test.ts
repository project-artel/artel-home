import { TestCaseIdentifiersContext } from '../testCases/testCaseIdentifiers'
/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleContext } from '../i18n/LocaleContext'
import { messages } from '../i18n/messages'
import type { ExecutionMode, ScenarioStep } from '../testScenarios/scenarioTypes'
import { QaLogTimeline } from './QaLogTimeline'
import { filterFlowLogs } from './qaFlow'
import type { QaLog } from './qaTypes'

const steps: ScenarioStep[] = [101, 202].map((case_id) => ({
  case_id, action: '', hint: null, input: null, step_kind: null,
  step_unknown_reason: null, expected_passed: null, step_source: null,
}))
function log(id: string, type: QaLog['type'], payload: unknown, message = id): QaLog {
  return { id, type, payload, message, qaTryId: '1', messageId: null, correlationId: null,
    direction: 'AGENT_TO_ORCHE', createdAt: `2026-10-22T00:00:${id.padStart(2, '0')}.000Z` }
}
const logs = [
  log('1', 'TOOL', { step: 1, tool: 'press_key', args: { key_code: 'W', thought: 'move-first' } }),
  log('2', 'STATUS', { step: 2, status: 'COMPLETED' }, 'verdict-second'),
  log('3', 'TOOL', { step: 1, tool: 'press_key', args: { key_code: 'S', thought: 'move-between' } }),
  log('4', 'STATUS', { step: 1, status: 'FAILED' }, 'verdict-first'),
  log('5', 'CASE_VERDICT', { case_id: 101, verification_status: 'FAILED' }, 'saved-verdict'),
  log('6', 'PULSE', {}, 'pulse-only'),
]
function render(mode: ExecutionMode, flow: boolean, input = logs, scenarioSteps = steps): string {
  return renderToStaticMarkup(createElement(LocaleContext.Provider, {
    value: { locale: 'ko', setLocale: () => {}, t: messages.ko },
  }, createElement(TestCaseIdentifiersContext.Provider, { value: { projectId: 'test-project', numbers: new Map([['101','41'],['202','7']]) } }, createElement(QaLogTimeline, {
    projectId: 'test-project', gameBuildId: 'test-build',
    executionMode: mode, flow, scenarioSteps, logs: flow ? filterFlowLogs(input, mode) : input,
    focusRequest: null, hasMore: false, historyFailure: null, historyLoading: false,
    live: false, loadOlder: async () => false, onFocusResolved: () => {},
  }))))
}
for (const flow of [true, false]) {
  test(`FREE ${flow ? 'Flow' : 'Raw'}는 TC 구간 없이 시간순으로 판정을 표시한다`, () => {
    const html = render('FREE', flow)
    assert.doesNotMatch(html, /class="qa-(?:flow-group|log-section|log-step)"/)
    assert.match(html, /TC-007/)
    assert.match(html, /TC-041/)
    assert.match(html, /aria-haspopup="dialog"/)
    assert.ok(html.indexOf('move-first') < html.indexOf('verdict-second'))
    assert.ok(html.indexOf('verdict-second') < html.indexOf('move-between'))
    assert.ok(html.indexOf('move-between') < html.indexOf('verdict-first'))
    const middle = html.slice(html.indexOf('data-log-id="3"'), html.indexOf('data-log-id="4"'))
    assert.doesNotMatch(middle, /TC #|qa-tc-badge/)
    assert.equal(html.includes('pulse-only'), !flow)
    assert.match(html, /saved-verdict/)
    if (flow) {
      assert.match(html, /qa-flow-card/)
      assert.match(html, /qa-flow-dot--thought/)
      assert.match(html, /qa-flow-dot--action/)
      assert.doesNotMatch(html, /qa-log-meta|qa-flow-step-no|qa-flow-label/)
    }
  })
}
test('FREE의 매핑 없는 STATUS와 비판정 STATUS에는 TC를 추정하지 않는다', () => {
  const input = [log('1', 'STATUS', { step: 99, status: 'COMPLETED' }),
    log('2', 'STATUS', { step: 1, status: 'RUNNING' })]
  assert.doesNotMatch(render('FREE', true, input), /TC #|qa-log-step/)
  assert.doesNotMatch(render('FREE', true, logs.slice(0, 4), []), /TC #|qa-log-step/)
  assert.doesNotMatch(render('FREE', false, [logs[3]], [{ ...steps[0], case_id: null }]), /TC #/)
})
test('ORDERED의 Flow 구간과 Raw 구간을 유지한다', () => {
  assert.match(render('ORDERED', true), /qa-flow-group/)
  assert.match(render('ORDERED', false), /qa-log-section/)
  assert.deepEqual(filterFlowLogs(logs, 'ORDERED').map((entry) => entry.id), ['1','2','3','4','6'])
})

test('FREE는 STATUS가 없는 부분 히스토리의 TC 판정도 같은 카드로 표시한다', () => {
  const html = render('FREE', true, [logs[4]])
  assert.match(html, /TC-041/)
  assert.match(html, /saved-verdict/)
  assert.match(html, /qa-flow-verdict--failed/)
  assert.doesNotMatch(html, /qa-flow-label|qa-flow-step-no/)
})
