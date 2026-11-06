import assert from 'node:assert/strict'
import test from 'node:test'

import { messages } from '../i18n/messages.ts'
import { conditionSummary } from './conditionSummary.ts'
import type { ConditionNode } from './contentMapTypes.ts'

/*
 * 접다가 뜻이 뒤집히는 것만 본다.
 *
 * 이 함수가 틀려도 아무것도 던지지 않는다. 그래프 위에 그럴듯한 한 줄이 그려질
 * 뿐이고, 그것을 읽은 사람은 반대로 된 조건을 믿는다. 화면을 봐서는 알 수 없는
 * 경우들이라 여기서 잡는다.
 */

const t = messages.ko

function test_(kind: 'every' | 'either', parts: ConditionNode[]): ConditionNode {
  return { kind, parts }
}

const press: ConditionNode = { kind: 'gesture', input: 'Space', offset: 0 }
const hp: ConditionNode = {
  kind: 'test',
  left: 'player.hp',
  operator: '>',
  right: '0',
  context: null,
  subjectLost: null,
  offset: 0,
}

test('either 와 every 는 다른 말로 이어진다', () => {
  const both = conditionSummary(t, test_('every', [press, hp]))
  const one = conditionSummary(t, test_('either', [press, hp]))

  assert.notEqual(both, one)
  assert.ok(both.includes('그리고'))
  assert.ok(one.includes('또는'))
})

test('test 는 연산자를 그대로 옮긴다', () => {
  // `>` 를 "크다"로 옮기기 시작하면 `>=` 와 구분이 사라진다.
  assert.equal(conditionSummary(t, hp), 'player.hp > 0')
})

test('always 와 unknown 은 같은 줄이 되지 않는다', () => {
  const always = conditionSummary(t, { kind: 'always' })
  const unknown = conditionSummary(t, { kind: 'unknown', reason: 'subject-null', unread: null })

  assert.notEqual(always, unknown)
})

test('모르는 kind 는 서버가 쓴 이름을 그대로 보인다', () => {
  const line = conditionSummary(t, { kind: 'unrecognisedKind', reportedKind: 'WhenEver' })

  assert.ok(line.includes('WhenEver'))
})

test('내용이 빈 마디를 아무 때나로 접지 않는다', () => {
  const empty = conditionSummary(t, test_('every', []))
  const always = conditionSummary(t, { kind: 'always' })

  assert.notEqual(empty, always)
})

test('부분이 많으면 몇 개가 더 있는지 센다', () => {
  const line = conditionSummary(t, test_('every', [press, hp, press, hp]))

  // 접었다는 사실 자체가 화면에 남아야 한다. 조용히 자르면 두 조건짜리 전이와
  // 네 조건짜리 전이가 같은 라벨을 갖는다.
  assert.ok(line.includes('외 2개'))
})

test('중첩된 마디도 한 줄로 접힌다', () => {
  const line = conditionSummary(t, test_('either', [test_('every', [press, hp]), hp]))

  assert.ok(line.includes('그리고'))
  assert.ok(line.includes('또는'))
})
