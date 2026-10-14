import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, readJson, toApiError } from '../projects/projectApi'
import { arrangeVersions, hiddenVersions, type TestCaseVersionSummary, type VersionGroup } from './testCaseVersions'

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
  /** 이미 이 빌드에서 지도로 TC 를 만들었다. 다시 만들면 덮어쓴다. */
  generated: boolean
  /** 이 빌드의 지도 TC 수. 덮어쓰기 경고에 쓴다. */
  mapCases: number
  /** 그중 판정(통과 · 실패 · 재검증 필요)이 난 수. */
  judged: number
}

/**
 * 이 줄을 고르면 생기는 일. `create` 와 `overwrite` 만 고를 수 있다. 이미 만든 빌드라도 지도가 읽혀 있어야 덮어쓸 수
 * 있다 — 아니면 `alreadyGenerated` 로 막는다.
 */
export type CandidateOutcome = 'create' | 'overwrite' | 'alreadyGenerated' | 'notRead' | 'noMap'

export function candidateOutcome(candidate: GenerationCandidate): CandidateOutcome {
  if (candidate.generated) return candidate.mapState === 'READY' ? 'overwrite' : 'alreadyGenerated'
  if (candidate.mapState === 'NO_MAP') return 'noMap'
  if (candidate.mapState === 'NOT_READ') return 'notRead'
  return 'create'
}

export function isSelectable(candidate: GenerationCandidate): boolean {
  const outcome = candidateOutcome(candidate)
  return outcome === 'create' || outcome === 'overwrite'
}

export type CandidateEntry =
  | { kind: 'group'; group: VersionGroup; candidates: GenerationCandidate[] }
  | { kind: 'candidate'; candidate: GenerationCandidate }

/**
 * 후보를 라이브러리 왼쪽 목록과 같은 트리로 늘어놓는다 — 묶음 아래 버전, 묶음 없는 버전, 따로 숨긴 버전. 버전이
 * 많아지면 평평한 목록으로는 `1.X` 와 `2.X` 를 가를 수 없다. 라이브러리 목록에 없는 빌드(목록을 읽은 뒤 새로 등록된
 * 빌드)는 묶음 없이 맨 위에 둔다.
 */
export function arrangeCandidates(
  candidates: readonly GenerationCandidate[],
  versions: readonly TestCaseVersionSummary[],
  groups: readonly VersionGroup[],
): { entries: CandidateEntry[]; hidden: GenerationCandidate[] } {
  const byId = new Map(candidates.map((candidate) => [candidate.gameBuildId, candidate]))
  const known = new Set(versions.map((version) => version.gameBuildId))
  const pick = (list: readonly TestCaseVersionSummary[]) =>
    list.flatMap((version) => {
      const candidate = byId.get(version.gameBuildId)
      return candidate === undefined ? [] : [candidate]
    })
  const unknown: CandidateEntry[] = candidates
    .filter((candidate) => !known.has(candidate.gameBuildId))
    .map((candidate) => ({ kind: 'candidate', candidate }))
  const arranged = arrangeVersions(versions, groups).flatMap((entry): CandidateEntry[] => {
    if (entry.kind === 'group') return [{ kind: 'group', group: entry.group, candidates: pick(entry.versions) }]
    const candidate = byId.get(entry.version.gameBuildId)
    return candidate === undefined ? [] : [{ kind: 'candidate', candidate }]
  })
  return { entries: [...unknown, ...arranged], hidden: pick(hiddenVersions(versions)) }
}

const MAP_STATES: readonly MapState[] = ['NO_MAP', 'NOT_READ', 'READY']

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

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
        mapCases: asCount(record.mapCases),
        judged: asCount(record.judged),
      },
    ]
  })
}

/** 새로 만들 수 있는 첫 줄. 모달이 처음 골라 둔다 — 덮어쓰기는 처음부터 골라 두지 않는다. 없으면 null. */
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
