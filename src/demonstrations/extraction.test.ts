import assert from 'node:assert/strict'
import test from 'node:test'
import { ExtractionGate } from './extraction.ts'

test('자동 추출과 수동 버튼이 동시에 실행되지 않고 실패 후 수동으로만 재시도한다', () => {
  const gate = new ExtractionGate()
  assert.equal(gate.claim('one', true), true)
  assert.equal(gate.claim('one', false), false)
  assert.equal(gate.claim('two', true), false)
  gate.finish()
  assert.equal(gate.claim('one', true), false)
  assert.equal(gate.claim('one', false), true)
  gate.finish()
  assert.equal(gate.claim('two', true), true)
})
