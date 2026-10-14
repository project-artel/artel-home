import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, jsonRequest, readJson, toApiError } from '../projects/projectApi'

/*
 * 테스트 런 폴더(ARTEL-1049). 폴더는 한 빌드 버전 안에만 있다 — `gameBuildId` 가 null 이면 "버전 없음" 안이다.
 * 런을 폴더에 넣는 것은 `changeRunGameBuild(…, folderId)` 다.
 */

export type RunFolder = {
  id: string
  gameBuildId: string | null
  parentId: string | null
  name: string
}

const foldersRoot = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/test-run-folders`

export function parseRunFolder(data: unknown): RunFolder | null {
  const record = asRecord(data)
  const id = record === null ? '' : asString(record.id)
  if (record === null || id.length === 0) return null
  return {
    id,
    gameBuildId: asNullableString(record.gameBuildId),
    parentId: asNullableString(record.parentId),
    name: asString(record.name),
  }
}

export async function listRunFolders(projectId: string, signal?: AbortSignal): Promise<RunFolder[]> {
  const response = await apiFetch(foldersRoot(projectId), { signal })
  if (!response.ok) throw await toApiError(response)
  const items = asRecord(await readJson(response))?.items
  return Array.isArray(items) ? items.map(parseRunFolder).filter((folder): folder is RunFolder => folder !== null) : []
}

/** 부모 폴더 안이면 그 버전을, 아니면 `gameBuildId` 버전(null 이면 버전 없음) 바로 아래에 만든다. */
export async function createRunFolder(
  projectId: string,
  body: { name: string; gameBuildId: string | null; parentId: string | null },
): Promise<RunFolder> {
  const response = await apiFetch(foldersRoot(projectId), { method: 'POST', ...jsonRequest(body) })
  if (!response.ok) throw await toApiError(response)
  const folder = parseRunFolder(await readJson(response))
  if (folder === null) throw new Error('The server did not return a folder.')
  return folder
}

export async function renameRunFolder(projectId: string, folderId: string, name: string): Promise<void> {
  const response = await apiFetch(`${foldersRoot(projectId)}/${encodeURIComponent(folderId)}`, {
    method: 'PUT',
    ...jsonRequest({ name }),
  })
  if (!response.ok) throw await toApiError(response)
}

/** 하위 폴더는 함께 지워지고, 안의 런은 그 버전 바로 아래로 나온다. */
export async function deleteRunFolder(projectId: string, folderId: string): Promise<void> {
  const response = await apiFetch(`${foldersRoot(projectId)}/${encodeURIComponent(folderId)}`, { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}
