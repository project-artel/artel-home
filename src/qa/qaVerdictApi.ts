import { apiFetch } from '../auth/authApi'
import { asRecord, asString, readJson } from '../projects/projectApi'
import { readVerdictDetail, type QaVerdictDetail } from './qaVerdictEvidence'

/**
 * 런 하나의 스텝 판정과 근거(ARTEL-1135). `GET /api/qa-runs/{qaRunId}/verdicts` (ARTEL-1134).
 *
 * 근거는 agent 가 판정마다 보낸 것 그대로다: 판정 한 줄, 왜, 기대 항목마다 무엇을 보았고 그 근거가 판독 기록과
 * 맞았는지. 근거 칸이 생기기 전의 판정은 판정 한 줄만 있는 `none` 이다.
 */
export type QaVerdictCapture = { captureId: string; url: string; expiresAt: string }

export type QaStepVerdict = {
  logId: string
  step: number
  stepTitle: string | null
  caseId: string | null
  isVerification: boolean
  passed: boolean
  detail: QaVerdictDetail
  captures: QaVerdictCapture[]
  judgedAt: string | null
}

export type QaTryVerdicts = {
  qaTryId: string
  testScenarioId: string
  scenarioTitle: string
  status: string
  verdicts: QaStepVerdict[]
}

export type QaRunVerdicts = { qaRunId: string; tries: QaTryVerdicts[] }

function readCapture(value: unknown): QaVerdictCapture | null {
  const record = asRecord(value)
  const url = asString(record?.url)
  if (record === null || url.length === 0) return null
  return { captureId: asString(record.captureId), url, expiresAt: asString(record.expiresAt) }
}

function readVerdict(value: unknown): QaStepVerdict | null {
  const record = asRecord(value)
  if (record === null || typeof record.step !== 'number') return null
  const captures = Array.isArray(record.captures) ? record.captures.map(readCapture) : []
  const caseId = asString(record.caseId)
  const stepTitle = asString(record.stepTitle)
  return {
    logId: asString(record.logId),
    step: record.step,
    stepTitle: stepTitle.length > 0 ? stepTitle : null,
    caseId: caseId.length > 0 ? caseId : null,
    isVerification: record.isVerification === true,
    passed: record.passed === true,
    detail: readVerdictDetail(record),
    captures: captures.filter((capture): capture is QaVerdictCapture => capture !== null),
    judgedAt: asString(record.judgedAt) || null,
  }
}

export function parseQaRunVerdicts(value: unknown): QaRunVerdicts {
  const record = asRecord(value)
  const tries = Array.isArray(record?.tries) ? record.tries : []
  return {
    qaRunId: asString(record?.qaRunId),
    tries: tries.flatMap((entry) => {
      const item = asRecord(entry)
      if (item === null) return []
      const verdicts = Array.isArray(item.verdicts) ? item.verdicts.map(readVerdict) : []
      return [{
        qaTryId: asString(item.qaTryId),
        testScenarioId: asString(item.testScenarioId),
        scenarioTitle: asString(item.scenarioTitle),
        status: asString(item.status),
        verdicts: verdicts.filter((verdict): verdict is QaStepVerdict => verdict !== null),
      }]
    }),
  }
}

/** 보이지 않는 런은 404 → null. */
export async function getQaRunVerdicts(qaRunId: string, signal?: AbortSignal): Promise<QaRunVerdicts | null> {
  const response = await apiFetch(`/api/qa-runs/${encodeURIComponent(qaRunId)}/verdicts`, { signal })
  if (response.status === 404) return null
  return parseQaRunVerdicts(await readJson(response))
}

export type QaEvidenceTally = { judged: number; passed: number; failed: number; verified: number; uncertain: number; none: number }

/** 검증 판정만 센다. 행동 스텝의 판정은 "그 행동을 했다" 라서 근거를 묻지 않는다. */
export function tallyVerdicts(verdicts: QaStepVerdict[]): QaEvidenceTally {
  const judged = verdicts.filter((verdict) => verdict.isVerification)
  return {
    judged: judged.length,
    passed: judged.filter((verdict) => verdict.passed).length,
    failed: judged.filter((verdict) => !verdict.passed).length,
    verified: judged.filter((verdict) => verdict.detail.status === 'verified').length,
    uncertain: judged.filter((verdict) => verdict.detail.status === 'uncertain').length,
    none: judged.filter((verdict) => verdict.detail.status === 'none').length,
  }
}
