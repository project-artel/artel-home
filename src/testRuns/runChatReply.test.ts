import assert from 'node:assert/strict'
import test from 'node:test'
import { parseReply, parseRunStreamEvent } from './runChatApi'

// 답의 세 칸(ARTEL-929). 결과·설명은 저장된 payload(`kind=reply`)와 실시간 결과 프레임의 `reply`
// 두 길로 온다 — 둘이 같은 모양으로 읽혀야 새로고침 전후가 같아 보인다.

test('reply payload 에서 결과와 설명을 읽는다', () => {
  assert.deepEqual(
    parseReply({ kind: 'reply', result: '시나리오를 저장했어요: **타이틀**', detail: '하나만 썼어요.' }),
    { result: '시나리오를 저장했어요: **타이틀**', detail: '하나만 썼어요.' },
  )
})

test('설명이 없으면 빈 글이다', () => {
  assert.deepEqual(parseReply({ kind: 'reply', result: '저장했어요' }), { result: '저장했어요', detail: '' })
})

test('다른 종류의 payload 나 결과 없는 reply 는 답이 아니다', () => {
  assert.equal(parseReply({ kind: 'question', id: 'q', text: '넣을까요?' }), null)
  assert.equal(parseReply({ kind: 'reply', result: '' }), null)
  assert.equal(parseReply(null), null)
})

test('결과 프레임의 reply 를 읽는다', () => {
  const parsed = parseRunStreamEvent(
    JSON.stringify({
      type: 'result',
      message: '저장했어요\n이유',
      scenarios: [],
      reply: { result: '저장했어요', detail: '이유' },
    }),
  )
  assert.equal(parsed?.type, 'result')
  assert.deepEqual(parsed?.type === 'result' ? parsed.reply : null, { result: '저장했어요', detail: '이유' })
})

test('reply 없는 결과 프레임은 글만 있는 답이다', () => {
  const parsed = parseRunStreamEvent(JSON.stringify({ type: 'result', message: '안녕하세요', scenarios: [] }))
  assert.equal(parsed?.type === 'result' ? parsed.reply : 'x', null)
})
