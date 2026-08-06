export const QA_TRY_STATUSES = [
  // 런 안에서 아직 자기 차례를 기다리는 시나리오. 런 단위 실행에서만 나타난다(ARTEL-259):
  // 하나의 세션이 시나리오를 순차 실행하고, 대기 중인 시나리오의 try는 PENDING으로 적재된다.
  'PENDING',
  'STARTING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const

export type QaTryStatus = (typeof QA_TRY_STATUSES)[number]

/** 런(TR) 실행 자체의 상태. PENDING은 없다 — 그건 런 안 시나리오(try)에만 있다. */
export const QA_RUN_STATUSES = [
  'STARTING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const

export type QaRunStatus = (typeof QA_RUN_STATUSES)[number]

export const QA_LOG_TYPES = [
  'LOG',
  'ACTION',
  'ACTION_RESULT',
  'GAME_STATE',
  'STATUS',
  'ERROR',
  'CHAT',
] as const

export type QaLogType = (typeof QA_LOG_TYPES)[number]

export const QA_LOG_DIRECTIONS = [
  'AGENT_TO_ORCHE',
  'ORCHE_TO_AGENT',
  'ORCHE_TO_SDK',
  'SDK_TO_ORCHE',
  'ORCHE_INTERNAL',
  'USER_TO_ORCHE',
] as const

export type QaLogDirection = (typeof QA_LOG_DIRECTIONS)[number]

export type QaTry = {
  id: string
  testScenarioId: string
  gameInstanceId: string
  agentSessionId: string | null
  status: QaTryStatus
  startedAt: string | null
  completedAt: string | null
}

/**
 * 런(TR) 단위 QA 실행 한 건 + 그 아래 시나리오별 try(ARTEL-259). 한 세션이 [tries]를
 * 순서대로 실행하며 사이에 게임을 초기화한다. 시나리오별 상세·로그·이슈는 여전히 각
 * try(`/qa-tries/:id`) 기준이고, 이 타입은 그 위의 개요다.
 */
export type QaRun = {
  id: string
  testRunId: string
  gameInstanceId: string
  startedBy: string
  status: QaRunStatus
  startedAt: string | null
  completedAt: string | null
  tries: QaTry[]
}

export type QaReasoningCapability =
  | {
      kind: 'effort'
      efforts: string[]
      minTokens: null
      maxTokens: null
      step: null
    }
  | {
      kind: 'max_tokens'
      efforts: null
      minTokens: number
      maxTokens: number
      step: number
    }

export type QaModel = {
  id: string
  label: string
  provider: string
  supportsVision: boolean
  inputModalities: string[]
  multimodal: boolean
  reasoning: QaReasoningCapability | null
}

export type QaReasoningSelection =
  | { effort: string }
  | { maxTokens: number }

export type QaLog = {
  id: string
  qaTryId: string
  messageId: string | null
  correlationId: string | null
  direction: QaLogDirection
  type: QaLogType
  message: string
  payload: unknown
  createdAt: string
}

export type QaLogPage = {
  items: QaLog[]
  nextBeforeId: string | null
  hasMore: boolean
}

export type QaStreamState = 'connecting' | 'live' | 'degraded' | 'offline' | 'closed'

export function isTerminalQaStatus(status: QaTryStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED'
}

export function isTerminalQaRunStatus(status: QaRunStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED'
}
