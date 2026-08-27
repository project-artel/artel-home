export const QA_TRY_STATUSES = [
  // PENDING: a run-unit scenario waiting its turn (qa_run executes scenarios in
  // order; the ones not yet started sit PENDING). Not terminal.
  'PENDING',
  'STARTING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const

export type QaTryStatus = (typeof QA_TRY_STATUSES)[number]

export const QA_LOG_TYPES = [
  'LOG',
  // 에이전트가 부른 tool 하나와 그 답. `ACTION` 과 다르다 — 저쪽은 조작 tool 이 SDK 로
  // 내보낸 요청이라 tool 28개 중 15개만 남기고, 지식 검색이나 스텝 판정처럼 SDK 를
  // 거치지 않는 tool 은 흔적이 없었다.
  'TOOL',
  'TOOL_RESULT',
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
 * A QA_Run (TR 단위 실행): the run's scenarios run in order, each as its own
 * `QaTry`. `status` is the run's own lifecycle; `tries` is one entry per scenario.
 */
export type QaRun = {
  id: string
  testRunId: string
  gameInstanceId: string
  status: QaTryStatus
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
