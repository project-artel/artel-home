import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRunLock } from './runLockApi'

test('reads who asked Artel Bot, since when and what it is doing', () => {
  const lock = parseRunLock({ locked: true, requestedBy: '7', requestedByName: '김태민', mine: false, startedAt: '2026-10-23T06:00:00Z', stage: 'writing' })
  assert.deepEqual(lock, { locked: true, requestedBy: '7', requestedByName: '김태민', mine: false, startedAt: Date.parse('2026-10-23T06:00:00Z'), stage: 'writing' })
})

test('an unknown stage is dropped, and anything but locked:true is unlocked', () => {
  const lock = parseRunLock({ locked: true, requestedBy: '7', requestedByName: 'A', startedAt: '2026-10-23T06:00:00Z', stage: 'dancing' })
  assert.equal(lock.locked && lock.stage, null)
  assert.deepEqual(parseRunLock({ locked: false }), { locked: false })
  assert.deepEqual(parseRunLock(null), { locked: false })
})
