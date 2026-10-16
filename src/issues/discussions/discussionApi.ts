import { apiFetch } from '../../auth/authApi'
import { asRecord, ProjectApiError, readJson } from '../../projects/projectApi'
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
  type Person,
  type Purpose,
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
    (row.state !== 'OPEN' && row.state !== 'CLOSED')
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
  }
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
): Promise<Page<Discussion>> {
  const params = new URLSearchParams({ size: '30' })
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
    | { state: 'OPEN' | 'CLOSED' }
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
) {
  return parseComment(
    await request(
      `${root(projectId)}/${discussionId}/comments${editing ? `/${editing.id}` : ''}`,
      editing ? 'PATCH' : 'POST',
      {
        body,
        mentionedUserIds,
        ...(editing ? { version: editing.version } : { clientRequestId }),
      },
    ),
  )
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
