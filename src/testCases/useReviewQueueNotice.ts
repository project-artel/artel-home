import { useCallback, useEffect, useRef, useState } from 'react'
import { usePolling } from '../live/usePolling'
import type { ProjectChangeTopic } from '../live/projectEvents'
import { useProjectChange } from '../live/useProjectChange'
import { REVIEW_NOTICES_CHANGED, REVIEW_NOTICES_OPEN } from './reviewNoticeApi'
import type { Reviewable } from './reviewSelection'

/** 끝난 결정 하나. 완료 안내가 읽는다. */
export type ReviewResult = { decision: 'APPROVE' | 'REJECT'; count: number }

const idsOf = (items: readonly Reviewable[]) => items.map((item) => item.id).join(',')

/**
 * 프로젝트 화면의 승인 알림이 공통으로 갖는 상태. 대기 목록을 읽고, 접고, 팝업을 열고, 결정 결과를 들고 있는다.
 *
 * 접기는 이 화면에만 남긴다. 승인하거나 거절하지 않은 건은 새로 고치거나 다시 접속하면 다시 떠야 하므로 어디에도 저장하지 않는다.
 * 변경 스트림이 끊긴 동안(배포로 `/events` 가 502 를 받는 경우 등)은 폴링으로 다시 읽는다.
 */
export function useReviewQueueNotice<T extends Reviewable>(
  projectId: string,
  topic: ProjectChangeTopic,
  readQueue: (projectId: string) => Promise<T[]>,
) {
  const [drafts, setDrafts] = useState<T[]>([])
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const [detailOpen, setDetailOpen] = useState(false)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const lastIds = useRef<string | null>(null)

  const check = useCallback(() => {
    void readQueue(projectId)
      .then((next) => {
        setDrafts(next)
        // 남이 다 처리했으면 팝업도 닫는다. 안 닫으면 다음 요청이 올 때 팝업이 혼자 열린다.
        if (next.length === 0) setDetailOpen(false)
        const ids = idsOf(next)
        if (lastIds.current !== null && lastIds.current !== ids) window.dispatchEvent(new Event(REVIEW_NOTICES_CHANGED))
        lastIds.current = ids
      })
      .catch(() => {
        // 알림은 덤이다. 못 읽으면 다음 변경 때 다시 읽는다.
      })
  }, [projectId, readQueue])

  useEffect(check, [check])
  const live = useProjectChange(projectId, topic, check)
  usePolling(check, undefined, !live)

  useEffect(() => {
    const reopen = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === projectId) setDismissed(new Set())
    }
    window.addEventListener(REVIEW_NOTICES_OPEN, reopen)
    return () => window.removeEventListener(REVIEW_NOTICES_OPEN, reopen)
  }, [projectId])

  return {
    drafts,
    /** 접지 않은 건이 하나라도 있다. 접은 뒤 새 건이 오면 다시 뜬다. */
    showNotice: drafts.some((item) => !dismissed.has(item.id)),
    dismiss: () => setDismissed(new Set(drafts.map((item) => item.id))),
    detailOpen,
    openDetail: () => setDetailOpen(true),
    closeDetail: () => setDetailOpen(false),
    result,
    clearResult: () => setResult(null),
    onReviewed: (decided: ReviewResult) => {
      if (decided.count > 0) setResult(decided)
      check()
    },
  }
}
