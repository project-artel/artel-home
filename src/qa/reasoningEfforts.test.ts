import assert from 'node:assert/strict'
import { test } from 'node:test'
import { byAscendingEffort, EFFORT_STRENGTH } from './reasoningEfforts'

test('a slider built on this runs weakest to strongest', () => {
  // The order the agent catalog sends, which is strongest first.
  const fromCatalog = ['max', 'xhigh', 'high', 'medium', 'low']

  assert.deepEqual(byAscendingEffort(fromCatalog), [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ])
})

test('the last slider position is the strongest effort the model takes', () => {
  // Grok advertises four efforts and no `max`; Kimi three and no `xhigh` or `medium`.
  assert.equal(byAscendingEffort(['xhigh', 'high', 'medium', 'low']).at(-1), 'xhigh')
  assert.equal(byAscendingEffort(['max', 'high', 'low']).at(-1), 'max')
  assert.equal(byAscendingEffort(['high', 'medium', 'low']).at(-1), 'high')
})

test('the first slider position is the weakest effort the model takes', () => {
  assert.equal(byAscendingEffort(['max', 'high', 'low']).at(0), 'low')
  assert.equal(byAscendingEffort(['max', 'xhigh']).at(0), 'xhigh')
})

test('an effort this list does not know is kept, at the strong end', () => {
  // The catalog is the authority on what a model accepts; dropping an unknown
  // value would quietly take a choice away from the operator.
  assert.deepEqual(byAscendingEffort(['ultra', 'low', 'high']), ['low', 'high', 'ultra'])
})

test('the input is not mutated', () => {
  const given = ['max', 'low']
  byAscendingEffort(given)
  assert.deepEqual(given, ['max', 'low'])
})

test('every effort the agent catalog models has a rank', () => {
  // `ReasoningEffort` on the agent side. A value missing here still works but
  // sorts to the end, which is a worse default than naming it.
  assert.deepEqual([...EFFORT_STRENGTH].sort(), ['high', 'low', 'max', 'medium', 'xhigh'])
})
