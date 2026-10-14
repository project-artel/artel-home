import { apiFetch } from '../auth/authApi'
import {
  asNullableString,
  asRecord,
  asString,
  jsonRequest,
  readJson,
  toApiError,
} from '../projects/projectApi'
import { asVerificationStatus, type TestCase, type VerificationStatus } from './testCaseTypes'

/*
 * 폴더 CRUD: `/api/projects/{projectId}/test-case-folders`, 그리고 폴더가 담은 케이스(ARTEL-1024).
 *
 * id 는 서버에서 64비트라 문자열로 오간다. 폴더 한 건이 id 와 이름 없이는 그릴 수 없으므로 둘 중
 * 하나라도 비면 그 폴더만 버리고 나머지는 살린다.
 *
 * 폴더는 케이스를 담는다. 케이스는 버전을 넘어 같은 id 라, 한 폴더를 어느 버전으로든 풀어 볼 수 있다.
 * 같은 케이스가 여러 폴더에 들 수 있다.
 */

export type TestCaseFolder = {
  id: string
  /** 최상위 폴더면 `null`. */
  parentId: string | null
  name: string
  /** 바로 담긴 케이스 수(하위 폴더 제외, 숨긴 것 포함). */
  caseCount: number
  /** 목록을 버전으로 읽었을 때 그 버전에서 보이는 항목 수. 버전 없이 읽었으면 `null`. */
  visibleCount: number | null
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
    caseCount: asCount(record.caseCount) ?? 0,
    visibleCount: asCount(record.visibleCount),
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

const asCount = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** [gameBuildId] 를 주면 폴더마다 그 버전에서 보이는 항목 수(`visibleCount`)를 함께 받는다. */
export async function listTestCaseFolders(
  projectId: string,
  signal?: AbortSignal,
  gameBuildId: string | null = null,
): Promise<TestCaseFolder[]> {
  const query = gameBuildId === null ? '' : `?gameBuildId=${encodeURIComponent(gameBuildId)}`
  const response = await apiFetch(`${foldersRoot(projectId)}${query}`, { signal })
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

/** 하위 폴더도 함께 지워진다. 케이스는 남고, 다른 폴더에 없으면 폴더 없음이 된다. 204. */
export async function deleteTestCaseFolder(projectId: string, folderId: string): Promise<void> {
  const response = await apiFetch(folderPath(projectId, folderId), { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}

/** 하위 폴더와 항목(순서 · 숨김 포함)째 복제한다. 이름이 겹치면 서버가 ` (2)` 를 붙인다. 201. */
export async function cloneTestCaseFolder(
  projectId: string,
  folderId: string,
  input: { parentId?: string | null; toRoot?: boolean; name?: string } = {},
): Promise<TestCaseFolder> {
  const response = await apiFetch(`${folderPath(projectId, folderId)}/clones`, {
    method: 'POST',
    ...jsonRequest(input),
  })
  if (!response.ok) throw await toApiError(response)
  return requireFolder(await readJson(response), response.status)
}

/** 폴더 항목 한 줄을 고른 버전으로 푼 것. */
export type FolderItem = {
  testCase: TestCase
  position: number
  /** 이 폴더에서 이 버전에 숨겼다. */
  hidden: boolean
  /** 이 폴더에서 숨긴 버전 전부. 지운 폴더를 Undo 로 되살릴 때 쓴다. */
  hiddenGameBuildIds: string[]
  /** 이 버전에 있는 케이스인가. 없으면 내용은 가장 최근 버전의 것이고 판정은 `null` 이다. */
  inVersion: boolean
  origin: 'MAP' | 'MANUAL'
  verificationStatus: VerificationStatus | null
}

export type FolderItemList = {
  folderId: string
  /** 항목을 푼 버전. 프로젝트에 버전이 없으면 `null`. */
  gameBuildId: string | null
  items: FolderItem[]
}

export function parseFolderItems(data: unknown, projectId: string): FolderItemList {
  const record = asRecord(data)
  const rawItems = Array.isArray(record?.items) ? record.items : []
  const items = rawItems
    .map((raw): FolderItem | null => {
      const item = asRecord(raw)
      const id = asString(item?.testCaseId)
      if (id.length === 0) return null
      const status = asString(item?.verificationStatus)
      const verificationStatus = status.length > 0 ? asVerificationStatus(status) : null
      return {
        testCase: {
          id,
          projectId,
          scene: asString(item?.scene),
          step: asString(item?.step),
          precondition: asNullableString(item?.precondition),
          expectedValue: asString(item?.expectedValue),
          status: asNullableString(item?.status),
          verificationStatus: verificationStatus ?? 'DRAFT',
          lastVerifiedBuildId: null,
          createdAt: asString(item?.createdAt),
          folderId: asString(record?.folderId),
          evidenceGaps: [],
        },
        position: typeof item?.position === 'number' ? item.position : 0,
        hidden: item?.hidden === true,
        hiddenGameBuildIds: (Array.isArray(item?.hiddenGameBuildIds) ? item.hiddenGameBuildIds : [])
          .map((one) => asString(one))
          .filter((one) => one.length > 0),
        inVersion: item?.inVersion !== false,
        origin: item?.origin === 'MAP' ? 'MAP' : 'MANUAL',
        verificationStatus,
      }
    })
    .filter((item): item is FolderItem => item !== null)
  return { folderId: asString(record?.folderId), gameBuildId: asNullableString(record?.gameBuildId), items }
}

export async function listFolderItems(
  projectId: string,
  folderId: string,
  gameBuildId: string | null,
  signal?: AbortSignal,
): Promise<FolderItemList> {
  const query = gameBuildId === null ? '' : `?gameBuildId=${encodeURIComponent(gameBuildId)}`
  const response = await apiFetch(`${folderPath(projectId, folderId)}/items${query}`, { signal })
  if (!response.ok) throw await toApiError(response)
  return parseFolderItems(await readJson(response), projectId)
}

/** 항목 쓰기의 결과. 이미 그 상태였던 것은 싣지 않는다 — Undo 는 이것만 되돌린다. */
export type FolderItemsChange = {
  caseIds: string[]
  /** 옮기기에서만: 대상에 이미 있어 이쪽 항목만 지운 케이스. */
  droppedCaseIds: string[]
}

export function parseItemsChange(data: unknown): FolderItemsChange {
  const record = asRecord(data)
  const ids = (value: unknown) =>
    (Array.isArray(value) ? value : []).map((one) => asString(one)).filter((one) => one.length > 0)
  return { caseIds: ids(record?.caseIds), droppedCaseIds: ids(record?.droppedCaseIds) }
}

async function writeItems(
  projectId: string,
  folderId: string,
  suffix: string,
  method: 'POST' | 'PUT',
  body: unknown,
): Promise<FolderItemsChange> {
  const response = await apiFetch(`${folderPath(projectId, folderId)}/items${suffix}`, {
    method,
    ...jsonRequest(body),
  })
  if (!response.ok) throw await toApiError(response)
  return parseItemsChange(await readJson(response))
}

/** 끝에 넣는다. 이미 든 케이스는 그대로다. */
export function addFolderItems(projectId: string, folderId: string, caseIds: readonly string[]) {
  return writeItems(projectId, folderId, '', 'POST', { caseIds })
}

export function removeFolderItems(projectId: string, folderId: string, caseIds: readonly string[]) {
  return writeItems(projectId, folderId, '/removals', 'POST', { caseIds })
}

/** 다른 폴더 끝으로 옮긴다. 대상에 이미 있는 케이스는 이쪽 항목만 지운다(`droppedCaseIds`). */
export function moveFolderItems(
  projectId: string,
  folderId: string,
  caseIds: readonly string[],
  targetFolderId: string,
) {
  return writeItems(projectId, folderId, '/moves', 'POST', { caseIds, targetFolderId })
}

/** 순서를 통째로 다시 정한다. [caseIds] 는 그 폴더의 항목 전부여야 한다. */
export function reorderFolderItems(projectId: string, folderId: string, caseIds: readonly string[]) {
  return writeItems(projectId, folderId, '/order', 'PUT', { caseIds })
}

export function setFolderItemsHidden(
  projectId: string,
  folderId: string,
  caseIds: readonly string[],
  gameBuildId: string,
  hidden: boolean,
) {
  return writeItems(projectId, folderId, '/hidden', 'PUT', { caseIds, gameBuildId, hidden })
}
