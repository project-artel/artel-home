/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldAdoptView, UNSTATED_URL_LIFETIME_MS } from './contentMapFreshness.ts'
import type { ContentMapView } from './contentMapTypes.ts'

function view(url: string, expiresAt: string | null, scenes = 1): ContentMapView {
  return {
    scenes: Array.from({ length: scenes }, (_, index) => ({ id: `s${index}`, image: { url, expiresAt } })),
  } as unknown as ContentMapView
}

const NOW = Date.parse('2026-10-16T00:00:00Z')

test('keeps the held view when only the signature changed and it is still valid', () => {
  const far = new Date(NOW + 10 * 60_000).toISOString()
  assert.equal(shouldAdoptView(view('a', far), view('b', far), NOW, NOW + 10_000), false)
})

test('adopts the new view when the content changed', () => {
  const far = new Date(NOW + 10 * 60_000).toISOString()
  assert.equal(shouldAdoptView(view('a', far), view('b', far, 2), NOW, NOW + 10_000), true)
})

test('adopts the new view when the held URL is about to expire', () => {
  const soon = new Date(NOW + 30_000).toISOString()
  assert.equal(shouldAdoptView(view('a', soon), view('b', soon), NOW, NOW), true)
})

test('renews URLs with no stated expiry once the guess lifetime has passed', () => {
  assert.equal(shouldAdoptView(view('a', null), view('b', null), NOW, NOW + 1000), false)
  assert.equal(
    shouldAdoptView(view('a', null), view('b', null), NOW, NOW + UNSTATED_URL_LIFETIME_MS),
    true,
  )
})

test('adopts the first view', () => {
  assert.equal(shouldAdoptView(null, view('a', null), 0, NOW), true)
})
