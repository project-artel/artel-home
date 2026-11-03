import { buildDisplayName } from '../projects/buildEnvironment'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useI18n } from '../i18n/useI18n'
import { useProjectChange } from '../live/useProjectChange'
import { formatElapsedSeconds } from '../projects/formatters'
import { listProjectQaRuns, QA_NOTICES_CHANGED, qaNoticeTarget, readQaNotice, type QaRunSummary } from './launch/qaLaunchApi'

/** 끝 알림을 고를 때 읽는 최신 실행 수. 한 번에 이만큼 넘게 끝나는 일은 없다. */
const RECENT_RUNS = 5
/** 이미 알린 실행. 새로 고침해도 같은 실행을 다시 알리지 않는다. */
const SEEN_KEY = (projectId: string) => `artel.qaFinishedSeen.${projectId}`

function readSeen(projectId: string): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY(projectId)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function writeSeen(projectId: string, seen: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY(projectId), JSON.stringify([...seen].slice(-50)))
  } catch {
    // 저장이 막혀 있으면 이 화면에서만 기억한다.
  }
}

/**
 * 내가 시작한 QA 실행이 끝나면 어느 화면에서든 오른쪽 아래에 띄운다(ARTEL-1255). 결과와 남은 추가 검토 수를 보이고,
 * 판정 근거 페이지로 바로 간다. 서버가 `QA_RUNS` 변경을 알리면 최신 실행을 다시 읽어, 이 화면을 연 뒤에 끝난 것만 고른다.
 * 닫을 때까지 남는다. 닫거나 놓친 것은 상단바 알림함([QaNoticeBell])에 남는다.
 */
export function QaFinishedNotice({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const copy = t.qa.finishedNotice
  const auth = useAuth()
  const navigate = useNavigate()
  // 이 화면을 연 시각. 이보다 먼저 끝난 실행은 알리지 않는다.
  const [openedAt] = useState(() => Date.now())
  const [shown, setShown] = useState<QaRunSummary[]>([])
  const me = auth.status === 'authenticated' ? auth.user.id : null

  const check = useCallback(() => {
    if (me === null) return
    void listProjectQaRuns(projectId, RECENT_RUNS)
      .then((runs) => {
        const seen = readSeen(projectId)
        const fresh = runs.filter(
          (run) =>
            run.completedAt !== null &&
            Date.parse(run.completedAt) >= openedAt &&
            run.startedBy === me &&
            !seen.has(run.id),
        )
        if (fresh.length === 0) return
        fresh.forEach((run) => seen.add(run.id))
        writeSeen(projectId, seen)
        window.dispatchEvent(new Event(QA_NOTICES_CHANGED))
        setShown((current) => [...fresh, ...current.filter((run) => !fresh.some((next) => next.id === run.id))].slice(0, 2))
      })
      .catch(() => {
        // 알림은 덤이다. 못 읽으면 다음 변경 때 다시 읽는다.
      })
  }, [projectId, me, openedAt])

  useProjectChange(projectId, 'QA_RUNS', check)

  const dismiss = (runId: string) => setShown((current) => current.filter((run) => run.id !== runId))

  if (shown.length === 0) return null
  return (
    <div aria-live="polite" className="qa-notice-stack">
      {shown.map((run) => {
        const passed = run.casesPassed ?? 0
          const failed = run.casesFailed
        const seconds = run.completedAt === null ? null : Math.round((Date.parse(run.completedAt) - Date.parse(run.startedAt)) / 1000)
        const target = qaNoticeTarget(projectId, run)
        return (
          <section aria-label={copy.title} className="qa-notice" key={run.id} role="status">
            <div className="qa-notice-head">
              <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <b>{copy.title}</b>
              <button aria-label={copy.close} className="qa-notice-close" onClick={() => dismiss(run.id)} type="button">✕</button>
            </div>
            <p className="qa-notice-meta">
              {copy.meta(run.testRunName ?? '', run.gameBuildVersion === null ? null : buildDisplayName({ version: run.gameBuildVersion, isEditor: run.gameBuildIsEditor }), seconds === null ? null : formatElapsedSeconds(seconds))}
            </p>
            <div className="qa-notice-stats">
              {run.casesTotal !== null && (
                <>
                  <span className="qa-notice-pill qa-notice-pill--passed"><span aria-hidden="true" className="qv-dot" />{copy.passed(passed)}</span>
                    {failed != null && <span className="qa-notice-pill qa-notice-pill--failed"><span aria-hidden="true" className="qv-dot" />{copy.failed(failed)}</span>}
                </>
              )}
              {run.reviewPending > 0 && (
                <span className="qv-review-pill"><span aria-hidden="true" className="qv-dot" />{copy.review(run.reviewPending)}</span>
              )}
            </div>
            <div className="qa-notice-actions">
              <button className="button button--secondary button--compact" onClick={() => dismiss(run.id)} type="button">{copy.later}</button>
              <button
                className="button button--primary button--compact"
                onClick={() => {
                  dismiss(run.id)
                  // 알림함의 같은 줄도 읽음이 된다. 못 남겨도 이동은 한다.
                  void readQaNotice(run.id)
                    .then(() => window.dispatchEvent(new Event(QA_NOTICES_CHANGED)))
                    .catch(() => undefined)
                  navigate(target)
                }}
                type="button"
              >
                {run.reviewPending > 0 ? copy.goReview : copy.goResult}
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
