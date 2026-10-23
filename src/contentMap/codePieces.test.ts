import assert from 'node:assert/strict'
import { test } from 'node:test'
import { codePieces } from './codePieces.ts'

test('짝 맞는 백틱 사이만 코드로 가르고 나머지는 글로 둔다 (ARTEL-1172)', () => {
  assert.deepEqual(codePieces('`Canvas/Button` click → `Cards.BackToMain()`'), [
    { code: true, text: 'Canvas/Button' },
    { code: false, text: ' click → ' },
    { code: true, text: 'Cards.BackToMain()' },
  ])
  // 마크다운 기호는 해석하지 않고, 짝 없는 백틱과 빈 백틱은 글자로 남거나 사라진다.
  assert.deepEqual(codePieces('a * b [c] `x'), [{ code: false, text: 'a * b [c] `x' }])
  assert.deepEqual(codePieces('``빈'), [{ code: false, text: '빈' }])
  assert.deepEqual(codePieces(''), [])
})
