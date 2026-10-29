import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDate, formatElapsedSeconds } from '../projects/formatters'
import {
  listQaNotices,
  QA_NOTICES_CHANGED,
  qaNoticeTarget,
  readAllQaNotices,
  readQaNotice,
  runDuration,
  type QaNotice,
  type QaNotices,
} from './launch/qaLaunchApi'

/** 끝난 지 이만큼 안이면 "몇 분 전" 으로, 넘으면 날짜로 쓴다. */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 상단바 알림함(ARTEL-1255). 내가 시작한 QA 실행이 끝난 것을 프로젝트를 가리지 않고 모아 둔다. 오른쪽 아래 끝
 * 알림([QaFinishedNotice])은 그대로 뜨고, 닫거나 놓친 것이 여기에 남는다. 읽음은 서버에 남아 다른 기기에서도 같다.
 *
 * 따로 폴링하지 않는다. 처음 그릴 때, 창이 다시 앞으로 올 때, 열 때, 끝 알림이 새로 떴을 때 다시 읽는다.
 */
export function QaNoticeBell() {
  const { t } = useI18n()
  const copy = t.qa.noticeBell
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [notices, setNotices] = useState<QaNotices>({ items: [], unreadCount: 0 })
  // "몇 분 전" 의 기준. 다시 읽을 때마다 고친다.
  const [now, setNow] = useState(() => Date.now())

  const reload = useCallback(() => {
    void listQaNotices()
      .then((next) => {
        setNotices(next)
        setNow(Date.now())
      })
      .catch(() => {
        // 알림함은 덤이다. 못 읽으면 다음 계기에 다시 읽는다.
      })
  }, [])

  useEffect(() => {
    reload()
    window.addEventListener('focus', reload)
    window.addEventListener(QA_NOTICES_CHANGED, reload)
    return () => {
      window.removeEventListener('focus', reload)
      window.removeEventListener(QA_NOTICES_CHANGED, reload)
    }
  }, [reload])

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function go(notice: QaNotice) {
    setOpen(false)
    if (!notice.read) {
      setNotices((current) => ({
        items: current.items.map((item) => (item.run.id === notice.run.id ? { ...item, read: true } : item)),
        unreadCount: Math.max(0, current.unreadCount - 1),
      }))
      void readQaNotice(notice.run.id).then(setNotices).catch(() => undefined)
    }
    navigate(qaNoticeTarget(notice.projectId, notice.run))
  }

  function when(completedAt: string): string {
    const elapsed = now - Date.parse(completedAt)
    if (!(elapsed < DAY_MS)) return formatDate(completedAt)
    return copy.ago(Math.max(0, Math.floor(elapsed / 60000)))
  }

  // 실행 상태 FAILED 는 실패한 케이스가 있어도, 판정 없이 멈춰도 같다. 판정이 없으면 끝난 것이 아니라 멈춘 것이다.
  function titleOf(status: string, casesTotal: number | null) {
    if (status === 'CANCELLED') return copy.cancelled
    return casesTotal === null ? copy.stopped : copy.finished
  }

  const unread = notices.unreadCount
  return (
    <div className="qa-bell" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? copy.labelUnread(unread) : copy.label}
        className={'theme-toggle qa-bell-button' + (open ? ' is-open' : '')}
        onClick={() => {
          if (!open) reload()
          setOpen(!open)
        }}
        type="button"
      >
        <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span aria-hidden="true" className="qa-bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div aria-label={copy.title} className="qa-bell-popover" role="dialog">
          <div className="qa-bell-head">
            <b>{copy.title}</b>
            {unread > 0 && <span className="qa-bell-count">{unread}</span>}
            {unread > 0 && (
              <button
                className="qa-bell-readall"
                onClick={() => {
                  setNotices((current) => ({ items: current.items.map((item) => ({ ...item, read: true })), unreadCount: 0 }))
                  void readAllQaNotices().then(setNotices).catch(() => undefined)
                }}
                type="button"
              >
                {copy.readAll}
              </button>
            )}
          </div>
          {notices.items.length === 0 ? (
            <p className="qa-bell-empty">{copy.empty}</p>
          ) : (
            <>
              <ul className="qa-bell-list">
                {notices.items.map((notice) => {
                  const { run } = notice
                  const passed = run.casesPassed ?? 0
                  const failed = run.casesFailed
                  const ms = runDuration(run)
                  const seconds = ms === null ? null : Math.round(ms / 1000)
                  const meta = [
                    notice.projectName,
                    run.gameBuildVersion === null ? null : copy.build(run.gameBuildVersion),
                    run.completedAt === null ? null : when(run.completedAt),
                    seconds === null ? null : formatElapsedSeconds(seconds),
                  ].filter(Boolean).join(' · ')
                  return (
                    <li key={run.id}>
                      <button className={'qa-bell-item' + (notice.read ? ' is-read' : '')} onClick={() => go(notice)} type="button">
                        <span aria-hidden="true" className="qa-bell-dot" />
                        <span className="qa-bell-body">
                          <span className="qa-bell-name">{titleOf(run.status, run.casesTotal)(run.testRunName ?? '')}</span>
                          <span className="qa-bell-meta">{meta}</span>
                          <span className="qa-notice-stats">
                            {run.casesTotal !== null && (
                              <>
                                <span className="qa-notice-pill qa-notice-pill--passed"><span aria-hidden="true" className="qv-dot" />{t.qa.finishedNotice.passed(passed)}</span>
                                {failed != null && <span className="qa-notice-pill qa-notice-pill--failed"><span aria-hidden="true" className="qv-dot" />{t.qa.finishedNotice.failed(failed)}</span>}
                              </>
                            )}
                            {run.reviewPending > 0 ? (
                              <span className="qv-review-pill"><span aria-hidden="true" className="qv-dot" />{t.qa.finishedNotice.review(run.reviewPending)}</span>
                            ) : run.reviewFlagged > 0 ? (
                              <span className="qa-notice-pill qa-bell-pill--done"><span aria-hidden="true" className="qv-dot" />{copy.reviewDone}</span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="qa-bell-foot">{copy.foot}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
