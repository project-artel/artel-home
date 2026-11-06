import { useCallback, useEffect, useState } from 'react'
import { usePolling } from '../live/usePolling'
import { listReviewNotices, REVIEW_NOTICES_CHANGED, type ReviewNotice } from './reviewNoticeApi'

/** 알림함이 승인 대기를 다시 읽는 간격. 프로젝트 밖에는 변경 스트림이 없어, 이 간격이 프로젝트 목록 화면의 갱신 주기다. */
export const REVIEW_NOTICE_POLL_MS = 30_000

/** 프로젝트를 가리지 않은 승인 대기. 처음 그릴 때, 창이 앞으로 올 때, 승인 알림이 바뀔 때, 일정 간격으로 다시 읽는다. */
export function useReviewNotices() {
  const [notices, setNotices] = useState<ReviewNotice[]>([])

  const reload = useCallback(() => {
    void listReviewNotices()
      .then(setNotices)
      .catch(() => {
        // 알림함은 덤이다. 못 읽으면 다음 계기에 다시 읽는다.
      })
  }, [])

  useEffect(() => {
    reload()
    window.addEventListener('focus', reload)
    window.addEventListener(REVIEW_NOTICES_CHANGED, reload)
    return () => {
      window.removeEventListener('focus', reload)
      window.removeEventListener(REVIEW_NOTICES_CHANGED, reload)
    }
  }, [reload])
  usePolling(reload, REVIEW_NOTICE_POLL_MS)

  return { notices, reload }
}
