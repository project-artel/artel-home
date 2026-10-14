import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, readJson, toApiError } from '../projects/projectApi'

/*
 * 케이스 라이브러리의 "지도에서 TC 생성" 모달이 고를 게임 빌드(ARTEL-1041).
 *
 * 서버가 빌드마다 지도 상태와 이미 TC 를 만들었는지를 준다(ARTEL-1040). editor build 는 오지 않는다. 줄마다 고르면
 * 무슨 일이 생기는지는 여기 순수 함수로 정해, 모달이 고르기 전에 그 결과를 보인다.
 */

export type MapState = 'NO_MAP' | 'NOT_READ' | 'READY'

export type GenerationCandidate = {
  gameBuildId: string
  version: string
  label: string | null
  createdAt: string
  mapState: MapState
  /** 이미 이 빌드에서 지도로 TC 를 만들었다. */
  generated: boolean
}

/** 이 줄을 고르면 생기는 일. `create` 만 고를 수 있다. */
export type CandidateOutcome = 'create' | 'alreadyGenerated' | 'notRead' | 'noMap'

export function candidateOutcome(candidate: GenerationCandidate): CandidateOutcome {
  if (candidate.generated) return 'alreadyGenerated'
  if (candidate.mapState === 'NO_MAP') return 'noMap'
  if (candidate.mapState === 'NOT_READ') return 'notRead'
  return 'create'
}

const MAP_STATES: readonly MapState[] = ['NO_MAP', 'NOT_READ', 'READY']

export function parseGenerationCandidates(data: unknown): GenerationCandidate[] {
  const items = asRecord(data)?.items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    const record = asRecord(item)
    const gameBuildId = record === null ? '' : asString(record.gameBuildId)
    if (record === null || gameBuildId.length === 0) return []
    const mapState = MAP_STATES.find((state) => state === record.mapState) ?? 'NO_MAP'
    return [
      {
        gameBuildId,
        version: asString(record.version),
        label: asNullableString(record.label),
        createdAt: asString(record.createdAt),
        mapState,
        generated: record.generated === true,
      },
    ]
  })
}

/** 고를 수 있는 첫 줄. 모달이 처음 골라 둔다. 없으면 null. */
export function firstCreatable(candidates: readonly GenerationCandidate[]): string | null {
  return candidates.find((candidate) => candidateOutcome(candidate) === 'create')?.gameBuildId ?? null
}

export async function listGenerationCandidates(projectId: string, signal?: AbortSignal): Promise<GenerationCandidate[]> {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/test-case-versions/generation-candidates`,
    { signal },
  )
  if (!response.ok) throw await toApiError(response)
  return parseGenerationCandidates(await readJson(response))
}
