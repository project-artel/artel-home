import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGlossaryBook, parseGlossaryTerm } from './glossaryApi'

test('용어 응답은 모르는 정한 쪽 · 확인 이유를 버리고 빈 시작 값은 unknown 으로 읽는다', () => {
  const term = parseGlossaryTerm({
    name: '광산_안', kind: 'has', meaning: '', options: [], start: '', aliases: ['광산 내부'],
    setBy: { kind: 'ai', meaning: 'user', start: 'robot' }, issues: ['NO_MEANING', 'ODD'], usedBy: 3,
  })
  assert.equal(term?.start, 'unknown')
  assert.deepEqual(term?.setBy, { kind: 'ai', meaning: 'user', options: 'ai', start: 'ai', gameVariable: 'ai' })
  assert.equal(term?.gameVariable, null)
  assert.deepEqual(term?.issues, ['NO_MEANING'])
  assert.equal(term?.usedBy, 3)
  assert.equal(parseGlossaryTerm({ kind: 'has' }), null)
})

test('게임 사전은 이은 게임 변수와 화면 이동을 읽고 모양이 틀린 이동은 버린다', () => {
  const book = parseGlossaryBook({
    terms: [{ name: '동전', kind: 'counter', start: '0', gameVariable: 'player.coins', setBy: { game_variable: 'user' } }],
    exits: [{ from: '광장', to: '숲', by: '숲을 누른다', source: 'user' }, { from: '광장', to: '', by: 'x' }, { from: '숲', to: '광장', by: '', source: 'robot' }],
  })
  assert.equal(book.terms[0].gameVariable, 'player.coins')
  assert.equal(book.terms[0].setBy.gameVariable, 'user')
  assert.deepEqual(book.exits, [
    { from: '광장', to: '숲', by: '숲을 누른다', source: 'user' },
    { from: '숲', to: '광장', by: '', source: null },
  ])
})
