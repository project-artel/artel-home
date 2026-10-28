import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { formatTestCaseId } from './testCaseId'
import { TestCaseIdentifiersContext, useTestCaseLabel } from './testCaseIdentifiers'
import { listTestCaseIdentifiers } from './testCaseIdentifiersApi'
import { selectTestCases, NO_FILTERS } from './testCaseLibrary'
import type { TestCase } from './testCaseTypes'
import { groupCaseAttempts } from '../qa/evaluation/caseAttemptGroups'
import type { Attempt } from '../qa/evaluation/evaluationApi'
import { QaScenarioSteps } from '../qa/QaScenarioSteps'
import { buildFreeCaseSteps } from '../testScenarios/scenarioTypes'
import { LocaleContext } from '../i18n/LocaleContext'
import { messages } from '../i18n/messages'

function row(id: string): TestCase {
  return { id, projectId: '1', scene: 'Battle', step: '동일한 절차', precondition: null, expectedValue: '동일한 결과', status: null,
    verificationStatus: 'DRAFT', lastVerifiedBuildId: null, createdAt: '2026-10-28T00:00:00Z', folderId: null, evidenceGaps: [] }
}
function Label({ id }: { id: string }) { return createElement('span', null, useTestCaseLabel()(id)) }
const respond = (body: unknown) => mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => body }) as Response)
afterEach(() => mock.restoreAll())

test('프로젝트 TC 번호는 최소3자리이고 큰 숫자 문자열을 보존한다', () => {
  assert.equal(formatTestCaseId(1), 'TC-001')
  assert.equal(formatTestCaseId('2'), 'TC-002')
  assert.equal(formatTestCaseId('999'), 'TC-999')
  assert.equal(formatTestCaseId('1000'), 'TC-1000')
  assert.equal(formatTestCaseId('90071992547409931234'), 'TC-90071992547409931234')
})

test('서로 다른 프로젝트는 같은 표시번호를 사용하고 전역 ID를 추정하지 않는다', () => {
  for (const [projectId,id] of [['1','42'],['2','800']]) {
    const html = renderToStaticMarkup(createElement(TestCaseIdentifiersContext.Provider, { value: { projectId, numbers: new Map([[id,'1']]) } }, createElement(Label, { id })))
    assert.equal(html, '<span>TC-001</span>')
  }
  assert.equal(renderToStaticMarkup(createElement(Label, { id: '42' })), '<span>TC-…</span>')
})

test('프로젝트 번호로 검색하고 원본 숫자 검색과 정렬 후 번호를 보존한다', () => {
  const cases = [row('42'), row('4')]
  const numbers = new Map([['42','1'],['4','2']])
  for (const query of ['TC-002', 'tc-002', '4']) {
    const shown = selectTestCases(cases, { ...NO_FILTERS, query }, 'NEWEST', numbers)
    assert.ok(shown.some(item => item.id === '4'))
    assert.equal(formatTestCaseId(numbers.get(shown.find(item => item.id === '4')!.id)!), 'TC-002')
    if (query !== '4') assert.deepEqual(shown.map(item => item.id), ['4'])
  }
  assert.equal(formatTestCaseId(numbers.get(selectTestCases(cases, NO_FILTERS, 'NEWEST', numbers)[0].id)!), 'TC-001')
  assert.equal(selectTestCases(cases, { ...NO_FILTERS, query: 'TC-042' }, 'NEWEST', numbers).length, 0)
})

test('QA 참고 절차는 실제 프로젝트 번호를 표시하고 반복 TC도 같은 번호를 사용한다', () => {
  const html = renderToStaticMarkup(createElement(LocaleContext.Provider, { value: { locale: 'ko', setLocale: () => {}, t: messages.ko } },
    createElement(TestCaseIdentifiersContext.Provider, { value: { projectId: '1', numbers: new Map([['42','1'],['7','2']]) } },
      createElement(QaScenarioSteps, { projectId: '1', executionMode: 'ORDERED', scenarioSteps: ['42','7','42'].map(id => buildFreeCaseSteps([id])[0]), progress: null }))))
  assert.equal((html.match(/class="qa-rail-case-no"[^>]*>TC-001/g) ?? []).length, 2)
  assert.match(html, /TC-002/)
  assert.doesNotMatch(html, /TC-042|TC-007|TC-003/)
})

test('검토 바는 내부 ID가 아니라 프로젝트 번호 순서로 TC를 정렬한다', () => {
  const attempts = ['7','42'].map(testCaseId => ({ testCaseId, id: testCaseId, createdAt: '2026-10-28T00:00:00Z' } as Attempt))
  assert.deepEqual(groupCaseAttempts(attempts, new Map([['42','1'],['7','2']])).map(([id]) => id), ['42','7'])
})

test('서버 프로젝트 번호 응답은 문자열로 보존하고 중복·잘못된 번호를 거절한다', async () => {
  respond([{ testCaseId: '42', caseNumber: '1' }, { testCaseId: '9007199254740993', caseNumber: '9007199254740992' }])
  assert.deepEqual([...await listTestCaseIdentifiers('1')], [['42','1'],['9007199254740993','9007199254740992']])
  for (const body of [[{testCaseId:'42',caseNumber:'0'}], [{testCaseId:'42',caseNumber:'1'},{testCaseId:'43',caseNumber:'1'}]]) {
    mock.restoreAll(); respond(body)
    await assert.rejects(listTestCaseIdentifiers('1'), /Invalid test case identifier/)
  }
})
