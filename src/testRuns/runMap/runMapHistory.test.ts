import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyHistory, record, redo, undo } from './runMapHistory'

test('undo then redo walks the same entry back and forth', () => {
  let h = record(record(emptyHistory<number>(), { label: 'a', before: 0, after: 1 }), { label: 'b', before: 1, after: 2 })
  const u = undo(h)!
  assert.equal(u.entry.label, 'b')
  h = u.history
  const r = redo(h)!
  assert.equal(r.entry.after, 2)
  assert.equal(r.history.undo.length, 2)
})

test('a new action clears redo and the stack is capped', () => {
  let h = record(emptyHistory<number>(), { label: 'a', before: 0, after: 1 })
  h = undo(h)!.history
  h = record(h, { label: 'c', before: 0, after: 5 })
  assert.equal(h.redo.length, 0)
  for (let i = 0; i < 150; i++) h = record(h, { label: String(i), before: i, after: i + 1 })
  assert.equal(h.undo.length, 100)
  assert.equal(undo(emptyHistory<number>()), null)
})
