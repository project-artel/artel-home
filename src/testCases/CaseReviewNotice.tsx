import { useMemo } from 'react'
import { useI18n } from '../i18n/useI18n'
import { CaseReviewDialog } from './CaseReviewDialog'
import { ReviewResultNotice } from './ReviewResultNotice'
import { listCaseReviewQueue } from './testCaseApi'
import { useReviewQueueNotice } from './useReviewQueueNotice'

/** 알림에 이름을 적는 화면 수. 나머지는 수로 묶는다. */
const NAMED_SCENES = 3

/**
 * 내가 승인을 요청한 Test Case 가 있으면 어느 화면에서든 오른쪽 아래에 띄운다. MCP 로 만든 Test Case 는
 * 승인 전이라 시나리오와 QA 에 쓰이지 않으므로, 사람이 "상세 확인" 의 팝업에서 내용을 보고 결정한다.
 * 서버가 `TEST_CASES` 변경을 알리면 다시 읽고, 변경 스트림이 끊긴 동안은 폴링한다. "나중에" 와 닫기는 이 화면에서만 접으며,
 * 새로 고치거나 다시 접속하면 다시 뜬다.
 */
export function CaseReviewNotice({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const copy = t.testCases.reviewNotice
  const notice = useReviewQueueNotice(projectId, 'TEST_CASES', listCaseReviewQueue)
  const { drafts } = notice

  const scenes = useMemo(() => {
    const counts = new Map<string, number>()
    drafts.forEach((testCase) => counts.set(testCase.scene, (counts.get(testCase.scene) ?? 0) + 1))
    return [...counts].sort((left, right) => right[1] - left[1])
  }, [drafts])

  const rest = scenes.length - NAMED_SCENES
  const dialogOpen = notice.detailOpen && drafts.length > 0
  return (
    <>
      {notice.result !== null && !dialogOpen && (
        <ReviewResultNotice
          closeLabel={copy.close}
          message={notice.result.decision === 'APPROVE' ? copy.approved(notice.result.count) : copy.rejected(notice.result.count)}
          onClose={notice.clearResult}
        />
      )}
      {dialogOpen ? (
        <CaseReviewDialog cases={drafts} onClose={notice.closeDetail} onReviewed={notice.onReviewed} projectId={projectId} />
      ) : notice.showNotice && (
        <section aria-label={copy.title} className="qa-notice" role="status">
          <div className="qa-notice-head">
            <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
              <path d="M9 11l3 3 8-8" />
              <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
            </svg>
            <b>{copy.title}</b>
            <button aria-label={copy.close} className="qa-notice-close" onClick={notice.dismiss} type="button">✕</button>
          </div>
          <p className="qa-notice-meta">{copy.meta(drafts.length)}</p>
          <div className="qa-notice-stats">
            {scenes.slice(0, NAMED_SCENES).map(([scene, count]) => (
              <span className="qa-notice-pill" key={scene}>{scene} {count}</span>
            ))}
            {rest > 0 && <span className="qa-notice-pill">{copy.moreScenes(rest)}</span>}
          </div>
          <div className="qa-notice-actions">
            <button className="button button--secondary button--compact" onClick={notice.dismiss} type="button">{copy.later}</button>
            <button className="button button--primary button--compact" onClick={notice.openDetail} type="button">{copy.details}</button>
          </div>
        </section>
      )}
    </>
  )
}
