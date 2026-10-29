import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RunMapDrawer } from './RunMapDrawer'
import { buildMapScenario } from './runMapModel'
import { createEmptyStep } from '../../testScenarios/scenarioTypes'
import { TestCaseIdentifiersContext } from '../../testCases/testCaseIdentifiers'
import { LocaleContext } from '../../i18n/LocaleContext'
import { messages } from '../../i18n/messages'

test('새 캔버스의 TC 묶음과 단일 TC는 구간 순번 대신 프로젝트 번호를 표시한다', () => {
  const scenario = buildMapScenario('7', { title: 'T', description: '', execution_mode: 'ORDERED', steps: [42,42,7,42].map(case_id => ({ ...createEmptyStep(), case_id, action: '같은 절차' })) }, () => 'Battle')
  const noop = () => {}
  const html = renderToStaticMarkup(createElement(LocaleContext.Provider, { value: { locale: 'ko', setLocale: () => {}, t: messages.ko } }, createElement(TestCaseIdentifiersContext.Provider, { value: { projectId: '1', numbers: new Map([['42','8'],['7','2']]) } }, createElement(RunMapDrawer, { scenario, projectId: '1', gameBuildId: null, position: 1, total: 1, pickedStep: null, onClose: noop, onPrev: noop, onNext: noop, onPickStep: noop, onAddStep: noop, onImportTcs: noop, onOpenEditor: noop, onMoveSteps: noop }))))
  assert.equal((html.match(/class="rmd-tc"[^>]*>TC-008/g) ?? []).length, 2)
  assert.match(html, /class="rmd-tc"[^>]*>TC-002/)
  assert.match(html, /TC-008 끌기/)
  assert.doesNotMatch(html, /TC-042|TC-007|TC-003|TC 1/)
})
