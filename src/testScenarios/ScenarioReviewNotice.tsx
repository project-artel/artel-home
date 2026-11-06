import { useI18n } from '../i18n/useI18n'
import { ReviewResultNotice } from '../testCases/ReviewResultNotice'
import { useReviewQueueNotice } from '../testCases/useReviewQueueNotice'
import { ScenarioReviewDialog } from './ScenarioReviewDialog'
import { listScenarioReviewQueue } from './scenarioApi'

/**
 * 내가 승인을 요청한 시나리오가 있으면 어느 화면에서든 오른쪽 아래에 띄운다. MCP 로 저장한 시나리오는 승인 전이라 QA 에
 * 쓰이지 않으므로, 사람이 "상세 확인" 의 팝업에서 내용을 보고 결정한다. 서버가 `TEST_RUNS` 변경을 알리면 다시 읽고, 변경 스트림이
 * 끊긴 동안은 폴링한다. "나중에" 와 닫기는 이 화면에서만 접으며, 새로 고치거나 다시 접속하면 다시 뜬다.
 */
export function ScenarioReviewNotice({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const copy = t.scenarios.reviewNotice
  const notice = useReviewQueueNotice(projectId, 'TEST_RUNS', listScenarioReviewQueue)
  const { drafts } = notice

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
        <ScenarioReviewDialog onClose={notice.closeDetail} onReviewed={notice.onReviewed} projectId={projectId} scenarios={drafts} />
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
            {drafts.slice(0, 2).map((scenario) => (
              <span className="qa-notice-pill" key={scenario.testScenarioId}>{scenario.title}</span>
            ))}
            {drafts.length > 2 && <span className="qa-notice-pill">{copy.more(drafts.length - 2)}</span>}
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
