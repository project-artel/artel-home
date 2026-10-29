import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arrowMid, arrowPath, boxOf, contains, controlFor, dragBox, moved, resized } from './annotationGeometry'
import type { RunMapAnnotation } from './runMapApi'

const arrow = (extra: Partial<Extract<RunMapAnnotation, { type: 'arrow' }>> = {}): Extract<RunMapAnnotation, { type: 'arrow' }> =>
  ({ id: 'a', type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, ...extra })

test('a straight arrow bends so that the curve passes through the dragged middle handle', () => {
  const straight = arrow()
  assert.deepEqual(arrowMid(straight), { x: 50, y: 0 })
  assert.equal(arrowPath(straight), 'M 0 0 L 100 0')
  const bent = { ...straight, ...controlFor(straight, { x: 50, y: 40 }) }
  assert.deepEqual({ cx: bent.cx, cy: bent.cy }, { cx: 50, cy: 80 })
  assert.deepEqual(arrowMid(bent), { x: 50, y: 40 })
  assert.equal(arrowPath(bent), 'M 0 0 Q 50 80 100 0')
})

test('the box of a note without a size is its default size, and a bent arrow includes its curve', () => {
  assert.deepEqual(boxOf({ id: 'n', type: 'note', x: 5, y: 6, text: '', color: 'y' }), { x: 5, y: 6, w: 180, h: 110 })
  assert.deepEqual(boxOf(arrow({ cx: 50, cy: 80 })), { x: 0, y: 0, w: 100, h: 40 })
})

test('dragging a corner keeps the opposite corner and never shrinks below the minimum', () => {
  const start = { x: 0, y: 0, w: 100, h: 50 }
  assert.deepEqual(dragBox(start, 'se', 150, 80), { x: 0, y: 0, w: 150, h: 80 })
  assert.deepEqual(dragBox(start, 'nw', 20, 10), { x: 20, y: 10, w: 80, h: 40 })
  assert.deepEqual(dragBox(start, 'e', -500, 999), { x: 0, y: 0, w: 16, h: 50 })
})

test('resizing a drawing scales its points, moving an arrow carries its bend', () => {
  const pen: RunMapAnnotation = { id: 'p', type: 'pen', points: [[0, 0], [10, 10]] }
  const scaled = resized(pen, { x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 20, h: 40 })
  assert.deepEqual(scaled.type === 'pen' && scaled.points, [[0, 0], [20, 40]])
  const shifted = moved(arrow({ cx: 50, cy: 80 }), 10, 5)
  assert.deepEqual(shifted.type === 'arrow' && [shifted.x1, shifted.cx, shifted.cy], [10, 60, 85])
})

test('a section holds what lies wholly inside it', () => {
  const section = { x: 0, y: 0, w: 300, h: 200 }
  assert.equal(contains(section, { x: 10, y: 10, w: 100, h: 50 }), true)
  assert.equal(contains(section, { x: 250, y: 10, w: 100, h: 50 }), false)
})
