import type { IssueTracker } from '../tracker/trackerTypes'

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
  /**
   * The `QaRun` that scenario belongs to. `null` for an issue whose try
   * predates ARTEL-722, or while that server change has not shipped yet —
   * callers render a plain muted row instead of a link when this is `null`.
   */
  qaRunId: string | null
  severity: IssueSeverity
  title: string
  /** The agent's whole payload. Shape is not guaranteed — see `IssueDetail`. */
  detail: unknown
  status: IssueStatus
  /** When the agent saw it, not when the server stored it. */
  reportedAt: string
  resolvedAt: string | null
  /**
   * Where this defect stands with the project's connected tracker. `null`
   * when the project has no connection, when the server has not shipped this
   * field yet, or when a connection exists but this defect has not been
   * exported — `IssuesSection` tells those apart using the project's own
   * `TrackerLink`, not this field alone.
   */
  tracker: IssueTracker | null
  /** 이슈가 나온 자리 — 빌드 버전 · TR · 시나리오. 서버가 아직 이 칸을 싣지 않으면 null. */
  origin: IssueOrigin | null
  /** 프로젝트 안 번호. 화면의 `#` 뒤 값이다. 서버가 아직 싣지 않으면 null 이고 그때는 id 를 보인다. */
  number: string | null
  /** 보관한 때. null 이면 보관하지 않았다. */
  archivedAt: string | null
  categories: IssueCategoryTag[]
}

export type IssueCategoryTag = { id: string; name: string; color: string }

/** 카테고리 색. 서버도 이 이름만 받는다 — 대비는 화면이 책임진다. */
export const CATEGORY_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink'] as const

export type IssueCategory = IssueCategoryTag & { issueCount: number; discussionCount: number }

/** 화면에 보이는 이슈 번호. */
export const issueNumber = (issue: Pick<Issue, 'id' | 'number'>) => issue.number ?? issue.id

/**
 * 어느 빌드의 어느 TR 에서, 어느 시나리오를 돌리다 나왔나. 빌드는 run 이 고른 빌드, 없으면 TR 의 빌드다.
 * run 없이 돈 예전 실행은 TR · 빌드가 비어 있다.
 */
export type IssueOrigin = {
  testScenarioId: string
  testScenarioTitle: string
  testRunId: string | null
  testRunName: string | null
  gameBuildId: string | null
  buildVersion: string | null
  buildLabel: string | null
  model: string | null
  qaRunStartedAt: string | null
}

/** 빌드 · TR · 심각도별 이슈 수. 거르기 칸이 개수를 같이 보인다. */
export type IssueFacets = {
  total: number
  /** 보관한 이슈 수. 위의 개수에 들지 않는다. */
  archived: number
  builds: { gameBuildId: string | null; version: string | null; label: string | null; count: number; openCount: number }[]
  testRuns: { testRunId: string | null; name: string | null; gameBuildId: string | null; count: number; openCount: number }[]
  severities: Partial<Record<IssueSeverity, number>>
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
  /** 이 빌드 버전에서 나온 것만. 없으면 모든 빌드. */
  gameBuildId?: string | null
  /** 이 TR 에서 나온 것만. 없으면 모든 TR. */
  testRunId?: string | null
  /** 이 이슈 folder 에 담긴 것만. */
  folderId?: string | null
  /** 빌드를 알 수 없는 것만(버전 목록의 "버전 없음"). */
  unversioned?: boolean
  categoryId?: string | null
  /** true 면 보관함(보관한 것만). */
  archived?: boolean
  /** 제목에 이 글이 든 것만. */
  query?: string
}
