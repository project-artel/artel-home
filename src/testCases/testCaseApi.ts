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
  type TestCase,
  type TestCaseInput,
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
