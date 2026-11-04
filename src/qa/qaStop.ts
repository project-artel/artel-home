import { asRecord } from '../projects/projectApi'
import { QA_STOP_NOT_STARTED, type QaLog, type QaRun, type QaStop } from './qaTypes'

/**
 * 모델 API 오류로 멈춘 QA(ARTEL-1372). agent 가 런을 멈출 때 보내는 오류 코드다(ARTEL-1370). 그 밖의 `ERROR` 는
 * 지금처럼 Raw 탭에만 남는다.
 */
export const QA_STOP_CODES = ['llm_credit_exhausted', 'llm_auth_failed', 'llm_model_unavailable'] as const

export type QaStopCode = (typeof QA_STOP_CODES)[number]

export function isQaStopCode(code: string): code is QaStopCode {
  return (QA_STOP_CODES as readonly string[]).includes(code)
}

/** 흐름 탭 끝에 붙는 줄 하나. 오류로 멈춘 시나리오는 `error`, 그 때문에 돌지 않은 시나리오는 `notStarted`. */
export type QaStopLine =
  | { kind: 'error'; id: string; code: string }
  | { kind: 'notStarted'; id: string; cause: string | null }

/**
 * 한 시나리오의 로그에서 멈춤 줄을 고른다. 오류 프레임은 agent 가 보낸 `ERROR`(code 가 [QA_STOP_CODES]),
 * 실행 안 함은 orchestration 이 남긴 `STATUS`(`status=UNDECIDED`, `stop.code=not_started`)다.
 */
export function stopLinesOf(logs: readonly QaLog[]): QaStopLine[] {
  const lines: QaStopLine[] = []
  for (const log of logs) {
    const payload = asRecord(log.payload)
    if (payload === null) continue
    if (log.type === 'ERROR' && typeof payload.code === 'string' && isQaStopCode(payload.code)) {
      lines.push({ kind: 'error', id: log.id, code: payload.code })
      continue
    }
    const stop = asRecord(payload.stop)
    if (log.type === 'STATUS' && payload.status === 'UNDECIDED' && stop?.code === QA_STOP_NOT_STARTED) {
      lines.push({ kind: 'notStarted', id: log.id, cause: typeof stop.cause === 'string' ? stop.cause : null })
    }
  }
  return lines
}

/**
 * 오류 창이 보일 까닭. 화면은 코드로만 말한다 — 제공사 이름과 제공사가 보낸 원문은 보이지 않는다(원문에 회사
 * 이름이 들어 있다). 둘은 Raw 탭의 오류 프레임에 남는다.
 */
export type QaStopNotice = { code: string }

/** 런을 멈춘 까닭을 고른다. 오류 프레임이 SSE 로 먼저 오고 런 조회는 다음 폴링에 오므로, 먼저 온 것을 쓴다. */
export function stopNoticeOf(run: QaRun | null, live: QaStopNotice | null): QaStopNotice | null {
  const fromRun: QaStop | null = run?.stop ?? null
  if (fromRun !== null && isQaStopCode(fromRun.code)) return { code: fromRun.code }
  return live
}

/** 런에서 돌지 않은 시나리오 수. 헤더와 흐름 탭이 "N개 실행 안 함" 으로 쓴다. */
export function notStartedCount(run: QaRun): number {
  return run.tries.filter((entry) => entry.stop?.code === QA_STOP_NOT_STARTED).length
}
