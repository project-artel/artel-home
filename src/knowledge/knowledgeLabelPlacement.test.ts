import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { displayWidth, truncate } from './knowledgeLabels'
import { placeLabels } from './knowledgeLabelPlacement'
import type { PlacedNode } from './knowledgeLayout'
import type { KnowledgeNode } from './knowledgeTypes'

/*
 * What this file defends is readability, and the way it broke was silent.
 *
 * Labels were cut by character count while the summaries are Korean sentences,
 * so a label that measured "22 long" drew twice that wide and landed on the one
 * beside it. Nothing threw; the picture just became unreadable. Both halves of
 * the fix — measuring width, and refusing to draw a label on top of another —
 * are asserted here because neither has any other alarm.
 */

const KOREAN = '타이틀 화면(TitleScene)에는 게임 시작(MapSceneButton), 이어하기(continue), 종료(ExitButton) 세 버튼이 세로로 배치되어 있다.'

function node(id: string, x: number, y: number, degree = 0): PlacedNode {
  const knowledge: KnowledgeNode = {
    id,
    tag: 'MISC',
    source: 'QA',
    summary: `summary ${id}`,
    version: 1,
    createdByQaTryId: null,
    createdAt: '2026-08-11T00:00:00Z',
    anchors: [],
  }
  return { node: knowledge, x, y, component: 0, degree }
}

const OPTIONS = {
  unitWidth: 6,
  lineHeight: 13,
  widthLimit: 22,
  keep: new Set<string>(),
}

describe('displayWidth', () => {
  it('counts a Hangul syllable as two Latin characters', () => {
    assert.equal(displayWidth('abcd'), 4)
    assert.equal(displayWidth('가나'), 4)
  })

  it('measures a mixed string by width, not by character count', () => {
    // The bug in one line: same character count, very different drawn width.
    assert.equal('가나다'.length, 'abc'.length)
    assert.notEqual(displayWidth('가나다'), displayWidth('abc'))
  })
})

describe('truncate', () => {
  it('cuts a Korean sentence to the width budget, not the character count', () => {
    const cut = truncate(KOREAN, 22)
    assert.ok(displayWidth(cut) <= 22, `${cut} is ${displayWidth(cut)} wide`)
    assert.ok(cut.endsWith('…'))
  })

  it('leaves a string already inside the budget untouched, ellipsis included', () => {
    assert.equal(truncate('지식 카운터', 22), '지식 카운터')
  })

  it('yields the ellipsis alone when nothing fits beside it', () => {
    assert.equal(truncate('가나다', 1), '…')
  })
})

describe('placeLabels', () => {
  it('moves a label above its node rather than dropping it', () => {
    // Two nodes too close to both sit below. The second takes the slot above
    // instead of being dropped — dropping is the last resort, not the first.
    const placed = placeLabels(
      [node('1', 0, 0, 2), node('2', 8, 0, 1)],
      () => '가나다라마바사',
      OPTIONS,
    )
    assert.equal(placed.size, 2)
    assert.ok((placed.get('1')?.y ?? 0) > 0)
    assert.ok((placed.get('2')?.y ?? 0) < 0)
  })

  it('drops the label that has neither slot left', () => {
    // Three nodes stacked on the same row: one label fits below, one above, and
    // the third has nowhere to go. It is dropped rather than drawn on top of a
    // neighbour — a covered label loses both, and the node is still clickable.
    const placed = placeLabels(
      [node('1', 0, 0, 3), node('2', 8, 0, 2), node('3', 16, 0, 1)],
      () => '가나다라마바사',
      OPTIONS,
    )
    assert.equal(placed.size, 2)
    // The busiest nodes keep their names — they are what a reader orients by.
    assert.ok(placed.has('1'))
    assert.ok(placed.has('2'))
    assert.ok(!placed.has('3'))
  })

  it('keeps labels apart when there is room', () => {
    const placed = placeLabels([node('1', 0, 0), node('2', 400, 0)], () => '가나다', OPTIONS)
    assert.equal(placed.size, 2)
  })

  it('always draws a kept label even where it collides', () => {
    const placed = placeLabels([node('1', 0, 0, 5), node('2', 4, 0, 0)], () => '가나다라마바사', {
      ...OPTIONS,
      keep: new Set(['2']),
    })
    assert.ok(placed.has('2'), 'the selection must be named')
  })

  it('skips a node whose label is empty', () => {
    const placed = placeLabels([node('1', 0, 0)], () => '', OPTIONS)
    assert.equal(placed.size, 0)
  })

  it('is deterministic — the same graph drops the same labels', () => {
    const nodes = [node('1', 0, 0, 1), node('2', 8, 0, 1), node('3', 16, 0, 1)]
    const first = placeLabels(nodes, () => '가나다라마바사', OPTIONS)
    const second = placeLabels([...nodes].reverse(), () => '가나다라마바사', OPTIONS)
    assert.deepEqual([...first.keys()], [...second.keys()])
  })

  it('does not crash on an empty graph', () => {
    assert.equal(placeLabels([], () => 'x', OPTIONS).size, 0)
  })
})
