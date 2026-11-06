import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useProjectChange } from '../live/useProjectChange'
import { ScenarioReviewDialog } from './ScenarioReviewDialog'
import { listScenarioReviewQueue } from './scenarioApi'
import type { ScenarioReviewItem } from './scenarioTypes'

/** 닫을 때 본 승인 대기 id. 새 시나리오가 오면 다시 뜬다. */
const DISMISSED_KEY = (projectId: string) => `artel.scenarioReviewDismissed.${projectId}`

function readDismissed(projectId: string): Set<number> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY(projectId)) ?? '[]') as number[])
  } catch {
    return new Set()
  }
}

function writeDismissed(projectId: string, ids: readonly number[]) {
  try {
    sessionStorage.setItem(DISMISSED_KEY(projectId), JSON.stringify(ids))
  } catch {
    // 저장이 막혀 있으면 새로 고칠 때 다시 뜬다.
  }
}

/**
 * 내가 승인을 요청한 시나리오가 있으면 어느 화면에서든 오른쪽 아래에 띄운다. MCP 로 저장한 시나리오는 승인 전이라 QA 에
 * 쓰이지 않으므로, 사람이 "상세 확인" 의 팝업에서 내용을 보고 결정한다. 서버가 `TEST_RUNS` 변경을 알리면 다시 읽는다.
 */
export function ScenarioReviewNotice({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const copy = t.scenarios.reviewNotice
  const [drafts, setDrafts] = useState<ScenarioReviewItem[]>([])
  const [dismissed, setDismissed] = useState(() => readDismissed(projectId))
  const [detailOpen, setDetailOpen] = useState(false)

  const check = useCallback(() => {
    void listScenarioReviewQueue(projectId)
      .then((next) => {
        setDrafts(next)
        // 남이 다 처리했으면 팝업도 닫는다. 안 닫으면 다음 요청이 올 때 팝업이 혼자 열린다.
        if (next.length === 0) setDetailOpen(false)
      })
      .catch(() => {
        // 알림은 덤이다. 못 읽으면 다음 변경 때 다시 읽는다.
      })
  }, [projectId])

  useEffect(check, [check])
  useProjectChange(projectId, 'TEST_RUNS', check)

  if (drafts.length === 0) return null
  if (detailOpen) {
    return <ScenarioReviewDialog onClose={() => setDetailOpen(false)} onReviewed={check} projectId={projectId} scenarios={drafts} />
  }
  if (drafts.every((scenario) => dismissed.has(scenario.testScenarioId))) return null

  const dismiss = () => {
    const ids = drafts.map((scenario) => scenario.testScenarioId)
    writeDismissed(projectId, ids)
    setDismissed(new Set(ids))
  }

  return (
    <section aria-label={copy.title} className="qa-notice" role="status">
      <div className="qa-notice-head">
        <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
          <path d="M9 11l3 3 8-8" />
          <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
        </svg>
        <b>{copy.title}</b>
        <button aria-label={copy.close} className="qa-notice-close" onClick={dismiss} type="button">✕</button>
      </div>
      <p className="qa-notice-meta">{copy.meta(drafts.length)}</p>
      <div className="qa-notice-stats">
        {drafts.slice(0, 2).map((scenario) => (
          <span className="qa-notice-pill" key={scenario.testScenarioId}>{scenario.title}</span>
        ))}
        {drafts.length > 2 && <span className="qa-notice-pill">{copy.more(drafts.length - 2)}</span>}
      </div>
      <div className="qa-notice-actions">
        <button className="button button--secondary button--compact" onClick={dismiss} type="button">{copy.later}</button>
        <button className="button button--primary button--compact" onClick={() => setDetailOpen(true)} type="button">{copy.details}</button>
      </div>
    </section>
  )
}
