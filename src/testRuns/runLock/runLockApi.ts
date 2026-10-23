import { apiFetch } from '../../auth/authApi'
import { asRecord, readJson, toApiError } from '../../projects/projectApi'
import { AUTHORING_STAGES, type AuthoringStage } from '../runChatApi'

/** Artel Bot 이 고치는 중이라 잠긴 시나리오 하나(ARTEL-1265). [mine] 은 내가 보낸 요청인가. */
export type ScenarioLock = {
  scenarioId: string
  requestedBy: string
  requestedByName: string
  mine: boolean
  startedAt: number
  stage: AuthoringStage | null
  /** AI 가 아직 고칠 것을 고르는 중이라 함께 잠긴 것. 고르면 고른 것만 남는다. */
  choosing: boolean
}

/** 런에서 잠긴 시나리오들. AI 가 고친 시나리오만 잠긴다 — 런 전체가 아니다. */
export async function getRunLocks(projectId: string, runId: string, signal?: AbortSignal): Promise<ScenarioLock[]> {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/authoring-lock`,
    { signal },
  )
  if (!response.ok) throw await toApiError(response)
  return parseRunLocks(await readJson(response))
}

export function parseRunLocks(data: unknown): ScenarioLock[] {
  const record = asRecord(data)
  const raw = Array.isArray(record?.scenarios) ? record.scenarios : []
  return raw.flatMap((item): ScenarioLock[] => {
    const lock = asRecord(item)
    const scenarioId = typeof lock?.scenarioId === 'string' ? lock.scenarioId : null
    if (lock === null || scenarioId === null) return []
    const started = typeof lock.startedAt === 'string' ? Date.parse(lock.startedAt) : NaN
    return [{
      scenarioId,
      requestedBy: typeof lock.requestedBy === 'string' ? lock.requestedBy : '',
      requestedByName: typeof lock.requestedByName === 'string' ? lock.requestedByName : '',
      mine: lock.mine === true,
      startedAt: Number.isFinite(started) ? started : Date.now(),
      stage: AUTHORING_STAGES.find((one) => one === lock.stage) ?? null,
      choosing: lock.choosing === true,
    }]
  })
}

/** 서버가 "Artel Bot 이 이 시나리오를 고치는 중" 으로 거절했나(423). */
export function isRunLocked(error: unknown): boolean {
  const record = asRecord(error)
  return record !== null && record.status === 423
}
