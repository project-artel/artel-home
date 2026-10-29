import assert from 'node:assert/strict'
import test from 'node:test'
import {
  absenceNote,
  arrangeVersions,
  hiddenVersions,
  isBuildId,
  isRegression,
  parseVersionLibrary,
  parseVersionCases,
  parseVerdictCarry,
  parseVerdictCarryPreview,
  parseVersionList,
  resolveCompare,
  resolveVersion,
  UNVERSIONED,
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
  assert.equal(versionName(list[1]), '1.0 · 알파 · Unknown')
  assert.equal(versionName(list[0]), '1.1 · Unknown')
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

test('버전 묶음은 안의 가장 최근 버전 자리에 서고, 숨긴 버전은 따로 모인다', () => {
  const library = parseVersionLibrary({
    items: [
      { gameBuildId: '9', version: '2.1', createdAt: '2026-10-20T00:00:00Z', groupId: 'g2', hidden: false, counts: {} },
      { gameBuildId: '8', version: '1.2', createdAt: '2026-10-18T00:00:00Z', groupId: 'g1', hidden: false, counts: {} },
      { gameBuildId: '7', version: '2.0', createdAt: '2026-10-15T00:00:00Z', groupId: 'g2', hidden: false, counts: {} },
      { gameBuildId: '6', version: '1.1-test', createdAt: '2026-10-14T00:00:00Z', groupId: null, hidden: false, counts: {} },
      { gameBuildId: '5', version: '1.1', createdAt: '2026-10-12T00:00:00Z', groupId: 'g1', hidden: true, counts: {} },
    ],
    groups: [{ id: 'g1', name: '1.X' }, { id: 'g2', name: '2.X' }, { id: 'g3', name: '3.X' }, { id: '', name: 'x' }],
    unversionedTotal: 4,
  })

  assert.equal(library.unversionedTotal, 4)
  assert.equal(library.groups.length, 3)
  const shape = arrangeVersions(library.versions, library.groups).map((entry) =>
    entry.kind === 'group'
      ? `${entry.group.name}[${entry.versions.map((version) => version.version).join(',')}]`
      : entry.version.version,
  )
  assert.deepEqual(shape, ['2.X[2.1,2.0]', '1.X[1.2]', '1.1-test', '3.X[]'])
  assert.deepEqual(hiddenVersions(library.versions).map((version) => version.version), ['1.1'])
})

test('버전 없음은 주소의 낱말로 고르고 비교하지 않는다', () => {
  assert.equal(resolveVersion(list, UNVERSIONED), UNVERSIONED)
  assert.equal(resolveVersion([], UNVERSIONED), null)
  assert.equal(resolveCompare(list, UNVERSIONED, '2'), null)
  assert.equal(isBuildId(UNVERSIONED), false)
  assert.equal(isBuildId('12'), true)
  assert.equal(isBuildId(null), false)
})

test('판정 가져오기 응답을 가져온 수와 까닭별 수로 센다(ARTEL-1181)', () => {
  const result = parseVerdictCarry({
    carried: ['1', '2', '3'],
    skipped: [
      { testCaseId: '4', reason: 'CONTENT_CHANGED' },
      { testCaseId: '5', reason: 'NO_PREVIOUS_VERDICT' },
      { testCaseId: '6', reason: 'NO_PREVIOUS_VERDICT' },
      { testCaseId: '7', reason: 'SOMETHING_NEW' },
      { testCaseId: '8', reason: 'ALREADY_CARRIED' },
    ],
  })
  assert.equal(result.carried, 3)
  assert.deepEqual(result.skipped, { CONTENT_CHANGED: 1, NO_PREVIOUS_VERDICT: 2, OTHER: 1, ALREADY_CARRIED: 1 })
  assert.deepEqual(parseVerdictCarry(null), { carried: 0, skipped: {}, reset: 0 })
  assert.equal(parseVerdictCarry({ carried: [], skipped: [], reset: ['1', '2'] }).reset, 2)
})

test('판정 가져오기 미리 보기 줄을 읽는다(ARTEL-1181)', () => {
  const rows = parseVerdictCarryPreview({
    items: [
      { testCaseId: '1', scene: 'TitleScene', step: 'a', expectedValue: 'x', sourceStatus: 'VERIFIED', targetStatus: 'REGRESSION', carryable: true, reason: null },
      { testCaseId: '2', scene: 'Map', step: 'b', expectedValue: 'y', sourceStatus: 'FAILED', targetStatus: null, carryable: false, reason: 'NOT_IN_VERSION' },
      { testCaseId: '' },
    ],
  })
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((row) => [row.carryable, row.targetStatus, row.reason]), [
    [true, 'REGRESSION', null],
    [false, null, 'NOT_IN_VERSION'],
  ])
})

test('버전 목록이 editor 버전을 표시한다(ARTEL-1181)', () => {
  const [editor, build] = parseVersionList({
    items: [
      { gameBuildId: '9', version: '1.4.0', isEditor: true },
      { gameBuildId: '8', version: '1.4.0' },
    ],
  })
  assert.equal(editor.isEditor, true)
  assert.equal(build.isEditor, null)
})
