import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, readJson, toApiError } from '../projects/projectApi'
import { contentMapPath } from './contentMapApi'

/** 음이 아닌 정수만. 그 밖은 0 으로 낮춘다. */
function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

/**
 * `POST .../content-map/test-cases` 의 응답: 이번 생성이 폴더 안의 test case 를 몇 건 어떻게 바꿨는지.
 * `folderId` 는 그 test case 들이 든 폴더이고, 서버가 못 줬으면 `null` 이다.
 */
export type GeneratedTestCases = {
  folderId: string | null
  created: number
  updated: number
  deleted: number
  broken: number
}

export function parseGeneratedTestCases(data: unknown): GeneratedTestCases {
  const record = asRecord(data)
  const folderId = asNullableString(record?.folderId)
  return {
    folderId: folderId !== null && folderId.length > 0 ? folderId : null,
    created: asCount(record?.created),
    updated: asCount(record?.updated),
    deleted: asCount(record?.deleted),
    broken: asCount(record?.broken),
  }
}

/**
 * `POST .../content-map/test-cases` — 적재된 content map 에서 test case 를 만든다. 이미 있는 것은
 * 갱신하고 사라진 것은 지운다. build 가 없으면 404, 적재된 content map 이 없으면 409.
 */
export async function generateContentMapTestCases(
  projectId: string,
  buildId: string,
): Promise<GeneratedTestCases> {
  const response = await apiFetch(contentMapPath(projectId, buildId, '/test-cases'), {
    method: 'POST',
  })
  if (!response.ok) throw await toApiError(response)
  return parseGeneratedTestCases(await readJson(response))
}
