import { useEffect, useRef } from 'react'

/** 완료 안내가 떠 있는 시간. 닫기 전까지 남는 알림과 달리 할 일이 없어 저절로 사라진다. */
const RESULT_VISIBLE_MS = 8_000

/** 승인이나 거절이 끝났음을 알린다. 팝업이 닫힌 뒤에 그려야 사람이 볼 시간이 보장된다. */
export function ReviewResultNotice({ message, closeLabel, onClose }: { message: string; closeLabel: string; onClose: () => void }) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), RESULT_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <section className="qa-notice qa-notice--done" role="status">
      <div className="qa-notice-head">
        <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <b>{message}</b>
        <button aria-label={closeLabel} className="qa-notice-close" onClick={onClose} type="button">✕</button>
      </div>
    </section>
  )
}
