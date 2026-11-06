/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readDiscriminator, selectorTail } from './screenDiscriminator.ts'

/*
 * 이 모듈이 조용히 틀리는 방식은 하나뿐이고 그것이 가장 나쁘다: 모르는 키가 섞인 조건을 아는
 * 모양으로 접어, 조건 셋이 걸린 화면을 둘짜리로 그리는 것. 화면을 봐서는 알 수 없다 — 목록은
 * 멀쩡해 보이고 빠진 줄만 없다.
 */

test('아는 모양이면 절 목록으로 읽는다', () => {
  const result = readDiscriminator(
    '[{"selector":"Canvas[2]/continue[2]","active":true},{"selector":"Canvas/panel","active":false}]',
  )

  assert.deepEqual(result, {
    form: 'clauses',
    clauses: [
      { selector: 'Canvas[2]/continue[2]', active: true },
      { selector: 'Canvas/panel', active: false },
    ],
  })
})

test('모르는 키가 하나라도 섞이면 원문을 그대로 남긴다', () => {
  const text = '[{"selector":"Canvas/continue","active":true,"threshold":0.8}]'

  // 아는 두 키만 뽑아 절로 그리면 화면이 조건 셋 중 둘만 보여 주면서 전부인 척한다.
  assert.deepEqual(readDiscriminator(text), { form: 'raw', text })
})

test('절의 타입이 어긋나면 원문을 그대로 남긴다', () => {
  const text = '[{"selector":"Canvas/continue","active":"true"}]'

  assert.deepEqual(readDiscriminator(text), { form: 'raw', text })
})

test('배열이 아니거나 JSON 이 아니면 원문을 그대로 남긴다', () => {
  assert.deepEqual(readDiscriminator('{"selector":"a","active":true}'), {
    form: 'raw',
    text: '{"selector":"a","active":true}',
  })
  assert.deepEqual(readDiscriminator('not json at all'), {
    form: 'raw',
    text: 'not json at all',
  })
})

test('빈 배열은 원문으로 남기고 빈 문자열만 없음이다', () => {
  // 절이 0 개인 화면은 없다 — 조건이 없으면 화면이 갈리지 않는다. 그래서 `[]` 는 "조건 없음"이
  // 아니라 "이 빌드가 읽을 줄 모르는 값"이다.
  assert.deepEqual(readDiscriminator('[]'), { form: 'raw', text: '[]' })
  assert.deepEqual(readDiscriminator('   '), { form: 'none' })
  assert.deepEqual(readDiscriminator(''), { form: 'none' })
})

test('빈 selector 는 절이 아니다', () => {
  const text = '[{"selector":"","active":true}]'

  assert.deepEqual(readDiscriminator(text), { form: 'raw', text })
})

test('selectorTail 은 마지막 마디만 남긴다', () => {
  assert.equal(selectorTail('Canvas[2]/panel/continue[2]'), 'continue[2]')
  // 마디가 하나뿐이거나 끝이 구분자면 통째로 남긴다 — 빈 문자열을 강조하면 두 화면이 같아 보인다.
  assert.equal(selectorTail('Canvas'), 'Canvas')
  assert.equal(selectorTail('Canvas/'), 'Canvas/')
})
