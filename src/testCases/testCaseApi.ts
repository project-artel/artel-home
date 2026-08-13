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
  }
}

/** Accepts a bare array or an `{ items: [...] }` envelope, as the project lists do. */
function toItemArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data

  const items = asRecord(data)?.items
  return Array.isArray(items) ? items : []
}

export type TestCaseFilter = {
  scene?: string
  /** Filters on `verificationStatus` (our run's verdict), not the spec's `status`. */
  status?: string
}

/** `GET /api/projects/{projectId}/test-cases` — the project's reusable cases. */
export async function listTestCases(
  projectId: string,
  filter: TestCaseFilter = {},
  signal?: AbortSignal,
): Promise<TestCase[]> {
  const params = new URLSearchParams()
  if (filter.scene) params.set('scene', filter.scene)
  if (filter.status) params.set('status', filter.status)
  const query = params.toString()

  const response = await apiFetch(
    `${casesRoot(projectId)}${query.length > 0 ? `?${query}` : ''}`,
    { signal },
  )
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
