export const QA_TRY_STATUSES = [
  'STARTING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const

export type QaTryStatus = (typeof QA_TRY_STATUSES)[number]

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
