import { apiFetch } from '../auth/authApi'
import {
  asNullableString,
  asRecord,
  asString,
  jsonRequest,
  readJson,
  toApiError,
} from '../projects/projectApi'
import {
  asVerificationStatus,
  MAX_BULK_SELECTION,
  type TestCase,
  type TestCaseCoverage,
  type TestCaseInput,
  type UncoveredScene,
  type VerificationStatus,
} from './testCaseTypes'

/*
 * The reusable-case library: CRUD over `/api/projects/{projectId}/test-cases`.
 *
 * Every call goes through `apiFetch`, so 401 stays owned by one place and the
 * same `ProjectApiError` body is reused. Ids travel as strings end to end —
 * they are 64-bit on the server and only ever used as opaque keys here.
 */

function casesRoot(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/test-cases`
}

function casePath(projectId: string, caseId: string): string {
  return `${casesRoot(projectId)}/${encodeURIComponent(caseId)}`
}

/**
 * A case row exists as long as it has an id; every other field degrades to a
 * safe default. A case the user can still reference is a better outcome than a
 * dropped row, so a blank scene or expected value is tolerated rather than fatal.
 *
 * That tolerance is why a field rename here is dangerous: reading a name the
 * server no longer sends yields an empty string, not an error, so the list would
 * render every row blank with nothing in the console. The names below have to
 * track the server's response exactly (ARTEL-329).
 */
export function parseTestCase(data: unknown): TestCase | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asString(record.id)
  if (id.length === 0) return null

  return {
    id,
    projectId: asString(record.projectId),
    scene: asString(record.scene),
    step: asString(record.step),
    precondition: asNullableString(record.precondition),
    expectedValue: asString(record.expectedValue),
    status: asNullableString(record.status),
    verificationStatus: asVerificationStatus(record.verificationStatus),
    lastVerifiedBuildId: asNullableString(record.lastVerifiedBuildId),
    createdAt: asString(record.createdAt),
    folderId: asNullableString(record.folderId),
    evidenceGaps: asStringArray(record.evidenceGaps),
  }
}

/**
 * Reason codes, tolerated the way every other field here is: a missing field or
 * an odd shape becomes an empty list rather than a dropped case. Only the
 * single-case endpoint sends this one, so every list row parses to `[]` — that
 * is the expected outcome, not a degraded one.
 */
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

/** Accepts a bare array or an `{ items: [...] }` envelope, as the project lists do. */
function toItemArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data

  const items = asRecord(data)?.items
  return Array.isArray(items) ? items : []
}

/**
 * `GET /api/projects/{projectId}/test-cases` — every reusable case in the
 * project, newest first.
 *
 * There is no filter argument. This used to accept scene/status and turn them
 * into query parameters, but nothing ever passed them: the one screen that
 * calls this asks for everything and narrows in the browser. The server dropped
 * the parameters to match (ARTEL-329), so sending them would have been a
 * request the server quietly ignores — the worst kind of filter.
 */
export async function listTestCases(
  projectId: string,
  signal?: AbortSignal,
): Promise<TestCase[]> {
  const response = await apiFetch(casesRoot(projectId), { signal })
  return toItemArray(await readJson(response))
    .map(parseTestCase)
    .filter((testCase): testCase is TestCase => testCase !== null)
}

function requireCase(data: unknown, status: number): TestCase {
  const testCase = parseTestCase(data)
  if (testCase === null) {
    throw new Error(`The server described the test case oddly (status ${status}).`)
  }
  return testCase
}

export async function createTestCase(
  projectId: string,
  input: TestCaseInput,
): Promise<TestCase> {
  const response = await apiFetch(casesRoot(projectId), {
    method: 'POST',
    ...jsonRequest(input),
  })
  if (!response.ok) throw await toApiError(response)
  return requireCase(await readJson(response), response.status)
}

export async function getTestCase(
  projectId: string,
  caseId: string,
  signal?: AbortSignal,
): Promise<TestCase> {
  const response = await apiFetch(casePath(projectId, caseId), { signal })
  return requireCase(await readJson(response), response.status)
}

/**
 * `PUT /api/projects/{projectId}/test-cases/{caseId}` — applies the given
 * fields. The server returns the stored case, so the caller can rebaseline its
 * local copy to exactly what was persisted.
 */
export async function updateTestCase(
  projectId: string,
  caseId: string,
  input: TestCaseInput,
): Promise<TestCase> {
  const response = await apiFetch(casePath(projectId, caseId), {
    method: 'PUT',
    ...jsonRequest(input),
  })
  if (!response.ok) throw await toApiError(response)
  return requireCase(await readJson(response), response.status)
}

export async function deleteTestCase(projectId: string, caseId: string): Promise<void> {
  const response = await apiFetch(casePath(projectId, caseId), { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}


/**
 * `POST /api/projects/{projectId}/test-cases/bulk-delete` — deletes the given
 * cases in one request and returns how many rows were removed.
 *
 * The server accepts 1..500 ids and rejects anything else, so the library caps
 * the selection (`MAX_BULK_SELECTION`) instead of splitting the call: two
 * requests could leave half the selection deleted. A missing or odd `deleted`
 * degrades to 0 because callers reload the list rather than trust the count.
 */
export async function bulkDeleteTestCases(
  projectId: string,
  caseIds: readonly string[],
): Promise<number> {
  // 서버가 400 으로 거절할 요청은 보내지 않는다. 호출부(선택 상한)가 막아 두므로 여기 닿으면 버그다.
  if (caseIds.length === 0 || caseIds.length > MAX_BULK_SELECTION) {
    throw new RangeError(`bulk-delete takes 1..${MAX_BULK_SELECTION} ids, got ${caseIds.length}.`)
  }

  const response = await apiFetch(`${casesRoot(projectId)}/bulk-delete`, {
    method: 'POST',
    ...jsonRequest({ caseIds }),
  })
  const record = asRecord(await readJson(response))
  return asCount(record?.deleted)
}


/**
 * `POST /api/projects/{projectId}/test-cases/move` — puts the given cases in a
 * folder, or outside every folder when `folderId` is `null`. Same 1..500 limit
 * as `bulkDeleteTestCases`, for the same reason.
 */
export async function moveTestCases(
  projectId: string,
  caseIds: readonly string[],
  folderId: string | null,
): Promise<number> {
  if (caseIds.length === 0 || caseIds.length > MAX_BULK_SELECTION) {
    throw new RangeError(`move takes 1..${MAX_BULK_SELECTION} ids, got ${caseIds.length}.`)
  }

  const response = await apiFetch(`${casesRoot(projectId)}/move`, {
    method: 'POST',
    ...jsonRequest({ caseIds, folderId }),
  })
  const record = asRecord(await readJson(response))
  return asCount(record?.moved)
}


/**
 * `GET /api/projects/{projectId}/test-cases/coverage` — how much of the project
 * the scenarios reach.
 *
 * Everything degrades to zero rather than throwing. A missing count would other-
 * wise blank the dashboard tile it sits in, and a project with no cases yet is a
 * perfectly ordinary state that reads the same way.
 */
export async function getCoverage(
  projectId: string,
  signal?: AbortSignal,
): Promise<TestCaseCoverage> {
  const response = await apiFetch(`${casesRoot(projectId)}/coverage`, { signal })
  const record = asRecord(await readJson(response)) ?? {}
  return {
    total: asCount(record.total),
    authored: asCount(record.authored),
    unauthored: asCount(record.unauthored),
    verified: asCount(record.verified),
    draft: asCount(record.draft),
    broken: asCount(record.broken),
    uncoveredScenes: asScenes(record.uncoveredScenes),
  }
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function asScenes(value: unknown): UncoveredScene[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({ scene: asString(entry.scene), count: asCount(entry.count) }))
    .filter((entry) => entry.scene.length > 0)
}

/** 같은 케이스의 build 하나 몫의 판정(ARTEL-995). build 마다 다른 행이 같은 `case_key` 로 이어진다. */
export type CaseVerdictHistoryItem = {
  testCaseId: string
  gameBuildId: string
  version: string
  label: string | null
  verificationStatus: VerificationStatus
}

export function parseVerdictHistory(data: unknown): CaseVerdictHistoryItem[] {
  const items = asRecord(data)?.items
  return (Array.isArray(items) ? items : [])
    .map((raw): CaseVerdictHistoryItem | null => {
      const record = asRecord(raw)
      const testCaseId = asString(record?.testCaseId)
      const gameBuildId = asString(record?.gameBuildId)
      if (testCaseId.length === 0 || gameBuildId.length === 0) return null
      return {
        testCaseId,
        gameBuildId,
        version: asString(record?.version),
        label: asNullableString(record?.label),
        verificationStatus: asVerificationStatus(record?.verificationStatus),
      }
    })
    .filter((item): item is CaseVerdictHistoryItem => item !== null)
}

/**
 * `GET /api/projects/{projectId}/test-cases/{caseId}/verdict-history` — 오래된 build 부터. 사람이 쓴
 * 케이스처럼 build 에 묶이지 않은 것은 빈 목록이다.
 */
export async function getVerdictHistory(
  projectId: string,
  caseId: string,
  signal?: AbortSignal,
): Promise<CaseVerdictHistoryItem[]> {
  const response = await apiFetch(`${casePath(projectId, caseId)}/verdict-history`, { signal })
  if (!response.ok) throw await toApiError(response)
  return parseVerdictHistory(await readJson(response))
}
