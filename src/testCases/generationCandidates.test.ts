import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  candidateOutcome,
  firstCreatable,
  parseGenerationCandidates,
  type GenerationCandidate,
} from './generationCandidates.ts'

const candidate = (overrides: Partial<GenerationCandidate>): GenerationCandidate => ({
  gameBuildId: '1',
  version: '1.0.0',
  label: null,
  createdAt: '2026-10-14T00:00:00Z',
  mapState: 'READY',
  generated: false,
  ...overrides,
})

test('이미 만든 빌드는 지도 상태와 상관없이 막힌다', () => {
  assert.equal(candidateOutcome(candidate({ generated: true })), 'alreadyGenerated')
  assert.equal(candidateOutcome(candidate({ generated: true, mapState: 'NO_MAP' })), 'alreadyGenerated')
})

test('지도가 없거나 안 읽혔으면 막히고, 읽혔으면 만든다', () => {
  assert.equal(candidateOutcome(candidate({ mapState: 'NO_MAP' })), 'noMap')
  assert.equal(candidateOutcome(candidate({ mapState: 'NOT_READ' })), 'notRead')
  assert.equal(candidateOutcome(candidate({})), 'create')
})

test('처음 골라 둘 줄은 만들 수 있는 첫 줄이다', () => {
  const list = [
    candidate({ gameBuildId: '3', mapState: 'NO_MAP' }),
    candidate({ gameBuildId: '2' }),
    candidate({ gameBuildId: '1', generated: true }),
  ]
  assert.equal(firstCreatable(list), '2')
  assert.equal(firstCreatable([candidate({ generated: true })]), null)
})

test('응답을 읽고, id 가 없는 줄은 버리고, 모르는 지도 상태는 NO_MAP 으로 읽는다', () => {
  const parsed = parseGenerationCandidates({
    items: [
      { gameBuildId: '7', version: '1.4.0', label: 'rc', createdAt: 'x', mapState: 'READY', generated: true },
      { version: 'no id' },
      { gameBuildId: '8', version: '1.5.0', mapState: 'WHAT' },
    ],
  })
  assert.deepEqual(
    parsed.map((one) => [one.gameBuildId, one.mapState, one.generated, one.label]),
    [
      ['7', 'READY', true, 'rc'],
      ['8', 'NO_MAP', false, null],
    ],
  )
  assert.deepEqual(parseGenerationCandidates(null), [])
})
