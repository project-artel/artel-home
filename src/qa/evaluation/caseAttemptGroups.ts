import type { Attempt } from './evaluationApi'

/** 직접 링크로 앞에 추가된 오래된 시도와 무관하게 TC·시도 순서를 정한다. */
export function groupCaseAttempts(options: readonly Attempt[], numbers?: ReadonlyMap<string, string>): [string, Attempt[]][] {
  const grouped = new Map<string, Attempt[]>()
  for (const row of options) {
    const group = grouped.get(row.testCaseId) ?? []
    group.push(row)
    grouped.set(row.testCaseId, group)
  }
  for (const group of grouped.values()) group.sort((a, b) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id, 'en', { numeric: true }))
  return [...grouped].sort(([a], [b]) => {
    const left = numbers?.get(a), right = numbers?.get(b)
    if (left !== undefined && right !== undefined) return left.localeCompare(right, 'en', { numeric: true })
    if (left !== undefined) return -1
    if (right !== undefined) return 1
    return a.localeCompare(b, 'en', { numeric: true })
  })
}
