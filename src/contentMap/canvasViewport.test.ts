import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clientToUser,
  formatViewBox,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  parseViewBox,
  sameRect,
  userPerPixel,
  zoomAbout,
} from './canvasViewport'

const BASE = { x: 0, y: 0, w: 400, h: 200 }

/** An element wider than the drawing, so `meet` letterboxes left and right. */
const WIDE = { width: 800, height: 200 }

test('a viewBox parses into four numbers', () => {
  assert.deepEqual(parseViewBox('-10 -20 400 200'), { x: -10, y: -20, w: 400, h: 200 })
})

test('a comma-separated viewBox parses the same way', () => {
  assert.deepEqual(parseViewBox('0,0,100,50'), { x: 0, y: 0, w: 100, h: 50 })
})

test('a malformed viewBox falls back to a unit square instead of throwing', () => {
  // A blank page would hide whether the layout produced a bad string or the
  // canvas failed for some other reason.
  assert.deepEqual(parseViewBox('not a viewBox'), { x: 0, y: 0, w: 100, h: 100 })
  assert.deepEqual(parseViewBox('0 0 400'), { x: 0, y: 0, w: 100, h: 100 })
})

test('a zero or negative extent is replaced, so nothing divides by it', () => {
  assert.equal(parseViewBox('0 0 0 200').w, 100)
  assert.equal(parseViewBox('0 0 400 -5').h, 100)
})

test('the scale under meet is set by the axis that runs out of room first', () => {
  // 400/800 = 0.5 across, 200/200 = 1 down. `meet` fits the whole rectangle,
  // so the larger ratio wins and both axes share it.
  assert.equal(userPerPixel(BASE, WIDE), 1)
})

test('a client point maps through the letterbox, not through the element width', () => {
  // At unit 1 the drawing is 400 wide inside an 800 wide element, so 200px of
  // dead space sits on each side. The element's own centre is the drawing's.
  assert.deepEqual(clientToUser(BASE, WIDE, 400, 100), { x: 200, y: 100 })
  // The drawing's left edge is 200px in, not at 0.
  assert.deepEqual(clientToUser(BASE, WIDE, 200, 0), { x: 0, y: 0 })
})

test('zooming keeps the point under the cursor under the cursor', () => {
  const at = clientToUser(BASE, WIDE, 300, 50)
  const zoomed = zoomAbout(BASE, BASE, 2, at.x, at.y)
  const after = clientToUser(zoomed, WIDE, 300, 50)
  assert.ok(Math.abs(after.x - at.x) < 1e-9, `x drifted: ${after.x} vs ${at.x}`)
  assert.ok(Math.abs(after.y - at.y) < 1e-9, `y drifted: ${after.y} vs ${at.y}`)
})

test('zooming in halves the extent, so the drawing doubles', () => {
  const zoomed = zoomAbout(BASE, BASE, 2, 200, 100)
  assert.equal(zoomed.w, 200)
  assert.equal(zoomed.h, 100)
})

test('repeated zooming cannot creep past the limits one notch at a time', () => {
  // The clamp is against the base, not against the previous rectangle, which
  // is the whole reason a hundred small steps land on the ceiling exactly.
  let rect = BASE
  for (let i = 0; i < 100; i += 1) rect = zoomAbout(BASE, rect, 1.35, 200, 100)
  assert.equal(rect.w, BASE.w / MAX_SCALE)

  rect = BASE
  for (let i = 0; i < 100; i += 1) rect = zoomAbout(BASE, rect, 1 / 1.35, 200, 100)
  assert.equal(rect.w, BASE.w / MIN_SCALE)
})

test('the floor sits below the framed drawing, so zoom out is never dead at rest', () => {
  assert.ok(MIN_SCALE < 1, 'a floor of 1 would leave the control present and inert')
})

test('panning moves by the pointer travel converted to user units', () => {
  // Dragging right moves the drawing right, which means the window moves left.
  assert.deepEqual(panBy(BASE, WIDE, 50, 20), { x: -50, y: -20, w: 400, h: 200 })
})

test('panning keeps pace with the hand after a zoom', () => {
  const zoomed = zoomAbout(BASE, BASE, 4, 200, 100)
  const unit = userPerPixel(zoomed, WIDE)
  const panned = panBy(zoomed, WIDE, 40, 0)
  assert.equal(panned.x, zoomed.x - 40 * unit)
})

test('a degenerate element box does not divide by zero', () => {
  assert.equal(userPerPixel(BASE, { width: 0, height: 0 }), 1)
})

test('the formatted viewBox is rounded, so tiny drift does not churn the attribute', () => {
  assert.equal(formatViewBox({ x: 0.123456, y: -1.987, w: 400.004, h: 200 }), '0.12 -1.99 400 200')
})

test('two rectangles are the same only when all four numbers match', () => {
  assert.ok(sameRect(BASE, { ...BASE }))
  assert.ok(!sameRect(BASE, { ...BASE, x: 1 }))
})
