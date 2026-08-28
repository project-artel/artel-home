import { apiFetch } from '../auth/authApi'
import {
  asNullableString,
  asRecord,
  asString,
  isOneOf,
  ProjectApiError,
  readJson,
  toApiError,
} from '../projects/projectApi'
import { isDecimalId } from '../qa/qaApi'
import { parseIssueTracker } from '../tracker/trackerApi'
import {
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  type Issue,
  type IssueDetail,
  type IssuePage,
  type IssueSeverity,
  type IssueStatus,
} from './issueTypes'

const ISSUES_ROOT = '/api/issues'
const PAGE_SIZE = 50

/**
 * One row, or nothing.
 *
 * A row whose severity or status this app does not know is dropped rather than
 * coerced: the two drive colour, sorting and the resolve button, and a value
 * invented after this build shipped would be drawn as something it is not.
 */
export function parseIssue(data: unknown): Issue | null {
  const record = asRecord(data)
  if (record === null) return null
  if (!isDecimalId(record.id) || !isDecimalId(record.qaTryId)) return null
  if (!isOneOf<IssueSeverity>(record.severity, ISSUE_SEVERITIES)) return null
  if (!isOneOf<IssueStatus>(record.status, ISSUE_STATUSES)) return null

  return {
    id: record.id,
    qaTryId: record.qaTryId,
    severity: record.severity,
    status: record.status,
    title: asString(record.title),
    detail: record.detail ?? null,
    reportedAt: asString(record.reportedAt),
    resolvedAt: asNullableString(record.resolvedAt),
    tracker: parseIssueTracker(record.tracker),
  }
}

/**
 * Reads the fields the agent is asked to fill in, ignoring everything else.
 *
 * Everything degrades to empty. The payload is whatever the agent sent, so a
 * missing `expected` is a thin report, not a broken screen.
 */
export function parseIssueDetail(detail: unknown): IssueDetail {
  const record = asRecord(detail)
  const reproduction = record?.reproduction
  return {
    expected: asNullableString(record?.expected),
    actual: asNullableString(record?.actual),
    reproduction: Array.isArray(reproduction)
      ? reproduction.filter((step): step is string => typeof step === 'string')
      : [],
    step: typeof record?.step === 'number' ? record.step : null,
  }
}

function parsePage(data: unknown, status: number): IssuePage {
  const record = asRecord(data)
  if (record === null || !Array.isArray(record.items)) {
    throw new ProjectApiError(status, 'The server returned an unreadable issue page.')
  }
  return {
    items: record.items
      .map((item) => parseIssue(item))
      .filter((item): item is Issue => item !== null),
    nextBeforeId: isDecimalId(record.nextBeforeId) ? record.nextBeforeId : null,
    hasMore: record.hasMore === true,
  }
}

function pageParams(beforeId?: string): URLSearchParams {
  const params = new URLSearchParams({ size: String(PAGE_SIZE) })
  if (beforeId !== undefined) params.set('beforeId', beforeId)
  return params
}

/**
 * One project's issues, newest first, across every run it has.
 *
 * A non-member gets 404 rather than an empty page, so "you cannot see this" and
 * "there is nothing to see" stay apart on screen.
 */
export async function listProjectIssues(
  projectId: string,
  filters: { status?: IssueStatus; severity?: IssueSeverity },
  beforeId?: string,
  signal?: AbortSignal,
): Promise<IssuePage> {
  const params = pageParams(beforeId)
  if (filters.status !== undefined) params.set('status', filters.status)
  if (filters.severity !== undefined) params.set('severity', filters.severity)

  const path = `/api/projects/${encodeURIComponent(projectId)}/issues?${params}`
  const response = await apiFetch(path, { signal })
  return parsePage(await readJson(response), response.status)
}

/** What one run found. Same page shape, narrower scope. */
export async function listQaTryIssues(
  qaTryId: string,
  beforeId?: string,
  signal?: AbortSignal,
): Promise<IssuePage> {
  const path = `/api/qa-tries/${encodeURIComponent(qaTryId)}/issues?${pageParams(beforeId)}`
  const response = await apiFetch(path, { signal })
  return parsePage(await readJson(response), response.status)
}

/**
 * Marks an issue handled, or puts it back.
 *
 * Both directions are idempotent on the server, so a double click is not an
 * error and the caller never has to guard against one.
 */
export async function setIssueResolved(issueId: string, resolved: boolean): Promise<void> {
  const action = resolved ? 'resolve' : 'reopen'
  const response = await apiFetch(`${ISSUES_ROOT}/${encodeURIComponent(issueId)}/${action}`, {
    method: 'POST',
  })
  if (!response.ok) throw await toApiError(response)
}
