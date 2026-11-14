import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { fetchGameFactBook, parseGameFactBook, rulesPerFact } from './gameFactApi'
import { ProjectApiError } from './projectApi'

const fact = {
  id: '1', name: 'cards_in_hand', scope: 'objects', member: 'CardManager.myCards.Count', type: 'integer',
  unit: 'cards', means: '손패에 든 카드 수', gameBuildId: '20', version: 1, updatedAt: '2026-11-14T00:00:00Z',
}
const rule = {
  id: '2', name: 'discard_once_per_turn', says: '카드 버리기는 턴마다 한 번만 된다.', facts: ['cards_in_hand', 'turn_number'],
  gameBuildId: '20', version: 2, updatedAt: '2026-11-14T00:00:00Z',
}
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('fact 와 rule 을 한 응답에서 읽는다', () => {
  const book = parseGameFactBook({ facts: [fact, { ...fact, id: '3', name: 'player_hp', unit: null }], rules: [rule] })
  assert.equal(book.facts.length, 2)
  assert.equal(book.facts[0].member, 'CardManager.myCards.Count')
  assert.equal(book.facts[1].unit, null)
  assert.deepEqual(book.rules[0].facts, ['cards_in_hand', 'turn_number'])
})

test('빈 unit 은 없는 것으로 본다', () => {
  assert.equal(parseGameFactBook({ facts: [{ ...fact, unit: '' }], rules: [] }).facts[0].unit, null)
  assert.equal(parseGameFactBook({ facts: [{ ...fact, unit: undefined }], rules: [] }).facts[0].unit, null)
})

test('모양이 다른 응답은 빈 목록으로 넘기지 않는다', () => {
  for (const value of [
    {}, { facts: [] }, { rules: [] }, { facts: null, rules: [] },
    { facts: [{ ...fact, scope: 'scene' }], rules: [] },
    { facts: [{ ...fact, type: 'float' }], rules: [] },
    { facts: [{ ...fact, version: '1' }], rules: [] },
    { facts: [], rules: [{ ...rule, facts: 'cards_in_hand' }] },
    { facts: [], rules: [{ ...rule, says: undefined }] },
  ]) {
    assert.throws(() => parseGameFactBook(value))
  }
  assert.deepEqual(parseGameFactBook({ facts: [], rules: [] }), { facts: [], rules: [] })
})

test('fact 마다 그 fact 를 말하는 rule 수를 센다', () => {
  const book = parseGameFactBook({
    facts: [fact],
    rules: [rule, { ...rule, id: '4', name: 'hand_limit_rule', facts: ['cards_in_hand', 'cards_in_hand'] }],
  })
  const counts = rulesPerFact(book)
  assert.equal(counts.get('cards_in_hand'), 2)
  assert.equal(counts.get('turn_number'), 1)
  assert.equal(counts.get('player_hp'), undefined)
})

test('프로젝트의 game-facts 경로를 읽고 실패는 API 오류로 올린다', async () => {
  const requests: URL[] = []
  globalThis.fetch = async (input) => {
    requests.push(new URL(String(input)))
    return Response.json({ facts: [fact], rules: [rule] })
  }
  const book = await fetchGameFactBook('10')
  assert.equal(requests[0].pathname, '/api/projects/10/game-facts')
  assert.equal(book.rules[0].name, 'discard_once_per_turn')

  globalThis.fetch = async () => Response.json({ code: 'forbidden', message: 'no' }, { status: 403 })
  await assert.rejects(fetchGameFactBook('10'), ProjectApiError)
})
