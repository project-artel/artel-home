import assert from 'node:assert/strict'
import test from 'node:test'
import { answeredOf, choicesOf, composeAnswers } from './askFlow'
import type { RunChatQuestion } from './runChatApi'

// 입력 칸 위에서 하나씩 답하고, 다 답하면 평범한 대화 한 줄로 보낸다(ARTEL-1118).

const ask = (id: string, text: string, labels: string[] = []): RunChatQuestion => ({
  id, text, why: null, allowFreeText: true,
  options: labels.map((label, index) => ({ id: `o${index + 1}`, label, detail: null })),
})

test('보기 뒤에 직접 입력과 건너뛰기가 붙는다', () => {
  assert.deepEqual(choicesOf(ask('a', '넣을까요?', ['넣어 줘', '그냥 둬'])).map((choice) => choice.kind), ['option', 'option', 'own', 'skip'])
  assert.deepEqual(choicesOf({ ...ask('a', '넣을까요?', ['넣어 줘']), allowFreeText: false }).map((choice) => choice.kind), ['option', 'skip'])
})

test('질문이 하나면 답 그대로 보낸다 — 사람이 말하듯', () => {
  assert.equal(composeAnswers([ask('a', '2~5단계도 넣을까요?')], [{ kind: 'option', text: '2~5단계도 넣어 줘' }]), '2~5단계도 넣어 줘')
})

test('여럿이면 어느 질문의 답인지 붙이고, 건너뛴 것은 뺀다', () => {
  const asks = [ask('a', '구매 실패도 넣을까요?'), ask('b', '상점 닫기도 볼까요?'), ask('c', '순서는 어떻게?')]
  assert.equal(
    composeAnswers(asks, [{ kind: 'option', text: '넣어 줘' }, { kind: 'skip' }, { kind: 'text', text: '닫기 먼저' }]),
    '1. 구매 실패도 넣을까요? → 넣어 줘\n2. 순서는 어떻게? → 닫기 먼저',
  )
})

test('전부 건너뛰면 보낼 것이 없다', () => {
  assert.equal(composeAnswers([ask('a', '넣을까요?')], [{ kind: 'skip' }]), null)
  assert.equal(composeAnswers([ask('a', '넣을까요?')], [{ kind: 'text', text: '   ' }]), null)
})

test('질문지 묶음은 건너뛴 것만 빼고 질문 · 고른 보기와 함께 한 번에 모인다', () => {
  const asks: RunChatQuestion[] = [
    { id: 'gap:광장→숲', text: '광장→숲 구간을 어떻게 넘어가나요?', why: null, options: [{ id: 'auto', label: '저절로 넘어감', detail: null }], allowFreeText: true },
    { id: 'gap:숲→광장', text: '숲→광장 구간을 어떻게 넘어가나요?', why: null, options: [], allowFreeText: true },
    { id: 'gap:광장→대장간', text: '광장→대장간 구간을 어떻게 넘어가나요?', why: null, options: [], allowFreeText: true },
  ]
  const answered = answeredOf(
    asks,
    [{ kind: 'text', text: '지도를 열고 숲을 누른다' }, { kind: 'skip' }, { kind: 'option', text: '저절로 넘어감' }],
    [null, null, 'auto'],
  )
  assert.deepEqual(answered.map((one) => [one.question.id, one.answer.text, one.optionId]), [
    ['gap:광장→숲', '지도를 열고 숲을 누른다', null],
    ['gap:광장→대장간', '저절로 넘어감', 'auto'],
  ])
})

