import { apiFetch } from '../../auth/authApi'
import { asRecord, readJson, toApiError } from '../../projects/projectApi'
import { AUTHORING_STAGES, type AuthoringStage } from '../runChatApi'

/** 런이 Artel Bot 에게 잠겨 있나(ARTEL-1265). [mine] 은 내가 보낸 요청인가. */
export type RunLock =
  | { locked: false }
  | { locked: true; requestedBy: string; requestedByName: string; mine: boolean; startedAt: number; stage: AuthoringStage | null }

export const UNLOCKED: RunLock = { locked: false }

export async function getRunLock(projectId: string, runId: string, signal?: AbortSignal): Promise<RunLock> {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/authoring-lock`,
    { signal },
  )
  if (!response.ok) throw await toApiError(response)
  return parseRunLock(await readJson(response))
}

export function parseRunLock(data: unknown): RunLock {
  const record = asRecord(data)
  if (record === null || record.locked !== true) return UNLOCKED
  const started = typeof record.startedAt === 'string' ? Date.parse(record.startedAt) : NaN
  const stage = AUTHORING_STAGES.find((one) => one === record.stage) ?? null
  return {
    locked: true,
    requestedBy: typeof record.requestedBy === 'string' ? record.requestedBy : '',
    requestedByName: typeof record.requestedByName === 'string' ? record.requestedByName : '',
    mine: record.mine === true,
    startedAt: Number.isFinite(started) ? started : Date.now(),
    stage,
  }
}

/** 서버가 "Artel Bot 이 고치는 중" 으로 거절했나(423 `run_locked`). */
export function isRunLocked(error: unknown): boolean {
  const record = asRecord(error)
  return record !== null && record.status === 423
}
