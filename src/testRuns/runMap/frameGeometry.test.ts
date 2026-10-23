import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoLayout, FRAME_W, frameHeight, segmentBands, STEPS_PER_LINE, stepPoint, wirePath } from './frameGeometry'

test('a step on the same line gets a straight wire, the first of a line an elbow through the gutter', () => {
  assert.match(wirePath(1), /^M [\d.]+ [\d.]+ H [\d.]+$/)
  const elbow = wirePath(STEPS_PER_LINE)
  assert.match(elbow, /V/)
  // 오른쪽 끝 · 왼쪽 끝을 지나 스텝을 가로지르지 않는다.
  assert.ok(elbow.includes(`H ${FRAME_W - 8}`))
  assert.ok(elbow.includes('H 8 '))
})

test('frames grow by lines and fold to one line', () => {
  assert.equal(frameHeight(8, false), frameHeight(1, false))
  assert.ok(frameHeight(9, false) > frameHeight(8, false))
  assert.ok(frameHeight(40, true) < frameHeight(1, false))
})

test('a segment that crosses a line is split and only the first piece is named', () => {
  const bands = segmentBands([{ scene: 'A', from: 0, to: STEPS_PER_LINE + 1 }, { scene: 'B', from: STEPS_PER_LINE + 2, to: STEPS_PER_LINE + 2 }])
  assert.deepEqual(bands.map((b) => [b.scene, b.first, b.shade]), [['A', true, false], ['A', false, false], ['B', true, true]])
  assert.equal(bands[1].top, stepPoint(STEPS_PER_LINE).y - 18)
})

test('auto layout keeps run order and fills the shortest column', () => {
  const placed = autoLayout([{ id: 'a', height: 500 }, { id: 'b', height: 100 }, { id: 'c', height: 100 }, { id: 'd', height: 100 }])
  assert.equal(placed.get('a')!.y, 20)
  assert.equal(placed.get('b')!.y, 20)
  assert.equal(placed.get('c')!.y, 20)
  // 네 번째는 가장 짧은 칸(b 아래)에 간다.
  assert.equal(placed.get('d')!.x, placed.get('b')!.x)
})
