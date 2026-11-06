import assert from 'node:assert/strict'
import test from 'node:test'
import { ESC_WINDOW_MS, pressEscape } from './escCancel'

/**
 * ESC 두 번으로 저작 요청을 끊는다(ARTEL-956). 두 번인 이유는 되돌릴 수 없어서다 —
 * 끊긴 턴은 이어서 하는 길이 없다.
 */

test('첫 ESC 는 묻고, 창 안의 두 번째가 끊는다', () => {
  const first = pressEscape(null, 1_000, true)
  assert.deepEqual(first, { verdict: 'armed', armedAt: 1_000 })

  const second = pressEscape(first.armedAt, 1_000 + ESC_WINDOW_MS, true)
  assert.deepEqual(second, { verdict: 'cancel', armedAt: null })
})

test('창을 넘긴 두 번째는 다시 첫 번째다', () => {
  // 한참 전에 누른 ESC 가 지금의 한 번과 짝이 되면, 한 번에 끊기는 것과 다르지 않다.
  const late = pressEscape(1_000, 1_000 + ESC_WINDOW_MS + 1, true)
  assert.deepEqual(late, { verdict: 'armed', armedAt: 1_000 + ESC_WINDOW_MS + 1 })
})

test('도는 요청이 없으면 ESC 는 아무 뜻이 없다', () => {
  // 한가한 화면에서 "한 번 더 누르면 종료" 가 뜨면 무엇이 종료되는지 알 수 없다.
  assert.deepEqual(pressEscape(null, 1_000, false), { verdict: 'ignored', armedAt: null })
  // 물어본 상태로 기다리다 턴이 끝났다. 그 뒤의 ESC 도 아무것도 끊지 않는다.
  assert.deepEqual(pressEscape(1_000, 1_200, false), { verdict: 'ignored', armedAt: null })
})

test('시계가 뒤로 가도 끊지 않는다', () => {
  // 모르면 묻는 쪽이 안전하다 — 끊는 쪽으로 기울면 누른 적 없는 취소가 일어난다.
  assert.equal(pressEscape(2_000, 1_500, true).verdict, 'armed')
})
