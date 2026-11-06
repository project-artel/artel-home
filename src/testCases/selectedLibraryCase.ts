import type { TestCase } from './testCaseTypes'
import type { VersionCaseRow } from './testCaseVersions'

/** 버전을 선택했으면 최신 정체 목록으로 대체하지 않는다. 비교 버전에만 있는 TC도 편집하지 않는다. */
export function selectedLibraryCase(caseId: string | null, latest: readonly TestCase[], versionRows?: readonly VersionCaseRow[]): TestCase | null {
  if (versionRows === undefined) return latest.find(row => row.id === caseId) ?? null
  const row = versionRows.find(row => row.testCase.id === caseId && row.presence !== 'ONLY_OTHER')
  if (row === undefined) return null
  return row.verificationStatus == null || row.verificationStatus === row.testCase.verificationStatus
    ? row.testCase : { ...row.testCase, verificationStatus: row.verificationStatus }
}
