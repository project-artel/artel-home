import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRefs, parseReply, parseRunStreamEvent } from './runChatApi'

// 답의 세 칸(ARTEL-929). 결과·설명은 저장된 payload(`kind=reply`)와 실시간 결과 프레임의 `reply`
// 두 길로 온다 — 둘이 같은 모양으로 읽혀야 새로고침 전후가 같아 보인다.

test('reply payload 에서 결과와 설명을 읽는다', () => {
  assert.deepEqual(
    parseReply({ kind: 'reply', result: '시나리오를 저장했어요: **타이틀**', detail: '하나만 썼어요.' }),
    { result: '시나리오를 저장했어요: **타이틀**', detail: '하나만 썼어요.', changes: [] },
  )
})

test('설명이 없으면 빈 글이다', () => {
  assert.deepEqual(parseReply({ kind: 'reply', result: '저장했어요' }), { result: '저장했어요', detail: '', changes: [] })
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
  assert.deepEqual(parsed?.type === 'result' ? parsed.reply : null, { result: '저장했어요', detail: '이유', changes: [] })
})

test('reply 없는 결과 프레임은 글만 있는 답이다', () => {
  const parsed = parseRunStreamEvent(JSON.stringify({ type: 'result', message: '안녕하세요', scenarios: [] }))
  assert.equal(parsed?.type === 'result' ? parsed.reply : 'x', null)
})

// ---- 참조(ARTEL-933) ---------------------------------------------------------------------

test('refs 를 읽고 모양이 틀린 것은 버린다', () => {
  assert.deepEqual(
    parseRefs([
      { kind: 'tc', id: 5, label: 'Shop — 상점을 연다', detail: '기대값: 상점이 열린다' },
      { kind: 'ts', id: '7', label: '상점 여정' },
      { kind: 'xx', id: 1, label: '?' },
      { kind: 'tc', id: 2 },
    ]),
    [
      { kind: 'tc', id: 5, label: 'Shop — 상점을 연다', detail: '기대값: 상점이 열린다' },
      { kind: 'ts', id: 7, label: '상점 여정', detail: null },
    ],
  )
  assert.deepEqual(parseRefs(undefined), [])
})

test('결과 프레임과 질문 프레임이 refs 를 든다', () => {
  const refs = [{ kind: 'tc', id: 5, label: 'Shop — 상점을 연다' }]
  const result = parseRunStreamEvent(JSON.stringify({ type: 'result', message: 'm', scenarios: [], refs }))
  const question = parseRunStreamEvent(
    JSON.stringify({ type: 'question', question: { id: 'q', text: '[[tc:5]] 볼까요?', options: [] }, refs }),
  )
  assert.equal(result?.type === 'result' ? result.refs[0]?.label : null, 'Shop — 상점을 연다')
  assert.equal(question?.type === 'question' ? question.refs[0]?.id : null, 5)
})

// ---- 바뀐 시나리오 목록(ARTEL-938) --------------------------------------------------------

test('reply 의 changes 를 읽고 모양이 틀린 것은 버린다', () => {
  const reply = parseReply({
    kind: 'reply',
    result: '총 1건의 시나리오를 생성하고 1건을 수정했습니다.',
    changes: [
      { action: 'created', title: '상점 열기', scenario_id: 41 },
      { action: 'updated', title: '전투', scenario_id: '40' },
      { action: 'removed', title: '옛 흐름', scenario_id: null },
      { action: 'renamed', title: '?' },
      { action: 'created', title: '' },
    ],
  })
  assert.deepEqual(reply?.changes, [
    { action: 'created', title: '상점 열기', scenarioId: 41 },
    { action: 'updated', title: '전투', scenarioId: 40 },
    { action: 'removed', title: '옛 흐름', scenarioId: null },
  ])
})

test('changes 가 없는 옛 reply 는 빈 목록이다', () => {
  assert.deepEqual(parseReply({ kind: 'reply', result: '저장했어요' })?.changes, [])
})
