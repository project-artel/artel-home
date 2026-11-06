import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRunLocks } from './runLockApi'

test('reads which scenario Artel Bot holds, who asked, since when and what it is doing', () => {
  const locks = parseRunLocks({ scenarios: [{ scenarioId: '12', requestedBy: '7', requestedByName: '김태민', mine: false, startedAt: '2026-10-23T06:00:00Z', stage: 'writing', choosing: true }] })
  assert.deepEqual(locks, [{ scenarioId: '12', requestedBy: '7', requestedByName: '김태민', mine: false, startedAt: Date.parse('2026-10-23T06:00:00Z'), stage: 'writing', choosing: true }])
})

test('drops entries without a scenario and stages it does not know', () => {
  const locks = parseRunLocks({ scenarios: [{ requestedBy: '7' }, { scenarioId: '3', stage: 'dancing', startedAt: '2026-10-23T06:00:00Z' }] })
  assert.equal(locks.length, 1)
  assert.equal(locks[0].stage, null)
  assert.deepEqual(parseRunLocks(null), [])
})
