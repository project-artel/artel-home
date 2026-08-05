/**
 * Defects a QA run found in the game.
 *
 * The agent files them mid-run; a person marks them handled here. Nothing else
 * about an issue is editable, which is why `status` is the only field this app
 * ever sends back.
 */

/** Worst first — the server's own ladder, and the order the filter offers. */
export const ISSUE_SEVERITIES = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL'] as const

export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number]

export const ISSUE_STATUSES = ['OPEN', 'RESOLVED'] as const

export type IssueStatus = (typeof ISSUE_STATUSES)[number]

export type Issue = {
  id: string
  /** The run that found it. What makes the row a way back to the timeline. */
  qaTryId: string
  severity: IssueSeverity
  title: string
  /** The agent's whole payload. Shape is not guaranteed — see `IssueDetail`. */
  detail: unknown
  status: IssueStatus
  /** When the agent saw it, not when the server stored it. */
  reportedAt: string
  resolvedAt: string | null
}

export type IssuePage = {
  items: Issue[]
  nextBeforeId: string | null
  hasMore: boolean
}

/**
 * The fields the agent is asked to fill in. Every one is optional here because
 * the server stores the payload whole and does not enforce a shape: an older
 * agent, or a future one, may send none of them.
 */
export type IssueDetail = {
  expected: string | null
  actual: string | null
  reproduction: string[]
  step: number | null
}

export type IssueFilters = {
  status: IssueStatus | 'ALL'
  severity: IssueSeverity | 'ALL'
}
