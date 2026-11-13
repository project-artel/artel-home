import { apiFetch } from '../auth/authApi'
import { asRecord, asString, readJson, toApiError } from '../projects/projectApi'

/** 상단바 알림함의 승인 대기 한 줄: 내가 승인을 요청한 건을 프로젝트별로 센 것. */
export type ReviewNotice = {
  projectId: string
  projectName: string
  testCaseCount: number
  scenarioCount: number
}

/** 승인 대기가 바뀌어 알림함이 다시 읽어야 할 때 쏜다. 프로젝트 변경 스트림은 프로젝트 화면 안에만 있다. */
export const REVIEW_NOTICES_CHANGED = 'artel:review-notices-changed'
/** 알림함에서 프로젝트를 고를 때 쏜다. 그 프로젝트의 승인 알림을 접어 뒀어도 다시 편다. `detail` 은 프로젝트 id 다. */
export const REVIEW_NOTICES_OPEN = 'artel:review-notices-open'

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function parseReviewNotices(data: unknown): ReviewNotice[] {
  const items = asRecord(data)?.items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    const record = asRecord(item)
    if (record === null || typeof record.projectId !== 'string') return []
    return [{
      projectId: record.projectId,
      projectName: asString(record.projectName),
      testCaseCount: asCount(record.testCaseCount),
      scenarioCount: asCount(record.scenarioCount),
    }]
  })
}

/** 내가 승인을 요청한 대기 건: `GET /api/review-notices`. */
export async function listReviewNotices(signal?: AbortSignal): Promise<ReviewNotice[]> {
  const response = await apiFetch('/api/review-notices', { signal })
  if (!response.ok) throw await toApiError(response)
  return parseReviewNotices(await readJson(response))
}

/** 알림함 종 모양의 수에 더하는 값. */
export function pendingReviewCount(notices: readonly ReviewNotice[]): number {
  return notices.reduce((sum, notice) => sum + notice.testCaseCount + notice.scenarioCount, 0)
}
