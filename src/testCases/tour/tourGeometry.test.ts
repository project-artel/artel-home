/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOLE_PADDING, holeClipPath, holeOf, placeBubble } from './tourGeometry.ts'

const viewport = { width: 1600, height: 900 }
const bubble = { width: 340, height: 200 }

test('강조 박스는 대상보다 조금 넓고 화면 밖으로 나가지 않는다', () => {
  assert.deepEqual(holeOf({ left: 100, top: 50, width: 200, height: 40 }, viewport), {
    left: 100 - HOLE_PADDING,
    top: 50 - HOLE_PADDING,
    width: 200 + HOLE_PADDING * 2,
    height: 40 + HOLE_PADDING * 2,
  })
  assert.deepEqual(holeOf({ left: -20, top: 880, width: 100, height: 100 }, viewport), {
    left: 0,
    top: 880 - HOLE_PADDING,
    width: 100 - 20 + HOLE_PADDING,
    height: 900 - (880 - HOLE_PADDING),
  })
})

test('막은 대상 자리만 뚫는다', () => {
  assert.equal(holeClipPath(null), 'none')
  assert.match(holeClipPath({ left: 10, top: 20, width: 30, height: 40 }), /^polygon\(evenodd, .* 10px 20px, 40px 20px, 40px 60px, 10px 60px, 10px 20px\)$/)
})

test('말풍선은 오른쪽이 되면 오른쪽, 안 되면 왼쪽 · 아래 · 위 순이다', () => {
  assert.equal(placeBubble({ left: 100, top: 300, width: 200, height: 100 }, bubble, viewport).side, 'right')
  assert.equal(placeBubble({ left: 1300, top: 300, width: 250, height: 100 }, bubble, viewport).side, 'left')
  assert.equal(placeBubble({ left: 100, top: 100, width: 1400, height: 60 }, bubble, viewport).side, 'bottom')
  assert.equal(placeBubble({ left: 100, top: 650, width: 1400, height: 200 }, bubble, viewport).side, 'top')
})

test('가로로 넓은 대상은 옆보다 아래가 먼저다', () => {
  assert.equal(placeBubble({ left: 500, top: 150, width: 1000, height: 60 }, bubble, viewport).side, 'bottom')
})

test('들어갈 쪽이 없으면 대상 안쪽에 겹쳐 화면 안에 두고, 대상이 없으면 가운데다', () => {
  const huge = placeBubble({ left: 0, top: 0, width: 1600, height: 900 }, bubble, viewport)
  assert.equal(huge.side, 'center')
  assert.ok(huge.top + bubble.height <= viewport.height)
  assert.deepEqual(placeBubble(null, bubble, viewport), { left: 630, top: 350, side: 'center', arrow: 0 })
})

test('말풍선은 화면 가장자리 안에 머물고 화살표는 대상 가운데를 향한다', () => {
  const placed = placeBubble({ left: 100, top: 5, width: 200, height: 30 }, bubble, viewport)
  assert.equal(placed.side, 'right')
  assert.ok(placed.top >= 12)
  assert.ok(placed.arrow >= 18 && placed.arrow <= bubble.height - 18)
})
