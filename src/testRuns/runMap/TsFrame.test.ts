import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleContext } from '../../i18n/LocaleContext'
import { messages } from '../../i18n/messages'
import { buildMapScenario } from './runMapModel'
import { TsFrame } from './TsFrame'

function render(reviewPending: boolean) {
  const scenario = buildMapScenario('7', { title: '로그인', description: '', execution_mode: 'ORDERED', steps: [] }, () => null)
  const frame = createElement(TsFrame, {
    scenario, position: 1, x: 0, y: 0, z: 1, folded: false, picked: false, pickedStep: null, dimmed: false,
    highlightScene: null, marked: false, renaming: false, onRename: () => {}, reviewPending,
  })
  return renderToStaticMarkup(createElement(LocaleContext.Provider, { value: { locale: 'ko', setLocale: () => {}, t: messages.ko } }, frame))
}

test('승인 전 시나리오 카드에 승인 대기를 표시한다', () => {
  assert.match(render(true), /rmf-review[^>]*>승인 대기</)
})

test('승인된 시나리오 카드에는 승인 표시를 붙이지 않는다', () => {
  const html = render(false)
  assert.doesNotMatch(html, /rmf-review/)
  assert.doesNotMatch(html, /승인/)
})
