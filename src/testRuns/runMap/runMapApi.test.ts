import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRunMap } from './runMapApi'

test('reads every annotation kind and drops what it cannot draw', () => {
  const map = parseRunMap({
    version: 3,
    layout: { '12': { x: 10, y: 20, folded: true }, bad: { x: 'a' } },
    annotations: [
      { id: 'n', type: 'note', x: 1, y: 2, text: '메모', color: 'q' },
      { id: 't', type: 'text', x: 1, y: 2, text: '글' },
      { id: 'r', type: 'rect', x: 1, y: 2, w: 3, h: 4 },
      { id: 'a', type: 'arrow', x1: 0, y1: 0, x2: 5, y2: 5 },
      { id: 'p', type: 'pen', points: [[0, 0], [1, 1], ['x', 2]] },
      { id: 'p2', type: 'pen', points: [[0, 0]] },
      { id: 'v', type: 'video', x: 0, y: 0 },
      { type: 'note', x: 0, y: 0, text: 'id 없음' },
    ],
    authors: { '1': '나', '2': 3 },
  })
  assert.equal(map.version, 3)
  assert.deepEqual(map.layout, { '12': { x: 10, y: 20, folded: true } })
  assert.deepEqual(map.annotations.map((a) => a.id), ['n', 't', 'r', 'a', 'p'])
  const note = map.annotations[0]
  assert.equal(note.type === 'note' && note.color, 'y')
  const pen = map.annotations[4]
  assert.equal(pen.type === 'pen' && pen.points.length, 2)
  assert.deepEqual(map.authors, { '1': '나' })
})

test('an empty or broken body is an empty map', () => {
  assert.deepEqual(parseRunMap(null), { version: 0, layout: {}, annotations: [], authors: {} })
})
