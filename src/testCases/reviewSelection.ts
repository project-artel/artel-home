import { useState } from 'react'
import { ProjectApiError } from '../projects/projectApi'

/** 한 번에 보내는 결정 수. 일괄 API 가 없어 나눠 보낸다. */
const DECISION_CONCURRENCY = 6

export type Reviewable = { id: string; updatedAt: string }

/** 사람이 읽은 내용의 표시. 내용이 바뀌면 다른 값이 된다. */
const readKey = (item: Reviewable) => `${item.id}@${item.updatedAt}`

/**
 * 팝업의 체크 상태. **처음 연 때 보인 내용만 체크한다.** 열어 둔 사이 새로 온 건과 내용이 바뀐 건은 체크되지 않은 채
 * 나타나서, 사람이 읽지 않은 내용이 함께 승인되지 않는다.
 */
export function useReviewSelection<T extends Reviewable>(items: readonly T[]) {
  const [seen] = useState<ReadonlySet<string>>(() => new Set(items.map(readKey)))
  const [checked, setChecked] = useState<ReadonlySet<string>>(seen)
  const chosen = items.filter((item) => checked.has(readKey(item)))
  return {
    chosen,
    allChosen: items.length > 0 && chosen.length === items.length,
    isChosen: (item: T) => checked.has(readKey(item)),
    /** 처음 본 뒤 새로 왔거나 바뀐 건인가. */
    isChanged: (item: T) => !seen.has(readKey(item)),
    toggle: (item: T) => {
      const next = new Set(checked)
      if (!next.delete(readKey(item))) next.add(readKey(item))
      setChecked(next)
    },
    toggleAll: () => setChecked(new Set(chosen.length === items.length ? [] : items.map(readKey))),
  }
}

/** 결정 결과. 이미 처리된 건은 원하던 일이 끝났거나 남이 먼저 정한 것이라 실패로 치지 않지만, [done] 에도 넣지 않는다. */
export type SettleOutcome = { done: number; stale: number; failed: number }

export const NO_OUTCOME: SettleOutcome = { done: 0, stale: 0, failed: 0 }

export async function settleReviews<T>(items: readonly T[], decide: (item: T) => Promise<void>): Promise<SettleOutcome> {
  const outcome = { ...NO_OUTCOME }
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(DECISION_CONCURRENCY, queue.length) }, async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        try {
          await decide(next)
          outcome.done += 1
        } catch (error: unknown) {
          const code = error instanceof ProjectApiError ? error.code : null
          const gone = error instanceof ProjectApiError && error.status === 404
          if (code === 'review_stale') outcome.stale += 1
          else if (code !== 'review_settled' && !gone) outcome.failed += 1
        }
      }
    }),
  )
  return outcome
}
