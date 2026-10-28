import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldPollDemonstration } from './sessionState.ts'

test('중단 직후 sourceHash가 없으면 정리가 끝날 때까지 polling을 유지한다', () => {
  assert.equal(shouldPollDemonstration({ status: 'INTERRUPTED', sourceHash: null }), true)
  assert.equal(shouldPollDemonstration({ status: 'INTERRUPTED', sourceHash: 'settled' }), false)
  assert.equal(shouldPollDemonstration({ status: 'RECORDING', sourceHash: null }), true)
  assert.equal(shouldPollDemonstration({ status: 'FINALIZING', sourceHash: null }), true)
  assert.equal(shouldPollDemonstration({ status: 'SEALED', sourceHash: 'settled' }), false)
  assert.equal(shouldPollDemonstration(null), false)
})
