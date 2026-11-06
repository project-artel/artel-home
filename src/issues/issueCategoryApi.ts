import { apiFetch } from '../auth/authApi'
import { asRecord, asString, readJson, toApiError } from '../projects/projectApi'
import { isDecimalId } from '../qa/qaApi'
import { parseCategoryTag } from './issueApi'
import type { IssueCategory, IssueCategoryTag } from './issueTypes'

/** 이슈 · 공유 글 카테고리(ARTEL-1114). 사용자가 프로젝트마다 이름과 색을 정한다. */

const root = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/issue-categories`

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function parseCategory(data: unknown): IssueCategory | null {
  const record = asRecord(data)
  if (record === null || !isDecimalId(record.id)) return null
  return {
    id: record.id,
    name: asString(record.name),
    color: asString(record.color) || 'gray',
    issueCount: typeof record.issueCount === 'number' ? record.issueCount : 0,
    discussionCount: typeof record.discussionCount === 'number' ? record.discussionCount : 0,
  }
}

async function categoryOf(response: Response): Promise<IssueCategory> {
  if (!response.ok) throw await toApiError(response)
  const category = parseCategory(await readJson(response))
  if (category === null) throw new Error('category response had no id')
  return category
}

export async function listIssueCategories(projectId: string, signal?: AbortSignal): Promise<IssueCategory[]> {
  const response = await apiFetch(root(projectId), { signal })
  if (!response.ok) throw await toApiError(response)
  const items = asRecord(await readJson(response))?.items
  return Array.isArray(items) ? items.map(parseCategory).filter((one): one is IssueCategory => one !== null) : []
}

export async function createIssueCategory(projectId: string, input: { name: string; color: string }) {
  return categoryOf(await apiFetch(root(projectId), json('POST', input)))
}

export async function updateIssueCategory(projectId: string, categoryId: string, input: { name: string; color: string }) {
  return categoryOf(await apiFetch(`${root(projectId)}/${encodeURIComponent(categoryId)}`, json('PUT', input)))
}

export async function deleteIssueCategory(projectId: string, categoryId: string): Promise<void> {
  const response = await apiFetch(`${root(projectId)}/${encodeURIComponent(categoryId)}`, { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}

/** 이슈 하나의 카테고리를 [categoryIds] 로 바꾼다. 돌아온 것이 지금 붙은 카테고리다. */
export async function setIssueCategories(projectId: string, issueId: string, categoryIds: string[]): Promise<IssueCategoryTag[]> {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}/categories`,
    json('PUT', { categoryIds }),
  )
  if (!response.ok) throw await toApiError(response)
  const data = await readJson(response)
  return Array.isArray(data) ? data.map(parseCategoryTag).filter((tag): tag is IssueCategoryTag => tag !== null) : []
}
