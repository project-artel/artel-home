import type { Issue, IssueStatus } from '../../issues/issueTypes'
import type { ActionSpec, FieldSpec } from '../registry/types'

/*
 * 이슈 페이지의 field 와 action 정의. catalog 와 페이지의 binding 이 같은 객체를 가리킨다.
 * 이슈 하나를 가리키는 action 은 모두 `issueId` 를 받는다 — 행마다 binding 을 등록하면 같은 id 가 겹친다.
 */

export const ISSUES_STATUS_FIELD: FieldSpec = {
  name: 'issues.status',
  page: 'issues',
  description:
    'Which issues the list shows by status. Value is ALL, OPEN or RESOLVED. The page opens on OPEN (unresolved issues only).',
}

export const ISSUES_SEVERITY_FIELD: FieldSpec = {
  name: 'issues.severity',
  page: 'issues',
  description:
    'Which issues the list shows by severity. Value is ALL, BLOCKER, CRITICAL, MAJOR, MINOR or TRIVIAL (worst first).',
}

export const ISSUES_ISSUE_FIELD: FieldSpec = {
  name: 'issues.issue',
  page: 'issues',
  description:
    'The issue to read. Value is an issue id; options lists the issues the list shows now with severity, status and title. Writing it opens that issue and scrolls to it, same as issues.open. Change the status and severity filters first to list others.',
}

export const ISSUES_OPEN_ACTION: ActionSpec = {
  id: 'issues.open',
  page: 'issues',
  risk: 'auto',
  description:
    'Open one issue in the list (expand its detail and scroll to it). Fails when the issue is not in the list now; change issues.status and issues.severity first. Get ids from the options of issues.issue.',
  args: {
    type: 'object',
    properties: { issueId: { type: 'string', description: 'Id of the issue, from the options of issues.issue.' } },
    required: ['issueId'],
  },
  summarize: (args) => `Open issue ${String(args.issueId ?? '')}`,
}

export const ISSUES_SET_STATUS_ACTION: ActionSpec = {
  id: 'issues.setStatus',
  page: 'issues',
  risk: 'auto',
  description:
    'Mark an issue RESOLVED or put it back to OPEN, like the Resolve / Reopen button on its row. It only changes the issue in ARTEL: nobody is notified and the tracker is not touched. Returns {issueId, status, changed}; changed is false when the issue already had that status. Fails when the issue is not in the list now.',
  args: {
    type: 'object',
    properties: {
      issueId: { type: 'string', description: 'Id of the issue, from the options of issues.issue.' },
      status: { type: 'string', enum: ['OPEN', 'RESOLVED'], description: 'The status the issue should end up with.' },
    },
    required: ['issueId', 'status'],
  },
  summarize: (args) => `Mark issue ${String(args.issueId ?? '')} as ${String(args.status ?? '')}`,
}

export const ISSUES_OPEN_TRACKER_ACTION: ActionSpec = {
  id: 'issues.openTracker',
  page: 'issues',
  risk: 'auto',
  description:
    'Open the issue tracker ticket this issue was exported to, in a new browser tab. Returns {url}. Fails when the issue has not been exported or the export has no link.',
  args: {
    type: 'object',
    properties: { issueId: { type: 'string', description: 'Id of the issue, from the options of issues.issue.' } },
    required: ['issueId'],
  },
  summarize: (args) => `Open the tracker ticket of issue ${String(args.issueId ?? '')}`,
}

export const ISSUES_CREATE_TRACKER_TICKET_ACTION: ActionSpec = {
  id: 'issues.createTrackerTicket',
  page: 'issues',
  risk: 'approve',
  description:
    "Export an issue to the project's connected tracker as a new ticket (or retry a failed export), like the Export button on its row. This creates a ticket other people can see, so the user approves it. Returns {issueId, requested: true}. Fails when the project has no connected tracker, the issue is already exported, or the export fails.",
  args: {
    type: 'object',
    properties: { issueId: { type: 'string', description: 'Id of the issue, from the options of issues.issue.' } },
    required: ['issueId'],
  },
  summarize: (args) => `Create a tracker ticket for issue ${String(args.issueId ?? '')}`,
}

export const ISSUES_FIELDS: FieldSpec[] = [ISSUES_STATUS_FIELD, ISSUES_SEVERITY_FIELD, ISSUES_ISSUE_FIELD]
export const ISSUES_ACTIONS: ActionSpec[] = [
  ISSUES_OPEN_ACTION,
  ISSUES_SET_STATUS_ACTION,
  ISSUES_OPEN_TRACKER_ACTION,
  ISSUES_CREATE_TRACKER_TICKET_ACTION,
]

export function issueIdArg(args: Record<string, unknown>): string {
  const issueId = typeof args.issueId === 'string' ? args.issueId.trim() : ''
  if (issueId.length === 0) throw new Error('issueId is required.')
  return issueId
}

/** 지금 목록에 있는 이슈. 없으면 어떻게 찾는지까지 알려 주며 던진다. */
export function findListedIssue(items: readonly Issue[], issueId: string): Issue {
  const issue = items.find((item) => item.id === issueId)
  if (issue === undefined) {
    throw new Error(
      `Issue ${issueId} is not in the list now. Change issues.status or issues.severity, then pick it from the options of issues.issue.`,
    )
  }
  return issue
}

export function requireIssueStatus(value: unknown): IssueStatus {
  if (value === 'OPEN' || value === 'RESOLVED') return value
  throw new Error('status must be OPEN or RESOLVED.')
}

/** field options 에 쓰는 한 줄. */
export function issueOptionLabel(issue: Pick<Issue, 'severity' | 'status' | 'title'>): string {
  return `[${issue.severity}] ${issue.title} (${issue.status})`
}

export type IssueStatusDependencies = {
  /** 행의 Resolve / Reopen 이 부르는 `toggle`. 실패하면 false. */
  toggle: (issue: Issue) => Promise<boolean>
  items: () => readonly Issue[]
}

export function createIssueStatusRunner(dependencies: IssueStatusDependencies) {
  return async (args: Record<string, unknown>): Promise<{ issueId: string; status: IssueStatus; changed: boolean }> => {
    const issueId = issueIdArg(args)
    const status = requireIssueStatus(args.status)
    const issue = findListedIssue(dependencies.items(), issueId)
    if (issue.status === status) return { issueId, status, changed: false }
    if (!(await dependencies.toggle(issue))) {
      throw new Error('The server did not accept the status change; the issue was left as it was.')
    }
    return { issueId, status, changed: true }
  }
}

export type TrackerTicketDependencies = {
  /** 행의 Export / Retry 가 부르는 `sync`. 실패하면 false. */
  sync: (issue: Issue) => Promise<boolean>
  items: () => readonly Issue[]
  trackerConnected: () => boolean
}

export function createTrackerTicketRunner(dependencies: TrackerTicketDependencies) {
  return async (args: Record<string, unknown>): Promise<{ issueId: string; requested: true }> => {
    const issueId = issueIdArg(args)
    const issue = findListedIssue(dependencies.items(), issueId)
    if (!dependencies.trackerConnected()) throw new Error('This project has no connected tracker.')
    if (issue.tracker !== null && issue.tracker.syncState !== 'FAILED') {
      throw new Error('This issue is already exported to the tracker.')
    }
    if (!(await dependencies.sync(issue))) throw new Error('The export to the tracker failed.')
    return { issueId, requested: true }
  }
}

/** 행의 tracker 링크가 가리키는 주소. 없으면 던진다. */
export function trackerUrlOf(issue: Pick<Issue, 'tracker'>): string {
  const url = issue.tracker?.url ?? null
  if (url === null || url.length === 0) {
    throw new Error('This issue has no tracker link; it has not been exported or the export has no URL.')
  }
  return url
}
