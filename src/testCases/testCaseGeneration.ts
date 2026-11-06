import { apiFetch, orchestrationUrlFor } from '../auth/authApi'
import { contentMapPath } from '../contentMap/contentMapApi'
import { asNullableString, asRecord, isOneOf, toApiError } from '../projects/projectApi'

/**
 * 빌드의 마지막 지도 TC 생성(ARTEL-1188). 서버가 화면 지도 SSE(`snapshot` · `testCaseGeneration`)로 흘린다.
 *
 * 메모리에만 있는 값이라 서버가 다시 뜨면 null 이다. 만든 TC 는 그대로 남는다.
 */
export const GENERATION_STATES = ['RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const
export const GENERATION_PHASES = ['READING_MAP', 'DRAFTING', 'WRITING', 'CARRYING_OVER'] as const

export type GenerationPhase = (typeof GENERATION_PHASES)[number]

export type TestCaseGeneration = {
  state: (typeof GENERATION_STATES)[number]
  phase: GenerationPhase
  /** 지금 단계의 몇 개째. 분모가 없는 단계면 null. */
  done: number | null
  /** DRAFTING 이면 기능 행 수, WRITING 이면 케이스 수. */
  total: number | null
  startedAt: string
  finishedAt: string | null
  /** FAILED 일 때 사람에게 보일 사유. */
  error: string | null
}

/** 서버가 돌려주는 code. 화면은 이것으로 "이미 도는 중" · "취소함" 을 오류와 가른다. */
export const GENERATION_IN_PROGRESS = 'TEST_CASE_GENERATION_IN_PROGRESS'
export const GENERATION_CANCELLED = 'TEST_CASE_GENERATION_CANCELLED'

function asOptionalCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

export function parseTestCaseGeneration(data: unknown): TestCaseGeneration | null {
  const record = asRecord(data)
  if (record === null || !isOneOf(record.state, GENERATION_STATES) || !isOneOf(record.phase, GENERATION_PHASES)) return null
  const startedAt = asNullableString(record.startedAt)
  if (startedAt === null) return null
  const total = asOptionalCount(record.total)
  const done = asOptionalCount(record.done)
  return {
    state: record.state,
    phase: record.phase,
    total: total !== null && total > 0 ? total : null,
    done: total !== null && total > 0 && done !== null ? Math.min(done, total) : null,
    startedAt,
    finishedAt: asNullableString(record.finishedAt),
    error: asNullableString(record.error),
  }
}

/**
 * 단계마다 도넛에서 차지하는 몫(%). 앞 끝은 그 단계에 들어서는 순간의 값이다. 큰 지도에서 시간 대부분이 케이스 짓기와
 * 저장에 들어 둘의 몫이 크다. 100 은 서버가 끝났다고 한 뒤에만 그린다.
 */
const BANDS: Record<GenerationPhase, readonly [number, number]> = {
  READING_MAP: [0, 5],
  DRAFTING: [5, 75],
  WRITING: [75, 97],
  CARRYING_OVER: [97, 99],
}

/** 생성 하나의 진행 %. 깨졌거나 취소했으면 null 이다. */
export function generationPercent(generation: TestCaseGeneration): number | null {
  if (generation.state === 'SUCCEEDED') return 100
  if (generation.state !== 'RUNNING') return null
  const [start, end] = BANDS[generation.phase]
  if (generation.done === null || generation.total === null) return start
  return Math.floor(start + ((end - start) * generation.done) / generation.total)
}

/** `DELETE .../content-map/test-cases/generation` — 도는 생성을 끊는다. 한 트랜잭션이라 아무것도 바뀌지 않는다. */
export async function cancelTestCaseGeneration(projectId: string, buildId: string): Promise<void> {
  const response = await apiFetch(contentMapPath(projectId, buildId, '/test-cases/generation'), { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}

/** 생성 창이 그 빌드의 진행만 받으려고 붙는 SSE 주소. 화면 지도와 같은 스트림이다. */
export function generationEventsUrl(projectId: string, buildId: string): string {
  return orchestrationUrlFor(contentMapPath(projectId, buildId, '/events'))
}
