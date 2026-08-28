import { apiFetch } from '../auth/authApi'
import { ISSUE_SEVERITIES, type IssueSeverity } from '../issues/issueTypes'
import {
  asNullableString,
  asRecord,
  asString,
  isOneOf,
  jsonRequest,
  ProjectApiError,
  projectPath,
  readJson,
  toApiError,
} from '../projects/projectApi'
import {
  TRACKER_PROVIDERS,
  TRACKER_SYNC_STATES,
  type IssueTracker,
  type TrackerLink,
  type TrackerLinkDraft,
  type TrackerProvider,
  type TrackerRepository,
} from './trackerTypes'

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Drops any value this build does not recognise rather than coercing it. */
function asSeverities(value: unknown): IssueSeverity[] {
  return Array.isArray(value)
    ? value.filter((item): item is IssueSeverity => isOneOf<IssueSeverity>(item, ISSUE_SEVERITIES))
    : []
}

/**
 * `null` when the record is missing or `provider` is not a value this build
 * knows — a connection to a tracker this client cannot yet render is shown as
 * no connection at all, per the same tolerant-parsing rule every other module
 * here follows: unknown values are dropped, not guessed at.
 */
export function parseTrackerLink(data: unknown): TrackerLink | null {
  const record = asRecord(data)
  if (record === null) return null
  if (!isOneOf<TrackerProvider>(record.provider, TRACKER_PROVIDERS)) return null

  return {
    provider: record.provider,
    installed: asBoolean(record.installed),
    workspace: asNullableString(record.workspace),
    repository: asNullableString(record.repository),
    htmlUrl: asNullableString(record.htmlUrl),
    autoSyncSeverities: asSeverities(record.autoSyncSeverities),
    updatedAt: asString(record.updatedAt),
  }
}

/**
 * `null` on a missing record, an unrecognised `provider`, or an unrecognised
 * `syncState` — the two fields the issue row's rendering switches on. Reused
 * by `issueApi.ts`'s `parseIssue` for `Issue.tracker`, so a server that has
 * not shipped the field yet (or ships one this build cannot read) degrades to
 * "nothing to show" instead of a broken row.
 */
export function parseIssueTracker(data: unknown): IssueTracker | null {
  const record = asRecord(data)
  if (record === null) return null
  if (!isOneOf<TrackerProvider>(record.provider, TRACKER_PROVIDERS)) return null
  if (!isOneOf(record.syncState, TRACKER_SYNC_STATES)) return null

  return {
    provider: record.provider,
    externalKey: asNullableString(record.externalKey),
    url: asNullableString(record.url),
    syncState: record.syncState,
    syncError: asNullableString(record.syncError),
    syncedAt: asNullableString(record.syncedAt),
  }
}

function parseTrackerRepository(data: unknown): TrackerRepository | null {
  const record = asRecord(data)
  if (record === null) return null

  const workspace = asNullableString(record.workspace)
  const repository = asNullableString(record.repository)
  if (workspace === null || repository === null) return null

  return {
    workspace,
    repository,
    htmlUrl: asNullableString(record.htmlUrl),
    private: asBoolean(record.private),
  }
}

/** A row this build cannot make sense of is dropped rather than blanking the whole picker. */
function parseTrackerRepositoryList(data: unknown): TrackerRepository[] {
  const record = asRecord(data)
  const items = record !== null && Array.isArray(record.items) ? record.items : []
  return items
    .map(parseTrackerRepository)
    .filter((item): item is TrackerRepository => item !== null)
}

/**
 * The provider-specific path segment for the GitHub-App-flavoured endpoints
 * (`install-url`, `repositories`). A one-entry lookup today, matching every
 * other function in this module treating `provider` as data — not
 * anticipated Jira work, since Jira will need its own OAuth-style flow this
 * lookup cannot cover on its own; it only keeps the one provider this build
 * has from being spelled out at each call site.
 */
const PROVIDER_PATH_SEGMENT: Record<TrackerProvider, string> = {
  GITHUB: 'github',
}

export async function getTrackerLink(
  projectId: string,
  signal?: AbortSignal,
): Promise<TrackerLink | null> {
  const response = await apiFetch(projectPath(projectId, '/tracker-link'), { signal })
  const record = asRecord(await readJson(response))
  return record === null ? null : parseTrackerLink(record.link)
}

export async function updateTrackerLink(
  projectId: string,
  draft: TrackerLinkDraft,
): Promise<TrackerLink> {
  const response = await apiFetch(projectPath(projectId, '/tracker-link'), {
    method: 'PUT',
    ...jsonRequest(draft),
  })
  const record = asRecord(await readJson(response))
  const link = record === null ? null : parseTrackerLink(record.link)

  if (link === null) {
    throw new ProjectApiError(
      response.status,
      'The server described the tracker connection oddly.',
      'CLIENT_MALFORMED_TRACKER_LINK',
    )
  }
  return link
}

export async function deleteTrackerLink(projectId: string): Promise<void> {
  const response = await apiFetch(projectPath(projectId, '/tracker-link'), { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}

export async function getTrackerInstallUrl(
  projectId: string,
  provider: TrackerProvider,
): Promise<string> {
  const response = await apiFetch(
    projectPath(projectId, `/tracker/${PROVIDER_PATH_SEGMENT[provider]}/install-url`),
  )
  const record = asRecord(await readJson(response))
  const url = asNullableString(record?.url)

  if (url === null) {
    throw new ProjectApiError(
      response.status,
      'The server did not return an installation link.',
      'CLIENT_MALFORMED_INSTALL_URL',
    )
  }
  return url
}

export async function listTrackerRepositories(
  projectId: string,
  provider: TrackerProvider,
  signal?: AbortSignal,
): Promise<TrackerRepository[]> {
  const response = await apiFetch(
    projectPath(projectId, `/tracker/${PROVIDER_PATH_SEGMENT[provider]}/repositories`),
    { signal },
  )
  return parseTrackerRepositoryList(await readJson(response))
}

/**
 * Exports one issue, or retries a failed export. The `202` this endpoint
 * returns is read as "here is the current state," not "come back later" —
 * `IssueTracker.syncState` already says whether that state is final
 * (`SYNCED`/`FAILED`) or still in flight (`PENDING`); this client applies
 * whatever comes back directly and does not poll for a later result.
 */
export async function syncIssueTracker(issueId: string): Promise<IssueTracker> {
  const response = await apiFetch(`/api/issues/${encodeURIComponent(issueId)}/tracker-sync`, {
    method: 'POST',
  })
  const record = asRecord(await readJson(response))
  const tracker = record === null ? null : parseIssueTracker(record.tracker)

  if (tracker === null) {
    throw new ProjectApiError(
      response.status,
      'The server described the export oddly.',
      'CLIENT_MALFORMED_TRACKER_SYNC',
    )
  }
  return tracker
}
