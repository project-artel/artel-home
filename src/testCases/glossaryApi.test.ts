import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGlossaryTerm } from './glossaryApi'

test('용어 응답은 모르는 정한 쪽 · 확인 이유를 버리고 빈 시작 값은 unknown 으로 읽는다', () => {
  const term = parseGlossaryTerm({
    name: '광산_안', kind: 'has', meaning: '', options: [], start: '', aliases: ['광산 내부'],
    setBy: { kind: 'ai', meaning: 'user', start: 'robot' }, issues: ['NO_MEANING', 'ODD'], usedBy: 3,
  })
  assert.equal(term?.start, 'unknown')
  assert.deepEqual(term?.setBy, { kind: 'ai', meaning: 'user', options: 'ai', start: 'ai' })
  assert.deepEqual(term?.issues, ['NO_MEANING'])
  assert.equal(term?.usedBy, 3)
  assert.equal(parseGlossaryTerm({ kind: 'has' }), null)
})
