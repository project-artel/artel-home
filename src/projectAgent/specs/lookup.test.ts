import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveEntry, resolveExactEntry, runLookups, scenarioLookups, type Lookup } from './lookup'

const lookups: Lookup<string>[] = [
  { entry: 'a', keys: ['agent:1', 'Login'], title: 'Login' },
  { entry: 'b', keys: ['agent:2', 'Login as guest'], title: 'Login as guest' },
  { entry: 'c', keys: ['developer:buy', 'Buy item'], title: 'Buy item' },
]

test('an exact key wins over a longer title that contains it', () => {
  assert.equal(resolveEntry('macro', 'login', lookups), 'a')
  assert.equal(resolveEntry('macro', 'agent:2', lookups), 'b')
})

test('a piece of a title picks the entry only when it is unique', () => {
  assert.equal(resolveEntry('macro', 'item', lookups), 'c')
  assert.throws(() => resolveEntry('macro', 'log', lookups), /matches 2 macro entries.*agent:1/)
})

test('numbers are read as ids, and nothing or blank is refused', () => {
  assert.equal(resolveEntry('node', 7, [{ entry: 'x', keys: ['7'], title: 'Seven' }]), 'x')
  assert.throws(() => resolveEntry('macro', 'zzz', lookups), /No macro matches "zzz"/)
  assert.throws(() => resolveEntry('macro', '  ', lookups), /macro is required/)
  assert.throws(() => resolveEntry('macro', undefined, lookups), /macro is required/)
})

test('a long candidate list is cut', () => {
  const many: Lookup<number>[] = Array.from({ length: 8 }, (_, index) => ({ entry: index, keys: [`id${index}`], title: `same ${index}` }))
  assert.throws(() => resolveEntry('item', 'same', many), /and 3 more/)
})

test('exact lookup refuses a partial id', () => {
  const runs = runLookups(['1042', '42'], (run) => run)
  assert.equal(resolveExactEntry('performance run', '42', runs), '42')
  assert.equal(resolveExactEntry('performance run', 1042, runs), '1042')
  assert.throws(() => resolveExactEntry('performance run', '04', runs), /No performance run has the id "04"/)
  assert.throws(() => resolveExactEntry('performance run', ' ', runs), /is required/)
})

test('scenarioLookups keys by id and titles by name', () => {
  const [lookup] = scenarioLookups([{ id: 'n1', name: 'Buy' }], (item) => item.id, (item) => item.name)
  assert.deepEqual(lookup.keys, ['n1'])
  assert.equal(lookup.title, 'Buy')
})
