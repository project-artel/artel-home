import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestCaseVersionSummary } from './testCaseVersions.ts'
import {
  arrangeCandidates,
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
  mapCases: 0,
  judged: 0,
  ...overrides,
})

test('이미 만든 빌드는 지도가 읽혀 있으면 덮어쓰고, 아니면 막힌다', () => {
  assert.equal(candidateOutcome(candidate({ generated: true })), 'overwrite')
  assert.equal(candidateOutcome(candidate({ generated: true, mapState: 'NO_MAP' })), 'alreadyGenerated')
  assert.equal(candidateOutcome(candidate({ generated: true, mapState: 'NOT_READ' })), 'alreadyGenerated')
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
  // 덮어쓰기는 처음부터 골라 두지 않는다.
  assert.equal(firstCreatable([candidate({ generated: true })]), null)
})

const version = (gameBuildId: string, createdAt: string, overrides: Partial<TestCaseVersionSummary> = {}): TestCaseVersionSummary => ({
  gameBuildId,
  version: `v${gameBuildId}`,
  label: null,
  createdAt,
  latest: false,
  total: 0,
  counts: { DRAFT: 0, VERIFIED: 0, FAILED: 0, REGRESSION: 0, BROKEN: 0 },
  groupId: null,
  hidden: false,
  ...overrides,
})

test('후보를 라이브러리 목록처럼 묶음 · 묶음 없음 · 숨김으로 늘어놓고, 목록에 없는 빌드는 맨 위에 둔다', () => {
  const candidates = ['1', '2', '3', '4', '9'].map((id) => candidate({ gameBuildId: id }))
  const versions = [
    version('1', '2026-01-01', { groupId: 'g1' }),
    version('2', '2026-02-01', { groupId: 'g1' }),
    version('3', '2026-03-01'),
    version('4', '2026-04-01', { hidden: true }),
  ]
  const { entries, hidden } = arrangeCandidates(candidates, versions, [{ id: 'g1', name: '1.X' }])

  assert.deepEqual(
    entries.map((entry) => (entry.kind === 'group' ? `${entry.group.name}:${entry.candidates.map((one) => one.gameBuildId).join(',')}` : entry.candidate.gameBuildId)),
    ['9', '3', '1.X:2,1'],
  )
  assert.deepEqual(hidden.map((one) => one.gameBuildId), ['4'])
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
