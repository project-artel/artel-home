import { compareDecimalIds } from './qaApi'
import type { QaLog } from './qaTypes'

/** 판정 조회와 SSE의 중복을 제거하고, 도착 순서 대신 DB id 순서로 최신 판정을 결정한다. */
export function mergeQaVerdicts(current: QaLog[], incoming: QaLog[]): QaLog[] {
  const verdicts = incoming.filter((log) => log.type === 'STATUS' || log.type === 'CASE_VERDICT')
  if (verdicts.length === 0) return current
  const byId = new Map(current.map((log) => [log.id, log]))
  for (const log of verdicts) byId.set(log.id, log)
  return [...byId.values()].sort((left, right) => compareDecimalIds(left.id, right.id))
}
