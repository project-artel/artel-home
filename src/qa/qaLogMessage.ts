import { asRecord } from '../projects/projectApi'
import { formatTestCaseId } from '../testCases/testCaseId'
import type { QaLog } from './qaTypes'

/** 저장된 내부 ID 대신 프로젝트 표시 번호로 판정 본문을 그린다. */
export function qaLogMessage(log: QaLog, caseLabel: (caseId: string) => string): string {
  if (log.type !== 'CASE_VERDICT') return log.message
  const payload = asRecord(log.payload)
  const status = payload?.verification_status
  if (typeof status !== 'string' || status.length === 0) return log.message
  const id = payload?.case_id
  const caseId = typeof id === 'string' && /^[1-9]\d*$/.test(id)
    ? id
    : typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? String(id) : null
  let label = caseId === null ? 'TC-…' : caseLabel(caseId)
  const number = payload?.case_number
  if (label === 'TC-…' && typeof number === 'string' && /^[1-9]\d*$/.test(number)) {
    label = formatTestCaseId(number)
  }
  return `${label} → ${status}`
}
