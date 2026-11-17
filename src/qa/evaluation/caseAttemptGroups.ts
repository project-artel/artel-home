import type { Attempt } from './evaluationApi'
import { compareDecimalIds } from '../qaApi'
import type { QaTryVerdicts } from '../qaVerdictApi'

export type CaseAttemptScenario = Pick<QaTryVerdicts, 'executionMode' | 'steps'>

/** 직접 링크로 앞에 추가된 오래된 시도와 무관하게 TC·시도 순서를 정한다. */
export function groupCaseAttempts(
  options: readonly Attempt[],
  numbers?: ReadonlyMap<string, string>,
  scenario?: CaseAttemptScenario,
): [string, Attempt[]][] {
  const grouped = new Map<string, Attempt[]>()
  for (const row of options) {
    const group = grouped.get(row.testCaseId) ?? []
    group.push(row)
    grouped.set(row.testCaseId, group)
  }
  for (const group of grouped.values()) group.sort((a, b) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id, 'en', { numeric: true }))

  const order = new Set<string>()
  if (scenario?.executionMode === 'FREE') {
    const reported = options.filter((row): row is Attempt & { logId: string } => row.logId !== null)
    reported.sort((a, b) => compareDecimalIds(a.logId, b.logId))
    for (const row of reported) order.add(row.testCaseId)
  }
  for (const step of scenario?.steps ?? []) {
    if (step.caseId !== null) order.add(step.caseId)
  }
  const ranks = new Map([...order].map((caseId, index) => [caseId, index]))
  return [...grouped].sort(([a], [b]) => {
    const rankDifference = (ranks.get(a) ?? ranks.size) - (ranks.get(b) ?? ranks.size)
    if (rankDifference !== 0) return rankDifference
    const left = numbers?.get(a), right = numbers?.get(b)
    if (left !== undefined && right !== undefined) return left.localeCompare(right, 'en', { numeric: true })
    if (left !== undefined) return -1
    if (right !== undefined) return 1
    return a.localeCompare(b, 'en', { numeric: true })
  })
}
