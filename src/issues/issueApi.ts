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
  type IssueFacets,
  type IssueOrigin,
  type IssueCategoryTag,
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
    qaRunId: isDecimalId(record.qaRunId) ? record.qaRunId : null,
    severity: record.severity,
    status: record.status,
    title: asString(record.title),
    detail: record.detail ?? null,
    reportedAt: asString(record.reportedAt),
    resolvedAt: asNullableString(record.resolvedAt),
    tracker: parseIssueTracker(record.tracker),
    origin: parseIssueOrigin(record.origin),
    number: isDecimalId(record.number) ? record.number : null,
    archivedAt: asNullableString(record.archivedAt),
    categories: Array.isArray(record.categories) ? record.categories.map(parseCategoryTag).filter((tag) => tag !== null) : [],
  }
}

export function parseCategoryTag(data: unknown): IssueCategoryTag | null {
  const record = asRecord(data)
  if (record === null || !isDecimalId(record.id)) return null
  return { id: record.id, name: asString(record.name), color: asString(record.color) || 'gray' }
}

function parseIssueOrigin(data: unknown): IssueOrigin | null {
  const record = asRecord(data)
  if (record === null || !isDecimalId(record.testScenarioId)) return null
  return {
    testScenarioId: record.testScenarioId,
    testScenarioTitle: asString(record.testScenarioTitle),
    testRunId: isDecimalId(record.testRunId) ? record.testRunId : null,
    testRunName: asNullableString(record.testRunName),
    gameBuildId: isDecimalId(record.gameBuildId) ? record.gameBuildId : null,
    buildVersion: asNullableString(record.buildVersion),
    buildLabel: asNullableString(record.buildLabel),
    model: asNullableString(record.model),
    qaRunStartedAt: asNullableString(record.qaRunStartedAt),
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
  filters: {
    status?: IssueStatus
    severity?: IssueSeverity
    gameBuildId?: string
    testRunId?: string
    folderId?: string
    unversioned?: boolean
    categoryId?: string
    archived?: boolean
    query?: string
  },
  beforeId?: string,
  signal?: AbortSignal,
): Promise<IssuePage> {
  const params = pageParams(beforeId)
  if (filters.status !== undefined) params.set('status', filters.status)
  if (filters.severity !== undefined) params.set('severity', filters.severity)
  if (filters.gameBuildId !== undefined) params.set('gameBuildId', filters.gameBuildId)
  if (filters.testRunId !== undefined) params.set('testRunId', filters.testRunId)
  if (filters.folderId !== undefined) params.set('folderId', filters.folderId)
  if (filters.unversioned === true) params.set('unversioned', 'true')
  if (filters.categoryId !== undefined) params.set('categoryId', filters.categoryId)
  if (filters.archived === true) params.set('archived', 'true')
  if (filters.query) params.set('query', filters.query)

  const path = `/api/projects/${encodeURIComponent(projectId)}/issues?${params}`
  const response = await apiFetch(path, { signal })
  return parsePage(await readJson(response), response.status)
}

/** 빌드 · TR · 심각도별 이슈 수. [status] 는 목록과 같은 상태 거르기다. */
export async function getProjectIssueFacets(
  projectId: string,
  status: IssueStatus | undefined,
  signal?: AbortSignal,
  /** 주면 그 빌드 · TR 안에서만 센다. */
  scope: { gameBuildId?: string | null; testRunId?: string | null } = {},
): Promise<IssueFacets> {
  const params = new URLSearchParams()
  if (status !== undefined) params.set('status', status)
  if (scope.gameBuildId) params.set('gameBuildId', scope.gameBuildId)
  if (scope.testRunId) params.set('testRunId', scope.testRunId)
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/issues/facets?${params}`, { signal })
  if (!response.ok) throw await toApiError(response)
  const record = asRecord(await readJson(response)) ?? {}
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  const id = (value: unknown) => (isDecimalId(value) ? value : null)
  const list = (value: unknown) => (Array.isArray(value) ? value.map(asRecord).filter((item) => item !== null) : [])
  const severities: IssueFacets['severities'] = {}
  const rawSeverities = asRecord(record.severities) ?? {}
  for (const severity of ISSUE_SEVERITIES) if (severity in rawSeverities) severities[severity] = count(rawSeverities[severity])
  return {
    total: count(record.total),
    archived: count(record.archived),
    builds: list(record.builds).map((build) => ({
      gameBuildId: id(build.gameBuildId),
      version: asNullableString(build.version),
      label: asNullableString(build.label),
      count: count(build.count),
      openCount: count(build.openCount),
    })),
    testRuns: list(record.testRuns).map((run) => ({
      testRunId: id(run.testRunId),
      name: asNullableString(run.name),
      gameBuildId: id(run.gameBuildId),
      count: count(run.count),
      openCount: count(run.openCount),
    })),
    severities,
  }
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

/** 보관(숨김)하거나 되돌린다. 지우지 않고 목록 · 개수에서만 뺀다. */
export async function setIssueArchived(issueId: string, archived: boolean): Promise<void> {
  const response = await apiFetch(`${ISSUES_ROOT}/${encodeURIComponent(issueId)}/${archived ? 'archive' : 'unarchive'}`, {
    method: 'POST',
  })
  if (!response.ok) throw await toApiError(response)
}
