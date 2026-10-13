import { apiFetch } from '../auth/authApi'
import {
  asNullableString,
  asRecord,
  asString,
  jsonRequest,
  readJson,
  toApiError,
} from '../projects/projectApi'

/*
 * 폴더 CRUD: `/api/projects/{projectId}/test-case-folders`.
 *
 * id 는 서버에서 64비트라 문자열로 오간다. 폴더 한 건이 id 와 이름 없이는 그릴 수 없으므로 둘 중
 * 하나라도 비면 그 폴더만 버리고 나머지는 살린다.
 */

export type TestCaseFolder = {
  id: string
  /** 최상위 폴더면 `null`. */
  parentId: string | null
  name: string
  /** content map 적재로 만들어진 폴더면 그 content map 의 id, 사람이 만든 폴더면 `null`. */
  contentMapId: string | null
  gameBuildId: string | null
}

export type TestCaseFolderInput = {
  name: string
  parentId: string | null
}

function foldersRoot(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/test-case-folders`
}

function folderPath(projectId: string, folderId: string): string {
  return `${foldersRoot(projectId)}/${encodeURIComponent(folderId)}`
}

export function parseTestCaseFolder(data: unknown): TestCaseFolder | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asString(record.id)
  const name = asString(record.name)
  if (id.length === 0 || name.length === 0) return null

  return {
    id,
    parentId: asNullableString(record.parentId),
    name,
    contentMapId: asNullableString(record.contentMapId),
    gameBuildId: asNullableString(record.gameBuildId),
  }
}

export function parseTestCaseFolders(data: unknown): TestCaseFolder[] {
  const items = Array.isArray(data) ? data : asRecord(data)?.items
  if (!Array.isArray(items)) return []

  return items
    .map(parseTestCaseFolder)
    .filter((folder): folder is TestCaseFolder => folder !== null)
}

function requireFolder(data: unknown, status: number): TestCaseFolder {
  const folder = parseTestCaseFolder(data)
  if (folder === null) {
    throw new Error(`The server described the folder oddly (status ${status}).`)
  }
  return folder
}

export async function listTestCaseFolders(
  projectId: string,
  signal?: AbortSignal,
): Promise<TestCaseFolder[]> {
  const response = await apiFetch(foldersRoot(projectId), { signal })
  return parseTestCaseFolders(await readJson(response))
}

/** 같은 부모 아래 같은 이름이면 409. */
export async function createTestCaseFolder(
  projectId: string,
  input: TestCaseFolderInput,
): Promise<TestCaseFolder> {
  const response = await apiFetch(foldersRoot(projectId), {
    method: 'POST',
    ...jsonRequest(input),
  })
  if (!response.ok) throw await toApiError(response)
  return requireFolder(await readJson(response), response.status)
}

/** 이름 변경과 이동이 같은 요청이다. 자기 자신이나 하위 폴더 밑으로 옮기면 400, 이름이 겹치면 409. */
export async function updateTestCaseFolder(
  projectId: string,
  folderId: string,
  input: TestCaseFolderInput,
): Promise<TestCaseFolder> {
  const response = await apiFetch(folderPath(projectId, folderId), {
    method: 'PUT',
    ...jsonRequest(input),
  })
  if (!response.ok) throw await toApiError(response)
  return requireFolder(await readJson(response), response.status)
}

/** 하위 폴더도 함께 지워지고, 그 안의 test case 는 폴더 없음이 된다. 204. */
export async function deleteTestCaseFolder(projectId: string, folderId: string): Promise<void> {
  const response = await apiFetch(folderPath(projectId, folderId), { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}
