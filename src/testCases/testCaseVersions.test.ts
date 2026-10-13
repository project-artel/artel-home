import assert from 'node:assert/strict'
import test from 'node:test'
import {
  absenceNote,
  isRegression,
  parseVersionCases,
  parseVersionList,
  resolveCompare,
  resolveVersion,
  versionName,
} from './testCaseVersions'

const list = parseVersionList({
  items: [
    { gameBuildId: '4', version: '1.1', label: null, createdAt: '2026-10-13T00:00:00Z', latest: true, total: 3,
      counts: { VERIFIED: 1, FAILED: 1, DRAFT: 1 } },
    { gameBuildId: '2', version: '1.0', label: '알파', createdAt: '2026-09-15T00:00:00Z', latest: false, total: 2,
      counts: {} },
    { version: 'id 없음' },
  ],
})

test('버전 목록은 id 없는 줄을 버리고 다섯 상태 수를 늘 채운다', () => {
  assert.equal(list.length, 2)
  assert.deepEqual(list[0].counts, { VERIFIED: 1, FAILED: 1, REGRESSION: 0, DRAFT: 1, BROKEN: 0 })
  assert.equal(versionName(list[1]), '알파')
  assert.equal(versionName(list[0]), '1.1')
})

test('고른 버전이 없거나 모르는 버전이면 최신 버전, 비교는 다른 버전일 때만', () => {
  assert.equal(resolveVersion(list, null), '4')
  assert.equal(resolveVersion(list, '99'), '4')
  assert.equal(resolveVersion(list, '2'), '2')
  assert.equal(resolveVersion([], null), null)
  assert.equal(resolveCompare(list, '4', '2'), '2')
  assert.equal(resolveCompare(list, '4', '4'), null)
  assert.equal(resolveCompare(list, '4', '99'), null)
})

test('버전 표 줄: 이 버전에 없으면 판정은 null 이고 표의 상태 칸은 DRAFT 로 채운다', () => {
  const rows = parseVersionCases(
    {
      items: [
        { id: '7', step: '보스전', origin: 'MAP', verificationStatus: 'FAILED', presence: 'BOTH', compareVerificationStatus: 'VERIFIED' },
        { id: '8', step: '사라진 기능', origin: 'MAP', verificationStatus: null, presence: 'ONLY_OTHER', compareVerificationStatus: 'DRAFT' },
        { id: '9', step: '사람이 쓴 것', origin: 'MANUAL', verificationStatus: 'DRAFT' },
        { step: 'id 없음' },
      ],
    },
    '1',
  )
  assert.deepEqual(rows.map((row) => row.testCase.id), ['7', '8', '9'])
  assert.equal(rows[1].verificationStatus, null)
  assert.equal(rows[1].testCase.verificationStatus, 'DRAFT')
  assert.equal(rows[2].origin, 'MANUAL')
  assert.equal(rows[2].presence, 'BOTH')
  assert.equal(isRegression(rows[0]), true)
  assert.equal(isRegression(rows[1]), false)
})

test('한쪽에만 있는 줄의 문구는 어느 쪽이 옛 버전인지로 정한다', () => {
  const [newer, older] = list
  assert.equal(absenceNote('ONLY_THIS', newer, older), 'notInOlder')
  assert.equal(absenceNote('ONLY_OTHER', newer, older), 'removedInNewer')
  assert.equal(absenceNote('ONLY_THIS', older, newer), 'removedInNewer')
  assert.equal(absenceNote('ONLY_OTHER', older, newer), 'notInOlder')
  assert.equal(absenceNote('BOTH', newer, older), null)
  assert.equal(absenceNote('ONLY_THIS', newer, undefined), null)
})

test('회귀는 비교 버전 통과 → 이 버전 실패 또는 재검증', () => {
  assert.equal(isRegression({ verificationStatus: 'REGRESSION', compareVerificationStatus: 'VERIFIED' }), true)
  assert.equal(isRegression({ verificationStatus: 'FAILED', compareVerificationStatus: 'FAILED' }), false)
  assert.equal(isRegression({ verificationStatus: 'VERIFIED', compareVerificationStatus: 'VERIFIED' }), false)
})
