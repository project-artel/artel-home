import { apiFetch } from '../auth/authApi'
import { asRecord, asString, readJson, toApiError } from '../projects/projectApi'
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

/**
 * 판정을 코드로 다시 본 결과(ARTEL-1253, 서버 ARTEL-1252). TC 효과를 판정 시점의 게임 상태 기록과 맞춘다.
 * 판정을 바꾸지 않는다 — 사람이 다시 볼 판정을 고르는 등급이다.
 */
export type CodeCheckResult = 'PASS' | 'FAIL' | 'WEAK_PASS' | 'WEAK_FAIL' | 'UNKNOWN'

export type QaCodeCheckItem = {
  kind: string
  target: string
  expected: string | null
  /** 기록에서 읽은 값. 확인하지 못했으면 null. */
  observed: string | null
  result: CodeCheckResult
  /** 확인하지 못한 까닭. */
  note: string | null
}

export type QaCodeCheck = { result: CodeCheckResult; items: QaCodeCheckItem[] }

/** 사람이 정한 판정(ARTEL-1255). 있으면 화면은 이 결정을 그 스텝의 판정으로 보인다. */
export type QaHumanDecision = {
  passed: boolean
  note: string | null
  decidedBy: string | null
  decidedAt: string | null
  /** 코드 검사가 추가 검토로 골랐던 판정인가. */
  flagged: boolean
}

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
  /** 검증 판정에만 있다. */
  codeCheck: QaCodeCheck | null
  /** 사람이 추가로 검토할 판정인가. 사람이 정하면 false 다. */
  needsReview: boolean
  humanDecision: QaHumanDecision | null
}

export type QaScenarioStepView = { step: number; title: string; caseId: string | null; expected: string | null }

export type QaStepIssue = { issueId: string; title: string; severity: string; step: number | null }

export type QaTryVerdicts = {
  qaTryId: string
  testScenarioId: string
  scenarioTitle: string
  reportingUnit?: 'STEP' | 'TEST_CASE'
  executionMode: 'ORDERED' | 'FREE'
  status: string
  model: string | null
  startedAt: string | null
  completedAt: string | null
  steps: QaScenarioStepView[]
  verdicts: QaStepVerdict[]
  issues: QaStepIssue[]
  /** 아직 사람이 정하지 않은 추가 검토 판정 수. */
  reviewCount: number
  /** 추가 검토로 골랐다가 사람이 정한 판정 수. */
  reviewedCount: number
}

export type QaRunVerdicts = {
  qaRunId: string
  testRunId: string
  testRunName: string
  gameBuildVersion: string | null
  gameBuildIsEditor?: boolean | null
  status: string
  startedAt: string | null
  completedAt: string | null
  tries: QaTryVerdicts[]
}

const ACTION_KINDS = new Set<QaStepAction['kind']>(['key', 'click', 'drag', 'other'])
const CODE_RESULTS = new Set<CodeCheckResult>(['PASS', 'FAIL', 'WEAK_PASS', 'WEAK_FAIL', 'UNKNOWN'])

/** 모르는 값은 확인 못 함으로 읽는다. */
function asCodeResult(value: unknown): CodeCheckResult {
  const text = asString(value) as CodeCheckResult
  return CODE_RESULTS.has(text) ? text : 'UNKNOWN'
}

function readCodeCheckItem(value: unknown): QaCodeCheckItem | null {
  const record = asRecord(value)
  if (record === null) return null
  return {
    kind: asString(record.kind),
    target: asString(record.target),
    expected: orNull(record.expected),
    observed: orNull(record.observed),
    result: asCodeResult(record.result),
    note: orNull(record.note),
  }
}

function readCodeCheck(value: unknown): QaCodeCheck | null {
  const record = asRecord(value)
  if (record === null) return null
  return { result: asCodeResult(record.result), items: list(record.items, readCodeCheckItem) }
}

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

function readHumanDecision(value: unknown): QaHumanDecision | null {
  const record = asRecord(value)
  if (record === null || typeof record.passed !== 'boolean') return null
  return {
    passed: record.passed,
    note: orNull(record.note),
    decidedBy: orNull(record.decidedBy),
    decidedAt: orNull(record.decidedAt),
    flagged: record.flagged === true,
  }
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
    codeCheck: readCodeCheck(record.codeCheck),
    needsReview: record.needsReview === true,
    humanDecision: readHumanDecision(record.humanDecision),
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
    reportingUnit: record.reportingUnit === 'TEST_CASE' ? 'TEST_CASE' : 'STEP',
    executionMode: record.executionMode === 'FREE' ? 'FREE' : 'ORDERED',
    status: asString(record.status),
    model: orNull(record.model),
    startedAt: orNull(record.startedAt),
    completedAt: orNull(record.completedAt),
    steps: list(record.steps, readStep),
    verdicts: list(record.verdicts, readVerdict),
    issues: list(record.issues, readIssue),
    reviewCount: typeof record.reviewCount === 'number' ? record.reviewCount : 0,
    reviewedCount: typeof record.reviewedCount === 'number' ? record.reviewedCount : 0,
  }
}

export function parseQaRunVerdicts(value: unknown): QaRunVerdicts {
  const record = asRecord(value)
  return {
    qaRunId: asString(record?.qaRunId),
    testRunId: asString(record?.testRunId),
    testRunName: asString(record?.testRunName),
    gameBuildVersion: orNull(record?.gameBuildVersion),
    gameBuildIsEditor: typeof record?.gameBuildIsEditor === 'boolean' ? record.gameBuildIsEditor : null,
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

/**
 * 사람이 스텝 판정을 통과 · 실패로 정한다(ARTEL-1255). 그 판정의 TC 판정도 따른다. 다시 보내면 덮어쓴다.
 * `PUT /api/qa-runs/{qaRunId}/verdicts/{verdictLogId}/review`
 */
export async function reviewQaVerdict(
  qaRunId: string,
  verdictLogId: string,
  passed: boolean,
  note: string,
): Promise<QaHumanDecision> {
  const response = await apiFetch(
    `/api/qa-runs/${encodeURIComponent(qaRunId)}/verdicts/${encodeURIComponent(verdictLogId)}/review`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: passed ? 'PASSED' : 'FAILED', note: note.trim().length > 0 ? note.trim() : null }),
    },
  )
  if (!response.ok) throw await toApiError(response)
  const decision = readHumanDecision(await readJson(response))
  if (decision === null) throw new Error('review response could not be read')
  return decision
}
