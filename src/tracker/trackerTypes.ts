import type { IssueSeverity } from '../issues/issueTypes'

/**
 * External issue trackers a project can export defects to.
 *
 * GitHub is the only implementation today; Jira is the named next one
 * (ARTEL-669). Every type and API function in this module carries `provider`
 * as data rather than assuming GitHub, so adding Jira is one more union
 * member and one more entry in the provider-to-path lookups in
 * `trackerApi.ts` — not a rewrite of this module or the screens that use it.
 */
export const TRACKER_PROVIDERS = ['GITHUB'] as const

export type TrackerProvider = (typeof TRACKER_PROVIDERS)[number]

export const TRACKER_SYNC_STATES = ['PENDING', 'SYNCED', 'FAILED'] as const

export type TrackerSyncState = (typeof TRACKER_SYNC_STATES)[number]

/**
 * A project's connection to one tracker.
 *
 * `workspace`/`repository` are `null` until the owner picks one — the App can
 * be installed with nothing chosen yet, which is its own state on screen (see
 * `TrackerLinkPanel`). `installed` is carried from the server but this client
 * does not branch on it: `repository` presence alone decides which of the
 * three panel states renders.
 */
export type TrackerLink = {
  provider: TrackerProvider
  installed: boolean
  workspace: string | null
  repository: string | null
  htmlUrl: string | null
  autoSyncSeverities: IssueSeverity[]
  updatedAt: string
}

/** The body of a `PUT tracker-link` call — connect, or change the settings of an existing connection. */
export type TrackerLinkDraft = {
  provider: TrackerProvider
  workspace: string
  repository: string
  autoSyncSeverities: IssueSeverity[]
}

/** One repository the installed GitHub App can see, offered as a pick in the connect flow. */
export type TrackerRepository = {
  workspace: string
  repository: string
  htmlUrl: string | null
  private: boolean
}

/**
 * Where one issue stands with the connected tracker. `null` on `Issue` means
 * either there is no connection, or this defect never qualified for
 * auto-export and nobody has exported it by hand yet — the two look the same
 * to the issue itself; `IssuesSection` tells them apart using the project's
 * own `TrackerLink`.
 */
export type IssueTracker = {
  provider: TrackerProvider
  /** GitHub's issue number, as a string. */
  externalKey: string | null
  url: string | null
  syncState: TrackerSyncState
  syncError: string | null
  syncedAt: string | null
}

/** What a fresh connection is pre-filled with, per ARTEL-670's stated default. */
export const DEFAULT_AUTO_SYNC_SEVERITIES: IssueSeverity[] = ['BLOCKER', 'CRITICAL']
