import { formatTestCaseId } from '../../testCases/testCaseId'
import type { ContentReview } from './evaluationApi'

export function contentReviewVideoPath(projectId: string, row: ContentReview): string | null {
  if (!row.attemptId) return null
  const params = new URLSearchParams({ attempt: row.attemptId })
  if (row.qaTryId) params.set('scenario', row.qaTryId)
  return row.qaRunId ? `/projects/${encodeURIComponent(projectId)}/qa-history/${encodeURIComponent(row.qaRunId)}?${params}`
    : `/projects/${encodeURIComponent(projectId)}/test-cases?${new URLSearchParams({ case: row.testCaseId, attempt: row.attemptId })}`
}

export function revalidationRunName(testCaseId: string, numbers: ReadonlyMap<string, string>, label: string): string | null {
  const number = numbers.get(testCaseId)
  return number === undefined ? null : `${formatTestCaseId(number)} · ${label}`
}
