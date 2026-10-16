export const PURPOSES = ['SHARE', 'QUESTION', 'DECISION'] as const
export type Purpose = (typeof PURPOSES)[number]
export type Person = { id: string; displayName: string; userTag: string }
export type LinkedIssue = {
  id: string
  title: string
  severity: string
  status: string
  qaTryId: string
  qaRunId: string | null
}
export type Discussion = {
  id: string
  title: string
  excerpt: string
  purpose: Purpose
  state: 'OPEN' | 'CLOSED'
  pinned: boolean
  author: Person
  issueCount: number
  commentCount: number
  createdAt: string
  updatedAt: string
  subscribed: boolean
  version: number
}
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
}
export type DiscussionDetail = Discussion & {
  body: string
  issues: LinkedIssue[]
  mentions: Person[]
  decision: Comment | null
  canEdit: boolean
  canPin: boolean
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
}
export type Filter = 'all' | 'open' | 'closed' | 'subscribed' | 'mine'
