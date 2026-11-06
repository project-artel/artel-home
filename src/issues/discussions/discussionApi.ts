import { apiFetch } from '../../auth/authApi'
import { asRecord, ProjectApiError, readJson, toApiError } from '../../projects/projectApi'
import { isDecimalId } from '../../qa/qaApi'
import { parseIssue } from '../issueApi'
import {
  PURPOSES,
  type Comment,
  type Discussion,
  type DiscussionDetail,
  type Draft,
  type Filter,
  type LinkedIssue,
  type Page,
  type NumberedPage,
  type Person,
  type Purpose,
  type CategoryTag,
} from './discussionTypes'

function invalid(): never {
  throw new ProjectApiError(
    200,
    'Invalid discussion response',
    'CLIENT_MALFORMED_DISCUSSION',
  )
}
function record(value: unknown) {
  return asRecord(value) ?? invalid()
}
function string(value: unknown): string {
  return typeof value === 'string' ? value : invalid()
}
function id(value: unknown): string {
  return isDecimalId(value) ? value : invalid()
}
function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : invalid()
}
function bool(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid()
}
function array<T>(value: unknown, parse: (value: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(parse) : invalid()
}
function person(value: unknown): Person {
  const row = record(value)
  return {
    id: id(row.id),
    displayName: string(row.displayName),
    userTag: string(row.userTag),
  }
}
export function parseDiscussion(value: unknown): Discussion {
  const row = record(value)
  if (
    !PURPOSES.includes(row.purpose as Purpose) ||
    (row.state !== 'OPEN' && row.state !== 'CLOSED' && row.state !== 'DRAFT')
  )
    invalid()
  return {
    id: id(row.id),
    title: string(row.title),
    excerpt: string(row.excerpt),
    purpose: row.purpose as Purpose,
    state: row.state,
    pinned: bool(row.pinned),
    author: person(row.author),
    issueCount: count(row.issueCount),
    commentCount: count(row.commentCount),
    createdAt: string(row.createdAt),
    updatedAt: string(row.updatedAt),
    subscribed: bool(row.subscribed),
    version: count(row.version),
    categories: Array.isArray(row.categories) ? row.categories.map(parseCategoryTag) : [],
    reviewerCount: typeof row.reviewerCount === 'number' ? row.reviewerCount : 0,
    approvalCount: typeof row.approvalCount === 'number' ? row.approvalCount : 0,
    number: isDecimalId(row.number) ? row.number : null,
    gameBuildId: isDecimalId(row.gameBuildId) ? row.gameBuildId : null,
    buildVersion: typeof row.buildVersion === 'string' ? row.buildVersion : null,
  }
}
export function parseCategoryTag(value: unknown): CategoryTag {
  const row = record(value)
  return { id: id(row.id), name: string(row.name), color: string(row.color) }
}
export function parseLinkedIssue(value: unknown): LinkedIssue {
  const row = record(value)
  return {
    id: id(row.id),
    title: string(row.title),
    severity: string(row.severity),
    status: string(row.status),
    qaTryId: id(row.qaTryId),
    qaRunId: row.qaRunId === null ? null : id(row.qaRunId),
    number: typeof row.number === 'string' ? row.number : null,
  }
}
export function parseComment(value: unknown): Comment {
  const row = record(value)
  return {
    id: id(row.id),
    body: string(row.body),
    author: person(row.author),
    mentions: array(row.mentions, person),
    createdAt: string(row.createdAt),
    updatedAt: string(row.updatedAt),
    version: count(row.version),
    reactionCount: count(row.reactionCount),
    reacted: bool(row.reacted),
    canEdit: bool(row.canEdit),
    parentId: isDecimalId(row.parentId) ? row.parentId : null,
    canDelete: row.canDelete === true,
  }
}
export function parseDiscussionDetail(value: unknown): DiscussionDetail {
  const row = record(value)
  return {
    ...parseDiscussion(value),
    body: string(row.body),
    issues: array(row.issues, parseLinkedIssue),
    mentions: array(row.mentions, person),
    decision: row.decision === null ? null : parseComment(row.decision),
    canEdit: bool(row.canEdit),
    canPin: bool(row.canPin),
    reviewers: Array.isArray(row.reviewers)
      ? row.reviewers.map((value) => {
          const reviewer = record(value)
          return {
            person: person(reviewer.person),
            approvedAt: typeof reviewer.approvedAt === 'string' ? reviewer.approvedAt : null,
          }
        })
      : [],
    approvalsRequired: typeof row.approvalsRequired === 'number' ? row.approvalsRequired : 1,
    canManage: row.canManage === undefined ? bool(row.canEdit) : bool(row.canManage),
    canApprove: row.canApprove === true,
  }
}
export function parsePage<T>(
  value: unknown,
  parse: (value: unknown) => T,
): Page<T> {
  const row = record(value)
  const hasMore = bool(row.hasMore)
  const cursor = row.nextCursor === null ? null : string(row.nextCursor)
  if (hasMore && !cursor) invalid()
  return { items: array(row.items, parse), nextCursor: cursor, hasMore }
}
const root = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/issue-discussions`
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  return readJson(
    await apiFetch(path, {
      method,
      signal,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    }),
  )
}
export async function listDiscussions(
  projectId: string,
  filter: Filter,
  query: string,
  cursor?: string,
  signal?: AbortSignal,
  categoryId?: string | null,
): Promise<Page<Discussion>> {
  const params = new URLSearchParams({ size: '30' })
  if (categoryId) params.set('categoryId', categoryId)
  if (filter === 'open' || filter === 'closed')
    params.set('state', filter.toUpperCase())
  if (filter === 'mine' || filter === 'subscribed') params.set(filter, 'true')
  if (query.trim()) params.set('query', query.trim())
  if (cursor) params.set('cursor', cursor)
  return parsePage(
    await request(`${root(projectId)}?${params}`, 'GET', undefined, signal),
    parseDiscussion,
  )
}
/** 게시판 한 쪽. [page] 는 1 부터. "논의 중"(OPEN)은 서버가 Draft 를 함께 준다. */
export async function listDiscussionPage(
  projectId: string,
  filter: Filter,
  query: string,
  page: number,
  size: number,
  categoryId: string | null,
  gameBuildId: string | null,
  signal?: AbortSignal,
): Promise<NumberedPage<Discussion>> {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  if (filter === 'open' || filter === 'closed') params.set('state', filter.toUpperCase())
  if (filter === 'mine' || filter === 'subscribed') params.set(filter, 'true')
  if (query.trim()) params.set('query', query.trim())
  if (categoryId) params.set('categoryId', categoryId)
  if (gameBuildId) params.set('gameBuildId', gameBuildId)
  const row = record(await request(`${root(projectId)}/pages?${params}`, 'GET', undefined, signal))
  return {
    items: array(row.items, parseDiscussion),
    page: count(row.page),
    size: count(row.size),
    total: count(row.total),
  }
}
export async function getDiscussion(
  projectId: string,
  discussionId: string,
  signal?: AbortSignal,
) {
  return parseDiscussionDetail(
    await request(
      `${root(projectId)}/${encodeURIComponent(discussionId)}`,
      'GET',
      undefined,
      signal,
    ),
  )
}
export async function saveDiscussion(
  projectId: string,
  draft: Draft,
  clientRequestId: string,
  editing?: DiscussionDetail,
) {
  return parseDiscussionDetail(
    await request(
      `${root(projectId)}${editing ? `/${editing.id}` : ''}`,
      editing ? 'PATCH' : 'POST',
      {
        ...draft,
        ...(editing ? { version: editing.version } : { clientRequestId }),
      },
    ),
  )
}
export async function setDiscussion(
  projectId: string,
  discussionId: string,
  action: 'state' | 'pin' | 'decision' | 'subscription',
  value:
    | { enabled: boolean }
    | { state: 'DRAFT' | 'OPEN' | 'CLOSED' }
    | { commentId: string | null },
) {
  return parseDiscussionDetail(
    await request(`${root(projectId)}/${discussionId}/${action}`, 'PUT', value),
  )
}
export async function listComments(
  projectId: string,
  discussionId: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ size: '30' })
  if (cursor) params.set('cursor', cursor)
  return parsePage(
    await request(
      `${root(projectId)}/${discussionId}/comments?${params}`,
      'GET',
      undefined,
      signal,
    ),
    parseComment,
  )
}
export async function saveComment(
  projectId: string,
  discussionId: string,
  body: string,
  mentionedUserIds: string[],
  clientRequestId: string,
  editing?: Comment,
  parentId?: string | null,
) {
  return parseComment(
    await request(
      `${root(projectId)}/${discussionId}/comments${editing ? `/${editing.id}` : ''}`,
      editing ? 'PATCH' : 'POST',
      {
        body,
        mentionedUserIds,
        ...(editing ? { version: editing.version } : { clientRequestId, parentId: parentId ?? null }),
      },
    ),
  )
}

/** 검토자가 확인 요청을 승인하거나 승인을 거둔다. 승인 수가 차면 서버가 글을 해결한다. */
export async function approveDiscussion(projectId: string, discussionId: string, approved: boolean) {
  return parseDiscussionDetail(
    await request(`${root(projectId)}/${encodeURIComponent(discussionId)}/approval`, 'PUT', { approved }),
  )
}

/** 확인 요청이 해결되는 승인 수. 바꾸기는 프로젝트 OWNER 만. */
export async function getDiscussionSettings(projectId: string, signal?: AbortSignal): Promise<{ approvalsRequired: number }> {
  const row = record(await request(`${root(projectId)}/settings`, 'GET', undefined, signal))
  return { approvalsRequired: count(row.approvalsRequired) }
}

export async function updateDiscussionSettings(projectId: string, approvalsRequired: number) {
  const row = record(await request(`${root(projectId)}/settings`, 'PUT', { approvalsRequired }))
  return { approvalsRequired: count(row.approvalsRequired) }
}
export async function reactToComment(
  projectId: string,
  discussionId: string,
  commentId: string,
  enabled: boolean,
) {
  return parseComment(
    await request(
      `${root(projectId)}/${discussionId}/comments/${commentId}/reaction`,
      'PUT',
      { enabled },
    ),
  )
}
export async function issueOptions(
  projectId: string,
  query: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ query, size: '30' })
  if (cursor) params.set('cursor', cursor)
  return parsePage(
    await request(
      `${root(projectId)}/issue-options?${params}`,
      'GET',
      undefined,
      signal,
    ),
    parseLinkedIssue,
  )
}
export async function getOriginalIssue(
  projectId: string,
  issueId: string,
  signal?: AbortSignal,
) {
  return (
    parseIssue(
      await request(
        `/api/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`,
        'GET',
        undefined,
        signal,
      ),
    ) ?? invalid()
  )
}

/** 댓글을 지운다. 답글은 서버가 함께 지운다. */
export async function deleteComment(projectId: string, discussionId: string, commentId: string): Promise<void> {
  const response = await apiFetch(`${root(projectId)}/${encodeURIComponent(discussionId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw await toApiError(response)
}
