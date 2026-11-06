import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RecentCache, versionCasesKey } from './versionCaseCache'

test('keeps only the most recently used entries', () => {
  const cache = new RecentCache<number>(2)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.get('a')
  cache.set('c', 3)

  assert.equal(cache.get('a'), 1)
  assert.equal(cache.get('b'), undefined)
  assert.equal(cache.get('c'), 3)
})

test('setting an existing key replaces it without growing', () => {
  const cache = new RecentCache<number>(2)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('a', 10)
  cache.set('c', 3)

  assert.equal(cache.get('a'), 10)
  assert.equal(cache.get('b'), undefined)
})

test('the key tells projects, versions and comparisons apart', () => {
  assert.notEqual(versionCasesKey('1', '8', null), versionCasesKey('2', '8', null))
  assert.notEqual(versionCasesKey('1', '8', null), versionCasesKey('1', '8', '11'))
})
