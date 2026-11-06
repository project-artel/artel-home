import * as api from './evaluationApi'

/** 첫 페이지 밖의 직접 링크도 목록과 함께 다시 읽어 최종 사람 평가를 유지한다. */
export async function loadAttemptReview(projectId: string, filters: { qaTryId?: string; testCaseId?: string }, selected: string | null, signal?: AbortSignal) {
  const rows = await api.attempts(projectId, filters, signal)
  const linked = selected !== null && !rows.some(row => row.id === selected) ? await api.getAttempt(projectId, selected, signal) : null
  const valid = linked !== null && (!filters.qaTryId || linked.qaTryId === filters.qaTryId) && (!filters.testCaseId || linked.testCaseId === filters.testCaseId)
  return { rows, linkedAttempt: valid ? linked : null }
}
