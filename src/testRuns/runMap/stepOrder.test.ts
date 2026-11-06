import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MapStep } from './runMapModel'
import { moveRange, stepBlocks } from './stepOrder'

const step = (tc: number | null, gap = false) => ({ tc, gap }) as unknown as MapStep

test('consecutive steps of one TC are one block, steps without a TC stand alone', () => {
  const steps = [step(null), step(1), step(1), step(null), step(2), step(2, true), step(3)]
  assert.deepEqual(stepBlocks(steps, 0, 6), [
    { kind: 'step', index: 0 },
    { kind: 'tc', tc: 1, start: 1, end: 2 },
    { kind: 'step', index: 3 },
    { kind: 'tc', tc: 2, start: 4, end: 4 },
    { kind: 'step', index: 5 },
    { kind: 'tc', tc: 3, start: 6, end: 6 },
  ])
})

test('moves a range forward or back, and refuses to drop it into itself', () => {
  const items = ['a', 'b', 'c', 'd', 'e']
  assert.deepEqual(moveRange(items, 1, 2, 5), ['a', 'd', 'e', 'b', 'c'])
  assert.deepEqual(moveRange(items, 3, 4, 0), ['d', 'e', 'a', 'b', 'c'])
  assert.deepEqual(moveRange(items, 0, 0, 2), ['b', 'a', 'c', 'd', 'e'])
  assert.equal(moveRange(items, 1, 2, 2), null)
  assert.equal(moveRange(items, 1, 2, 3), null)
})
