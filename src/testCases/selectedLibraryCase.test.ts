import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectedLibraryCase } from './selectedLibraryCase'
import type { TestCase } from './testCaseTypes'
import type { VersionCaseRow } from './testCaseVersions'

const latest = { id: '42', origin: 'MAP', step: '현재 빌드 절차', verificationStatus: 'VERIFIED' } as TestCase
const old = { ...latest, step: '과거 빌드 절차' }
const row = { testCase: old, origin: 'MAP', verificationStatus: 'FAILED', presence: 'BOTH', compareVerificationStatus: 'VERIFIED' } as VersionCaseRow

test('과거 빌드를 선택하면 최신 TC 대신 그 빌드의 본문과 판정을 편집한다', () => {
  const selected = selectedLibraryCase('42', [latest], [row])
  assert.equal(selected?.step, '과거 빌드 절차')
  assert.equal(selected?.verificationStatus, 'FAILED')
  assert.equal(latest.step, '현재 빌드 절차')
  assert.equal(selectedLibraryCase('42', [latest]), latest)
})
test('버전 로딩 중이거나 비교 버전에만 있는 TC에는 최신 본문을 대신 표시하지 않는다', () => {
  assert.equal(selectedLibraryCase('42', [latest], []), null)
  assert.equal(selectedLibraryCase('42', [latest], [{ ...row, presence: 'ONLY_OTHER' }]), null)
  assert.equal(selectedLibraryCase('missing', [latest]), null)
})
