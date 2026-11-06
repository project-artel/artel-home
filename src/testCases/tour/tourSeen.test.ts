/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasSeenTour, markTourSeen, tourKey } from './tourSeen.ts'

function memory() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), values }
}

test('처음에는 안 봤고, 끝내거나 건너뛰면 본 것으로 적는다', () => {
  const store = memory()
  assert.equal(hasSeenTour('caseLibrary', store), false)
  markTourSeen('caseLibrary', 'skipped', store)
  assert.equal(hasSeenTour('caseLibrary', store), true)
  assert.equal(store.values.get(tourKey('caseLibrary')), 'skipped')
})

test('저장소를 못 쓰면 매번 튀어나오지 않게 본 것으로 친다', () => {
  assert.equal(hasSeenTour('caseLibrary', null), true)
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.equal(hasSeenTour('caseLibrary', broken), true)
  assert.doesNotThrow(() => markTourSeen('caseLibrary', 'done', broken))
})
