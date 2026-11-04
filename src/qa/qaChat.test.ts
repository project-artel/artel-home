import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleContext } from '../i18n/LocaleContext'
import { messages } from '../i18n/messages'
import { QaChatPanel } from './QaChatPanel'
import { chatTurns, sendChatMessage, waitingQuestion } from './qaChat'
import { questions, type Question } from './evaluation/evaluationApi'
import { ProjectApiError } from '../projects/projectApi'
import type { QaLog } from './qaTypes'

const question: Question = { id: 'question-1', qaTryId: '6', qaRunId: '9', question: '어느 메뉴로 이동하나요?', state: 'WAITING', answer: null, createdAt: '2026-11-04T01:00:00Z' }
const log: QaLog = { id: '1', qaTryId: '6', type: 'CHAT', direction: 'USER_TO_ORCHE', message: '설정을 확인해 주세요.', messageId: null, correlationId: null, payload: null, createdAt: '2026-11-04T00:59:00Z' }

afterEach(() => mock.restoreAll())

test('선택한 QA의 질문과 저장된 답변을 CHAT 사이에 시간순으로 복원한다', () => {
  const answered = { ...question, state: 'ANSWERED', answer: '설정 메뉴입니다.', answeredAt: '2026-11-04T01:01:00Z' }
  const turns = chatTurns([
    { ...log, id: '2', message: '계속 진행하겠습니다.', direction: 'AGENT_TO_ORCHE', createdAt: '2026-11-04T01:02:00Z' },
    log,
    { ...log, id: '3', direction: 'ORCHE_TO_AGENT' },
    { ...log, id: '4', qaTryId: '7' },
  ], [answered, { ...question, id: 'other', qaTryId: '7' }], '6')
  assert.deepEqual(turns.map(turn => turn.message), ['설정을 확인해 주세요.', question.question, '설정 메뉴입니다.', '계속 진행하겠습니다.'])
  assert.deepEqual(turns.map(turn => turn.role), ['USER', 'AGENT', 'USER', 'AGENT'])
  assert.equal(turns[1].waiting, false)
  assert.equal(turns[2].questionAnswer, true)
})

test('다른 QA와 종료된 질문은 답변 대상으로 선택하지 않는다', () => {
  assert.equal(waitingQuestion([{ ...question, qaTryId: '7' }, { ...question, state: 'CANCELLED' }], '6'), null)
  assert.equal(waitingQuestion([question, { ...question, id: 'earlier', createdAt: '2026-11-04T00:00:00Z' }], '6')?.id, 'earlier')
})

test('질문 답변은 전용 answer API로 보내고 일반 채팅은 messages API로 보낸다', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 200 }))
  await sendChatMessage('1', '6', '설정 메뉴입니다.', question)
  await sendChatMessage('1', '6', '계속해 주세요.', null)
  assert.match(String(fetch.mock.calls[0].arguments[0]), /projects\/1\/qa-evaluation\/questions\/question-1\/answer$/)
  assert.deepEqual(JSON.parse(String(fetch.mock.calls[0].arguments[1]?.body)), { answer: '설정 메뉴입니다.' })
  assert.match(String(fetch.mock.calls[1].arguments[0]), /qa-tries\/6\/messages$/)
})

test('다른 QA의 질문에 답하지 않고 409를 일반 채팅으로 재전송하지 않는다', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ message: '이미 답변됨' }), { status: 409 }))
  await assert.rejects(sendChatMessage('1', '7', '답변', question))
  assert.equal(fetch.mock.callCount(), 0)
  await assert.rejects(sendChatMessage('1', '6', '답변', question), ProjectApiError)
  assert.equal(fetch.mock.callCount(), 1)
})

test('질문 목록 API의 answeredAt을 보존하고 이전 서버 응답도 읽는다', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([{ ...question, answeredAt: '2026-11-04T01:01:00Z' }, question]), { status: 200 }))
  const result = await questions('1')
  assert.equal(result[0].answeredAt, '2026-11-04T01:01:00Z')
  assert.equal(result[1].answeredAt, null)
})

function render(ready: boolean, waiting: boolean, disabled = false) {
  return renderToStaticMarkup(createElement(LocaleContext.Provider, {
    value: { locale: 'ko', setLocale: () => {}, t: messages.ko },
  }, createElement(QaChatPanel, { disabled, logs: [], projectId: '1', qaTryId: '6', questions: {
    questions: waiting ? [question] : [], ready, failed: false, reload: async () => {},
  } })))
}

test('질문은 채팅에 표시하고 기존 입력창은 답변하고 재개 동작을 표시한다', () => {
  const html = render(true, true)
  assert.match(html, /어느 메뉴로 이동하나요\?/)
  assert.match(html, /답변하고 재개/)
  assert.match(html, /maxLength="4000"/i)
  assert.equal((html.match(/<textarea/g) ?? []).length, 1)
  assert.doesNotMatch(render(false, false), /<textarea(?![^>]*disabled)/)
  assert.doesNotMatch(render(true, true, true), /<textarea/)
})
