import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QaNoticeOutcome } from './QaNoticeBell'
import type { QaRunSummary } from './launch/qaLaunchApi'
import { LocaleContext } from '../i18n/LocaleContext'
import { messages } from '../i18n/messages'

function render(failed?: number | null, total: number | null = 10) {
  return renderToStaticMarkup(createElement(LocaleContext.Provider, { value: { locale: 'ko', setLocale: () => {}, t: messages.ko } }, createElement(QaNoticeOutcome, { run: { casesTotal: total, casesPassed: 4, casesFailed: failed } as QaRunSummary })))
}
test('완료 알림은 미검증 4건을 실패에 더하지 않고 서버의 실제 실패 2건만 표시한다', () => {
  const html = render(2)
  assert.match(html, /실패 2/)
  assert.doesNotMatch(html, /실패 6/)
})
test('실패 수가 없는 과거 응답에서는 실패를 추정하지 않고 명시한 0은 표시한다', () => {
  assert.doesNotMatch(render(), /qa-notice-pill--failed/)
  assert.doesNotMatch(render(null), /qa-notice-pill--failed/)
  assert.match(render(0), /실패 0/)
  assert.equal(render(0, null), '')
})
