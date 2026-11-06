import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, readJson, toApiError } from '../projects/projectApi'
import { isDecimalId } from '../qa/qaApi'
import type { TestCaseFolder } from '../testCases/testCaseFolderApi'

/*
 * 이슈 folder(ARTEL-1114). 화면은 케이스 라이브러리의 folder tree(`FolderPane`)를 그대로 쓰므로, 서버의
 * `issueCount` 를 그 tree 가 읽는 `caseCount` 자리에 담아 같은 `TestCaseFolder` 모양으로 돌려준다.
 */

const root = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/issue-folders`
const folderPath = (projectId: string, folderId: string) => `${root(projectId)}/${encodeURIComponent(folderId)}`

function parseFolder(data: unknown): TestCaseFolder | null {
  const record = asRecord(data)
  if (record === null || !isDecimalId(record.id)) return null
  const parentId = asNullableString(record.parentId)
  return {
    id: record.id,
    parentId: parentId !== null && isDecimalId(parentId) ? parentId : null,
    name: asString(record.name),
    caseCount: typeof record.issueCount === 'number' ? record.issueCount : 0,
    visibleCount: null,
  }
}

async function folderOf(response: Response): Promise<TestCaseFolder> {
  if (!response.ok) throw await toApiError(response)
  const folder = parseFolder(await readJson(response))
  if (folder === null) throw new Error('issue folder response had no id')
  return folder
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export async function listIssueFolders(projectId: string, signal?: AbortSignal): Promise<TestCaseFolder[]> {
  const response = await apiFetch(root(projectId), { signal })
  if (!response.ok) throw await toApiError(response)
  const items = asRecord(await readJson(response))?.items
  return Array.isArray(items) ? items.map(parseFolder).filter((folder): folder is TestCaseFolder => folder !== null) : []
}

export async function createIssueFolder(projectId: string, input: { name: string; parentId: string | null }) {
  return folderOf(await apiFetch(root(projectId), json('POST', input)))
}

export async function updateIssueFolder(projectId: string, folderId: string, input: { name: string; parentId: string | null }) {
  return folderOf(await apiFetch(folderPath(projectId, folderId), json('PUT', input)))
}

export async function deleteIssueFolder(projectId: string, folderId: string): Promise<void> {
  const response = await apiFetch(folderPath(projectId, folderId), { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}

export async function cloneIssueFolder(projectId: string, folderId: string) {
  return folderOf(await apiFetch(`${folderPath(projectId, folderId)}/clones`, json('POST', {})))
}

export async function addIssuesToFolder(projectId: string, folderId: string, issueIds: readonly string[]) {
  return folderOf(await apiFetch(`${folderPath(projectId, folderId)}/items`, json('POST', { issueIds })))
}

export async function removeIssuesFromFolder(projectId: string, folderId: string, issueIds: readonly string[]) {
  return folderOf(await apiFetch(`${folderPath(projectId, folderId)}/items/removals`, json('POST', { issueIds })))
}
