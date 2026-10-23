import { apiFetch } from '../auth/authApi'
import { asRecord, asString, readJson } from '../projects/projectApi'
import { readVerdictDetail, type QaVerdictDetail } from './qaVerdictEvidence'

/**
 * 런 하나의 스텝 판정과 근거(ARTEL-1135). `GET /api/qa-runs/{qaRunId}/verdicts` (ARTEL-1134).
 *
 * 근거는 agent 가 판정마다 보낸 것 그대로다: 판정 한 줄, 왜, 기대 항목마다 무엇을 보았고 그 근거가 판독 기록과
 * 맞았는지. 근거 칸이 생기기 전의 판정은 판정 한 줄(과 판정 도구 호출에 남은 이유)만 있는 `none` 이다.
 * 판정 말고도 화면이 그리는 것 — 출처(TR · 빌드), 시나리오의 모든 스텝과 TC 기대, 스텝마다 한 행동, 이슈 — 를 함께 싣는다.
 */
export type QaVerdictCapture = { captureId: string; url: string; expiresAt: string }

export type QaStepAction = { kind: 'key' | 'click' | 'drag' | 'other'; label: string | null; count: number }

export type QaStepVerdict = {
  logId: string
  step: number
  stepTitle: string | null
  caseId: string | null
  isVerification: boolean
  passed: boolean
  detail: QaVerdictDetail
  captures: QaVerdictCapture[]
  actions: QaStepAction[]
  judgedAt: string | null
}

export type QaScenarioStepView = { step: number; title: string; caseId: string | null; expected: string | null }

export type QaStepIssue = { issueId: string; title: string; severity: string; step: number | null }

export type QaTryVerdicts = {
  qaTryId: string
  testScenarioId: string
  scenarioTitle: string
  executionMode: 'ORDERED' | 'FREE'
  status: string
  model: string | null
  startedAt: string | null
  completedAt: string | null
  steps: QaScenarioStepView[]
  verdicts: QaStepVerdict[]
  issues: QaStepIssue[]
}

export type QaRunVerdicts = {
  qaRunId: string
  testRunId: string
  testRunName: string
  gameBuildVersion: string | null
  status: string
  startedAt: string | null
  completedAt: string | null
  tries: QaTryVerdicts[]
}

const ACTION_KINDS = new Set<QaStepAction['kind']>(['key', 'click', 'drag', 'other'])

function orNull(value: unknown): string | null {
  const text = asString(value)
  return text.length > 0 ? text : null
}

function asStep(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null
}

function list<T>(value: unknown, read: (entry: unknown) => T | null): T[] {
  return Array.isArray(value) ? value.map(read).filter((entry): entry is T => entry !== null) : []
}

function readCapture(value: unknown): QaVerdictCapture | null {
  const record = asRecord(value)
  const url = asString(record?.url)
  if (record === null || url.length === 0) return null
  return { captureId: asString(record.captureId), url, expiresAt: asString(record.expiresAt) }
}

function readAction(value: unknown): QaStepAction | null {
  const record = asRecord(value)
  const kind = asString(record?.kind) as QaStepAction['kind']
  if (record === null || !ACTION_KINDS.has(kind)) return null
  return { kind, label: orNull(record.label), count: typeof record.count === 'number' ? record.count : 1 }
}

function readVerdict(value: unknown): QaStepVerdict | null {
  const record = asRecord(value)
  const step = asStep(record?.step)
  if (record === null || step === null) return null
  return {
    logId: asString(record.logId),
    step,
    stepTitle: orNull(record.stepTitle),
    caseId: orNull(record.caseId),
    isVerification: record.isVerification === true,
    passed: record.passed === true,
    detail: readVerdictDetail(record),
    captures: list(record.captures, readCapture),
    actions: list(record.actions, readAction),
    judgedAt: orNull(record.judgedAt),
  }
}

function readStep(value: unknown): QaScenarioStepView | null {
  const record = asRecord(value)
  const step = asStep(record?.step)
  if (record === null || step === null) return null
  return { step, title: asString(record.title), caseId: orNull(record.caseId), expected: orNull(record.expected) }
}

function readIssue(value: unknown): QaStepIssue | null {
  const record = asRecord(value)
  const issueId = asString(record?.issueId)
  if (record === null || issueId.length === 0) return null
  return { issueId, title: asString(record.title), severity: asString(record.severity), step: asStep(record.step) }
}

function readTry(value: unknown): QaTryVerdicts | null {
  const record = asRecord(value)
  if (record === null) return null
  return {
    qaTryId: asString(record.qaTryId),
    testScenarioId: asString(record.testScenarioId),
    scenarioTitle: asString(record.scenarioTitle),
    executionMode: record.executionMode === 'FREE' ? 'FREE' : 'ORDERED',
    status: asString(record.status),
    model: orNull(record.model),
    startedAt: orNull(record.startedAt),
    completedAt: orNull(record.completedAt),
    steps: list(record.steps, readStep),
    verdicts: list(record.verdicts, readVerdict),
    issues: list(record.issues, readIssue),
  }
}

export function parseQaRunVerdicts(value: unknown): QaRunVerdicts {
  const record = asRecord(value)
  return {
    qaRunId: asString(record?.qaRunId),
    testRunId: asString(record?.testRunId),
    testRunName: asString(record?.testRunName),
    gameBuildVersion: orNull(record?.gameBuildVersion),
    status: asString(record?.status),
    startedAt: orNull(record?.startedAt),
    completedAt: orNull(record?.completedAt),
    tries: list(record?.tries, readTry),
  }
}

/** 보이지 않는 런은 404 → null. */
export async function getQaRunVerdicts(qaRunId: string, signal?: AbortSignal): Promise<QaRunVerdicts | null> {
  const response = await apiFetch(`/api/qa-runs/${encodeURIComponent(qaRunId)}/verdicts`, { signal })
  if (response.status === 404) return null
  return parseQaRunVerdicts(await readJson(response))
}
