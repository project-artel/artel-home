import assert from 'node:assert/strict'
import test from 'node:test'
import { planDeleteCases } from './deleteCasesPlan'

const known = new Set(['a', 'b', 'c'])

test('duplicate ids are sent once', () => {
  assert.deepEqual(planDeleteCases(['a', 'b', 'a'], known), ['a', 'b'])
})

test('an empty list or a missing one is refused', () => {
  assert.throws(() => planDeleteCases([], known), /at least one/)
  assert.throws(() => planDeleteCases(undefined, known), /at least one/)
})

test('an unknown id is named', () => {
  assert.throws(() => planDeleteCases(['a', 'z'], known), /No test case has the id z/)
})

test('more than 500 distinct ids are refused, duplicates do not count', () => {
  const many = Array.from({ length: 501 }, (_, index) => `id${index}`)
  const everything = new Set(many)
  assert.throws(() => planDeleteCases(many, everything), /501 ids; delete at most 500/)
  assert.equal(planDeleteCases([...many.slice(0, 500), ...many.slice(0, 10)], everything).length, 500)
})
