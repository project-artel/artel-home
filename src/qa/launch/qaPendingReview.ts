import { apiFetch } from '../../auth/authApi'
import { asRecord, jsonRequest, ProjectApiError, toApiError } from '../../projects/projectApi'

type ReviewItem = { id: string; label: string; updatedAt: string }

export type PendingQaReview = { scenarios: ReviewItem[]; cases: ReviewItem[] }

function reviewItems(value: unknown): ReviewItem[] | null {
  if (!Array.isArray(value)) return null
  const items: ReviewItem[] = []
  for (const valueItem of value) {
    const item = asRecord(valueItem)
    if (item === null || typeof item.id !== 'string' || typeof item.label !== 'string' ||
      typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) return null
    items.push({ id: item.id, label: item.label, updatedAt: item.updatedAt })
  }
  return items
}

export function pendingQaReview(error: unknown): PendingQaReview | null {
  if (!(error instanceof ProjectApiError) || error.status !== 409 || error.code !== 'test_run_review_pending') return null
  const payload = asRecord(error.pendingReview)
  const scenarios = reviewItems(payload?.scenarios)
  const cases = reviewItems(payload?.cases)
  if (scenarios === null || cases === null || scenarios.length + cases.length === 0) return null
  return { scenarios, cases }
}

export async function approvePendingQaReview(testRunId: string, review: PendingQaReview): Promise<void> {
  const versions = (items: ReviewItem[]) => items.map(({ id, updatedAt }) => ({ id, updatedAt }))
  const response = await apiFetch(`/api/qa-runs/pending-review/${encodeURIComponent(testRunId)}`, {
    method: 'POST',
    ...jsonRequest({ scenarios: versions(review.scenarios), cases: versions(review.cases) }),
  })
  if (!response.ok) throw await toApiError(response)
}
