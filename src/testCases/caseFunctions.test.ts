import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  changeSelectionKind,
  parseCaseFunctions,
  sameCaseFunctions,
  selectionKind,
  toggleChosenName,
  toWireCaseFunctions,
} from './caseFunctions'
import { parseTestCase } from './testCaseApi'

describe('parseCaseFunctions', () => {
  it('계약의 예시를 읽는다', () => {
    assert.deepEqual(parseCaseFunctions({ cheats: ['give_gold'], behaviors: 'all' }), {
      cheats: ['give_gold'],
      behaviors: 'all',
    })
  })

  it('없는 키는 all 이다', () => {
    assert.deepEqual(parseCaseFunctions({ cheats: 'none' }), { cheats: 'none', behaviors: 'all' })
  })

  it('모르는 값은 none 이 아니라 all 이다', () => {
    assert.deepEqual(parseCaseFunctions({ cheats: 3, behaviors: 'sometimes' }), {
      cheats: 'all',
      behaviors: 'all',
    })
  })

  it('functions 자체가 없으면 null 이다', () => {
    assert.equal(parseCaseFunctions(undefined), null)
    assert.equal(parseCaseFunctions(null), null)
  })
})

describe('parseTestCase functions', () => {
  const base = { id: '5', scene: 'Lobby', step: 's', expectedValue: 'e' }

  it('응답이 functions 를 싣으면 읽는다', () => {
    const parsed = parseTestCase({ ...base, functions: { cheats: 'none', behaviors: ['flee'] } })
    assert.deepEqual(parsed?.functions, { cheats: 'none', behaviors: ['flee'] })
  })

  it('옛 응답은 functions 가 없다', () => {
    assert.equal(parseTestCase(base)?.functions, undefined)
  })
})

describe('selection editing', () => {
  it('고른 이름으로 바꾸면 지금 목록을 이어받는다', () => {
    assert.deepEqual(changeSelectionKind(['a'], 'chosen'), ['a'])
    assert.deepEqual(changeSelectionKind('all', 'chosen'), [])
    assert.equal(changeSelectionKind(['a'], 'none'), 'none')
  })

  it('이름을 켜고 끈다', () => {
    assert.deepEqual(toggleChosenName(['a'], 'b'), ['a', 'b'])
    assert.deepEqual(toggleChosenName(['a', 'b'], 'a'), ['b'])
    assert.equal(toggleChosenName('all', 'a'), 'all')
  })

  it('종류를 가른다', () => {
    assert.equal(selectionKind('all'), 'all')
    assert.equal(selectionKind('none'), 'none')
    assert.equal(selectionKind([]), 'chosen')
  })

  it('이름 목록은 순서가 달라도 같다', () => {
    assert.ok(sameCaseFunctions({ cheats: ['a', 'b'], behaviors: 'all' }, { cheats: ['b', 'a'], behaviors: 'all' }))
    assert.ok(!sameCaseFunctions({ cheats: ['a'], behaviors: 'all' }, { cheats: 'all', behaviors: 'all' }))
  })

  it('빈 이름 목록은 none 으로 보낸다', () => {
    assert.deepEqual(toWireCaseFunctions({ cheats: [], behaviors: ['x'] }), { cheats: 'none', behaviors: ['x'] })
  })
})
