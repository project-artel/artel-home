import assert from 'node:assert/strict'
import test from 'node:test'
import { diffLines, foldUnchanged, splitLines, type DiffLine } from './lineDiff'

function render(lines: DiffLine[]): string[] {
  const marker = { add: '+', remove: '-', context: ' ' }
  return lines.map((line) => `${marker[line.kind]}${line.text}`)
}

test('splitLines drops one trailing newline and treats null and empty as no lines', () => {
  assert.deepEqual(splitLines('a\nb\n'), ['a', 'b'])
  assert.deepEqual(splitLines('a\r\nb'), ['a', 'b'])
  assert.deepEqual(splitLines(null), [])
  assert.deepEqual(splitLines(''), [])
})

test('identical texts are all context', () => {
  assert.deepEqual(render(diffLines('a\nb', 'a\nb')), [' a', ' b'])
})

test('CREATE is all additions and DELETE is all removals', () => {
  assert.deepEqual(render(diffLines(null, 'a\nb')), ['+a', '+b'])
  assert.deepEqual(render(diffLines('a\nb', null)), ['-a', '-b'])
})

test('a changed middle line is a removal followed by an addition', () => {
  assert.deepEqual(render(diffLines('a\nb\nc', 'a\nB\nc')), [' a', '-b', '+B', ' c'])
})

test('insertion and deletion in one text keep the common lines', () => {
  assert.deepEqual(
    render(diffLines('a\nb\nc\nd', 'a\nc\nd\ne')),
    [' a', '-b', ' c', ' d', '+e'],
  )
})

test('line numbers follow each side', () => {
  const lines = diffLines('a\nb\nc', 'a\nc\nd')
  assert.deepEqual(
    lines.map((line) => [line.beforeNumber, line.afterNumber]),
    [[1, 1], [2, null], [3, 2], [null, 3]],
  )
})

test('an oversized middle falls back to a full replacement', () => {
  const before = Array.from({ length: 2100 }, (_, i) => `a${i}`).join('\n')
  const after = Array.from({ length: 2100 }, (_, i) => `b${i}`).join('\n')
  const lines = diffLines(before, after)
  assert.equal(lines.filter((line) => line.kind === 'remove').length, 2100)
  assert.equal(lines.filter((line) => line.kind === 'add').length, 2100)
})

test('foldUnchanged keeps 3 lines around a change and folds the rest', () => {
  const body = Array.from({ length: 20 }, (_, i) => `line ${i}`)
  const changed = [...body.slice(0, 10), 'changed', ...body.slice(11)]
  const rows = foldUnchanged(diffLines(body.join('\n'), changed.join('\n')), 3)
  const kinds = rows.map((row) => row.kind)
  assert.deepEqual(kinds, [
    'fold', 'context', 'context', 'context', 'remove', 'add',
    'context', 'context', 'context', 'fold',
  ])
  const first = rows[0]
  assert.equal(first.kind === 'fold' ? first.lines.length : -1, 7)
  const last = rows[rows.length - 1]
  assert.equal(last.kind === 'fold' ? last.lines.length : -1, 6)
})

test('foldUnchanged does not fold a single hidden line', () => {
  const lines = diffLines('a\nb\nc\nd\ne\nf\ng\nh\nx', 'A\nb\nc\nd\ne\nf\ng\nh\nX')
  assert.equal(foldUnchanged(lines, 3).some((row) => row.kind === 'fold'), false)
})

test('foldUnchanged leaves a pure CREATE untouched', () => {
  const rows = foldUnchanged(diffLines(null, 'a\nb\nc\nd\ne'), 3)
  assert.equal(rows.length, 5)
  assert.ok(rows.every((row) => row.kind === 'add'))
})
