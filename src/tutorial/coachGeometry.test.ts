/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dockFor, placeTag, ringOf, veilPieces } from './coachGeometry.ts'

const viewport = { width: 1440, height: 900 }
const HUD = 120

test('안내 줄은 아래에 두고, 아래에 두면 짚는 자리를 가릴 때만 위로 올린다', () => {
  assert.equal(dockFor({ left: 100, top: 300, width: 120, height: 36 }, viewport, HUD), 'bottom')
  assert.equal(dockFor({ left: 1200, top: 840, width: 120, height: 36 }, viewport, HUD), 'top')
  assert.equal(dockFor(null, viewport, HUD), 'bottom')
})

test('화면만큼 큰 자리는 덜 가리는 쪽에 둔다', () => {
  assert.equal(dockFor({ left: 0, top: 60, width: 1440, height: 820 }, viewport, HUD), 'top')
  assert.equal(dockFor({ left: 0, top: 20, width: 1440, height: 790 }, viewport, HUD), 'bottom')
})

test('위에 붙은 안내 줄 바로 아래의 자리면 꼬리표는 자리 아래로 간다', () => {
  const tag = { width: 120, height: 30 }
  const ring = { left: 600, top: 140, width: 100, height: 40 }
  const placed = placeTag(ring, tag, viewport, { dock: 'top', height: HUD })
  assert.ok(placed.top >= ring.top + ring.height)
})

test('고리는 대상보다 조금 넓고 화면 밖으로 나가지 않는다', () => {
  const ring = ringOf({ left: 0, top: 0, width: 50, height: 20 }, viewport)
  assert.ok(ring.left >= 0 && ring.top >= 0)
  assert.ok(ring.width >= 50)
})

test('덮개 네 장은 고리 자리를 비운다', () => {
  const ring = { left: 100, top: 200, width: 300, height: 50 }
  const pieces = veilPieces(ring, viewport)
  const covers = (x: number, y: number) => pieces.some((p) => x >= p.left && x < p.left + p.width && y >= p.top && y < p.top + p.height)
  assert.equal(covers(250, 225), false)
  assert.equal(covers(50, 225), true)
  assert.equal(covers(250, 100), true)
  assert.equal(covers(250, 600), true)
})
