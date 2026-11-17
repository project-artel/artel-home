/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeCallout, ringOf, type Box } from './coachGeometry.ts'

const viewport = { width: 1440, height: 900 }
const callout = { width: 340, height: 200 }

const overlaps = (a: Box, b: Box) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height

test('왼쪽 메뉴의 자리는 말풍선을 오른쪽에 붙이고 화살표가 자리 가운데를 가리킨다', () => {
  const ring = { left: 4, top: 400, width: 200, height: 40 }
  const placed = placeCallout(ring, callout, viewport)
  assert.equal(placed.side, 'right')
  assert.equal(placed.top + placed.arrow, ring.top + ring.height / 2)
})

test('오른쪽 끝의 버튼은 말풍선을 왼쪽에 붙인다', () => {
  const placed = placeCallout({ left: 1300, top: 100, width: 120, height: 36 }, callout, viewport)
  assert.equal(placed.side, 'left')
})

test('말풍선은 어느 쪽에 붙어도 짚는 자리와 겹치지 않는다', () => {
  const rings: Box[] = [
    { left: 4, top: 860, width: 200, height: 36 },
    { left: 1200, top: 4, width: 236, height: 40 },
    { left: 300, top: 300, width: 1100, height: 60 },
    { left: 700, top: 820, width: 300, height: 40 },
  ]
  for (const ring of rings) {
    const placed = placeCallout(ring, callout, viewport)
    assert.equal(overlaps(ring, { left: placed.left, top: placed.top, ...callout }), false, JSON.stringify(ring))
  }
})

test('화면만큼 큰 자리는 화면 오른쪽 아래에 둔다', () => {
  const placed = placeCallout({ left: 10, top: 10, width: 1420, height: 880 }, callout, viewport)
  assert.equal(placed.side, 'none')
  assert.equal(placed.left + callout.width, viewport.width - 12)
})

test('고리는 대상보다 조금 넓고 화면 밖으로 나가지 않는다', () => {
  const ring = ringOf({ left: 0, top: 0, width: 50, height: 20 }, viewport)
  assert.ok(ring.left >= 0 && ring.top >= 0)
  assert.ok(ring.width >= 50)
})
