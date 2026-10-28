import { asRecord, asString } from '../projects/projectApi'
import type { ScenarioStep } from '../testScenarios/scenarioTypes'
import { usedCheatsOf, type UsedCheat } from './qaFunctionTimeline'
import type { QaLog } from './qaTypes'

export type QaCaseReport = {
  source: 'case_report' | 'saved_verdict'
  state: 'passed' | 'failed' | 'inconclusive'
  passed: boolean | null
  message: string
  logId: string
  usedCheats: UsedCheat[]
}

function caseIdOf(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return null
  const id = BigInt(value)
  return id > 0 ? String(id) : null
}

/** 신규 TC report가 있는 케이스는 저장 상태의 legacy 이벤트로 덮지 않는다. */
export function deriveQaCaseReports(logs: readonly QaLog[]): Map<string, QaCaseReport> {
  const reports = new Map<string, QaCaseReport>()
  const legacy = new Map<string, QaCaseReport>()
  for (const log of logs) {
    if (log.type !== 'STATUS' && log.type !== 'CASE_VERDICT') continue
    const payload = asRecord(log.payload)
    const caseId = caseIdOf(payload?.case_id)
    if (payload === null || caseId === null) continue
    // 참고 step의 부분 판정과 실행 전체의 terminal 결과는 TC 완료가 아니다.
    if (log.type === 'STATUS' && (payload.step != null || payload.result != null)) continue
    const outcome = log.type === 'CASE_VERDICT' ? payload.verification_status : payload.case_outcome ?? payload.status
    const state = (log.type === 'CASE_VERDICT' ? outcome === 'VERIFIED' : outcome === 'PASSED' || outcome === 'COMPLETED')
      ? 'passed' : outcome === 'FAILED' ? 'failed' : log.type === 'STATUS' && outcome === 'INCONCLUSIVE' ? 'inconclusive' : null
    if (state === null) continue
    const report: QaCaseReport = {
      source: log.type === 'STATUS' ? 'case_report' : 'saved_verdict',
      state, passed: state === 'inconclusive' ? null : state === 'passed',
      message: asString(payload.message, log.message), logId: log.id, usedCheats: usedCheatsOf(payload),
    }
    const target = log.type === 'CASE_VERDICT' ? legacy : reports
    target.set(caseId, report)
  }
  return new Map([...legacy, ...reports])
}

/** 같은 TC의 참고 step이 여러 개여도 TC 한 번으로 집계한다. */
export function summarizeQaCases(scenarioSteps: readonly ScenarioStep[], reports: ReadonlyMap<string, QaCaseReport>) {
  const ids = new Set(scenarioSteps.map((step) => caseIdOf(step.case_id)).filter((id): id is string => id !== null))
  let reported = 0
  let passed = 0
  let failed = 0
  let inconclusive = 0
  for (const id of ids) {
    const report = reports.get(id)
    if (report === undefined) continue
    reported += 1
    if (report.state === 'passed') passed += 1
    else if (report.state === 'failed') failed += 1
    else inconclusive += 1
  }
  return { total: ids.size, reported, passed, failed, inconclusive }
}
