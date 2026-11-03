import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, jsonRequest, readJson, toApiError } from '../projects/projectApi'
import { asCaseKind, type CaseKind } from './testCaseTypes'

/*
 * TC 파일 내보내기 · 가져오기(ARTEL-1328).
 *
 * 내보내기는 서버가 만든 파일을 받아 브라우저에 저장한다. 가져오기는 파일을 본문 그대로 보낸다 — 형식(xlsx · csv)은 서버가
 * 내용을 보고 정한다. 미리 보기와 저장은 같은 파일을 두 번 보낸다.
 */

export type CaseFileFormat = 'xlsx' | 'csv'

/** 내보내거나 가져올 곳: 버전 id 또는 "버전 없음"(`unversioned`). null 이면 프로젝트 전체(내보내기만). */
export type CaseFileTarget = string | null

export type CaseImportStatus = 'NEW' | 'EDIT' | 'SAME' | 'REJECTED'

export type CaseImportRow = {
  line: number
  status: CaseImportStatus
  testCaseId: string | null
  caseNumber: string | null
  kind: CaseKind
  scene: string
  step: string
  expectedValue: string
  changes: string[]
  reason: string | null
}

export type CaseImportPreview = {
  format: CaseFileFormat
  rows: CaseImportRow[]
  counts: { new: number; edit: number; same: number; rejected: number }
}

export type CaseImportResult = {
  created: string[]
  updated: string[]
  unchanged: number
  rejected: CaseImportRow[]
}

function root(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/test-cases`
}

function importQuery(target: string, file: File): string {
  return `?gameBuildId=${encodeURIComponent(target)}&fileName=${encodeURIComponent(file.name)}`
}

/**
 * TC 를 파일로 받아 저장한다. [testCaseIds] 를 주면 그 TC 만(화면에 보이는 목록), 그 순서로.
 * @return 저장한 파일 이름
 */
export async function exportTestCases(
  projectId: string,
  format: CaseFileFormat,
  target: CaseFileTarget,
  testCaseIds?: readonly string[],
): Promise<string> {
  const response = await apiFetch(`${root(projectId)}/exports`, {
    method: 'POST',
    ...jsonRequest({ format, gameBuildId: target, testCaseIds: testCaseIds === undefined ? null : [...testCaseIds] }),
  })
  if (!response.ok) throw await toApiError(response)
  const fileName = fileNameOf(response.headers.get('Content-Disposition'), `test-cases.${format}`)
  saveBlob(await response.blob(), fileName)
  return fileName
}

/** 가져오기 양식을 받아 저장한다. 엑셀은 머리글 필터 · 종류 고르기 목록 · 작성법 시트가 든 빈 표다. */
export async function downloadImportTemplate(projectId: string, format: CaseFileFormat): Promise<string> {
  const response = await apiFetch(`${root(projectId)}/imports/template?format=${format}`)
  if (!response.ok) throw await toApiError(response)
  const fileName = fileNameOf(response.headers.get('Content-Disposition'), `test-case-template.${format}`)
  saveBlob(await response.blob(), fileName)
  return fileName
}

export async function previewCaseImport(projectId: string, target: string, file: File): Promise<CaseImportPreview> {
  const response = await apiFetch(`${root(projectId)}/imports/preview${importQuery(target, file)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) throw await toApiError(response)
  return parseCaseImportPreview(await readJson(response))
}

export async function importCases(projectId: string, target: string, file: File): Promise<CaseImportResult> {
  const response = await apiFetch(`${root(projectId)}/imports${importQuery(target, file)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) throw await toApiError(response)
  return parseCaseImportResult(await readJson(response))
}

/** `Content-Disposition` 의 파일 이름. `filename*=UTF-8''…` 를 먼저 읽는다(한글 이름). */
export function fileNameOf(disposition: string | null, fallback: string): string {
  if (disposition === null) return fallback
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ''))
    } catch {
      return fallback
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1]
  return plain?.trim() || fallback
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 클릭이 내려받기를 시작한 뒤에 놓는다. 바로 놓으면 일부 브라우저가 빈 파일을 받는다.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const STATUSES: readonly CaseImportStatus[] = ['NEW', 'EDIT', 'SAME', 'REJECTED']

function asRow(data: unknown): CaseImportRow | null {
  const record = asRecord(data)
  if (record === null) return null
  const status = asString(record.status) as CaseImportStatus
  if (!STATUSES.includes(status)) return null
  return {
    line: typeof record.line === 'number' ? record.line : 0,
    status,
    testCaseId: asNullableString(record.testCaseId),
    caseNumber: asNullableString(record.caseNumber),
    kind: asCaseKind(record.kind),
    scene: asString(record.scene),
    step: asString(record.step),
    expectedValue: asString(record.expectedValue),
    changes: Array.isArray(record.changes) ? record.changes.map((one) => asString(one)).filter((one) => one.length > 0) : [],
    reason: asNullableString(record.reason),
  }
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function parseCaseImportPreview(data: unknown): CaseImportPreview {
  const record = asRecord(data) ?? {}
  const counts = asRecord(record.counts) ?? {}
  return {
    format: asString(record.format) === 'csv' ? 'csv' : 'xlsx',
    rows: Array.isArray(record.rows) ? record.rows.map(asRow).filter((row): row is CaseImportRow => row !== null) : [],
    counts: { new: asCount(counts.new), edit: asCount(counts.edit), same: asCount(counts.same), rejected: asCount(counts.rejected) },
  }
}

export function parseCaseImportResult(data: unknown): CaseImportResult {
  const record = asRecord(data) ?? {}
  const ids = (value: unknown) => (Array.isArray(value) ? value.map((one) => asString(one)).filter((one) => one.length > 0) : [])
  return {
    created: ids(record.created),
    updated: ids(record.updated),
    unchanged: asCount(record.unchanged),
    rejected: Array.isArray(record.rejected) ? record.rejected.map(asRow).filter((row): row is CaseImportRow => row !== null) : [],
  }
}

/** 가져올 수 있는 파일. 확장자는 고르기 창을 좁히는 데만 쓴다 — 형식은 서버가 내용으로 정한다. */
export const CASE_FILE_ACCEPT = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'
