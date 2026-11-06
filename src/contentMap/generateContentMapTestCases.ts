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
  /** 바로 앞 버전에 있던 사용자 생성 케이스를 이 버전에 이어 넣은 수(ARTEL-1032). */
  carriedOver: number
  /** 앞 버전 판정을 이어받은 수와, 이어받지 않아 다시 검증으로 돌린 수(ARTEL-1180). */
  verdictsCarried: number
  verdictsReset: number
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
    carriedOver: asCount(record?.carriedOver),
    verdictsCarried: asCount(record?.verdictsCarried),
    verdictsReset: asCount(record?.verdictsReset),
  }
}

/**
 * `POST .../content-map/test-cases` — 적재된 content map 에서 test case 를 만든다. 이미 있는 것은
 * 갱신하고 사라진 것은 지운다. build 가 없으면 404, 적재된 content map 이 없으면 409.
 *
 * [carryOver] 가 false 면 앞 버전의 사용자 생성 TC 를 이어 넣지 않는다(`?carryOver=false`). 서버 기본값은 이어
 * 넣기라 true 일 때는 싣지 않는다. [overwrite] 면 이미 TC 를 만든 빌드의 지도 TC 를 덮어쓴다(ARTEL-1041) — 화면이
 * 경고를 보인 뒤에만 보낸다.
 *
 * [verdicts] 는 생성 뒤 앞 버전 판정을 어떻게 할지다(ARTEL-1180). `SAME_CONTENT` 는 내용이 같은 케이스가 판정을 이어받고,
 * `NONE` 은 이 버전에 남은 판정까지 다시 검증으로 돌린다. 주지 않으면 서버의 지금 규칙 그대로다 — 새로 생긴 케이스는
 * 다시 검증이고, 덮어쓸 때 지도에 그대로 있는 케이스는 판정이 남는다.
 */
export async function generateContentMapTestCases(
  projectId: string,
  buildId: string,
  carryOver = true,
  overwrite = false,
  verdicts?: 'SAME_CONTENT' | 'NONE',
): Promise<GeneratedTestCases> {
  const params = [
    ...(carryOver ? [] : ['carryOver=false']),
    ...(overwrite ? ['overwrite=true'] : []),
    ...(verdicts === undefined ? [] : [`verdicts=${verdicts}`]),
  ]
  const query = params.length === 0 ? '' : `?${params.join('&')}`
  const response = await apiFetch(contentMapPath(projectId, buildId, '/test-cases') + query, {
    method: 'POST',
  })
  if (!response.ok) throw await toApiError(response)
  return parseGeneratedTestCases(await readJson(response))
}
