/** 이슈 해결 요청 · 확인 요청(검토자 승인) · 결정 사항. */
export const PURPOSES = ['RESOLUTION', 'QUESTION', 'DECISION'] as const
export type Purpose = (typeof PURPOSES)[number]
export type Person = { id: string; displayName: string; userTag: string }
export type LinkedIssue = {
  id: string
  title: string
  severity: string
  status: string
  qaTryId: string
  qaRunId: string | null
  /** 프로젝트 안 이슈 번호. 서버가 아직 싣지 않으면 null. */
  number: string | null
}
export type CategoryTag = { id: string; name: string; color: string }
export type DiscussionState = 'DRAFT' | 'OPEN' | 'CLOSED'
export type Discussion = {
  id: string
  title: string
  excerpt: string
  purpose: Purpose
  state: DiscussionState
  pinned: boolean
  author: Person
  issueCount: number
  commentCount: number
  createdAt: string
  updatedAt: string
  subscribed: boolean
  version: number
  categories: CategoryTag[]
  reviewerCount: number
  approvalCount: number
  /** 프로젝트 안 글 번호. 화면의 `#` 뒤 값이다. */
  number: string | null
  /** 글이 다루는 빌드 버전. 본문의 TC 는 이 버전의 것이다. */
  gameBuildId: string | null
  buildVersion: string | null
}
export type Reviewer = { person: Person; approvedAt: string | null }
export type Comment = {
  id: string
  body: string
  author: Person
  mentions: Person[]
  createdAt: string
  updatedAt: string
  version: number
  reactionCount: number
  reacted: boolean
  canEdit: boolean
  /** 대댓글이면 최상위 댓글 id. */
  parentId: string | null
  /** 지울 수 있다(쓴 사람이나 프로젝트 OWNER). */
  canDelete: boolean
}
export type DiscussionDetail = Discussion & {
  body: string
  issues: LinkedIssue[]
  mentions: Person[]
  decision: Comment | null
  canEdit: boolean
  canPin: boolean
  reviewers: Reviewer[]
  /** 확인 요청이 해결되는 승인 수(프로젝트 설정). */
  approvalsRequired: number
  /** 지금 사용자가 검토자다. */
  canApprove: boolean
  /** 상태 · 결정 댓글을 다룬다(쓴 사람과 OWNER). 내용 고치기([canEdit])는 쓴 사람만이다. */
  canManage: boolean
}
export type Page<T> = {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}
export type Draft = {
  title: string
  body: string
  purpose: Purpose
  issueIds: string[]
  mentionedUserIds: string[]
  reviewerIds: string[]
  categoryIds: string[]
  /** 글의 빌드 버전. 빈 값이면 버전 없음. */
  gameBuildId?: string | null
  /** 새 글만: Draft 로 저장한다. */
  draft?: boolean
}
/** 게시판 탭. "논의 중" 은 Draft 를 함께 보인다. */
export type Filter = 'open' | 'closed' | 'subscribed' | 'mine'
export type NumberedPage<T> = { items: T[]; page: number; size: number; total: number }
