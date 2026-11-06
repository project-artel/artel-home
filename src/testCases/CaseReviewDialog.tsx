import { useMemo, useState } from 'react'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { settleReviews, useReviewSelection, type SettleOutcome } from './reviewSelection'
import { decideCaseReview } from './testCaseApi'
import type { CaseReviewItem, ReviewDecision } from './testCaseTypes'

/**
 * 승인 대기 Test Case 를 화면별로 보여 주고 고른 것을 승인하거나 거절(삭제)한다. 체크를 푼 건은 승인 대기로 남는다.
 * 결정은 읽은 내용 그대로일 때만 받는다. 그 사이 바뀐 건은 체크를 풀어 다시 보여 준다.
 */
export function CaseReviewDialog({
  projectId,
  cases,
  onClose,
  onReviewed,
}: {
  projectId: string
  cases: readonly CaseReviewItem[]
  onClose: () => void
  /** 결정 결과를 다시 읽는다. */
  onReviewed: () => void
}) {
  const { t } = useI18n()
  const copy = t.testCases.reviewNotice
  const fields = t.testCases.editor
  const selection = useReviewSelection(cases)
  const { chosen } = selection
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<SettleOutcome>({ stale: 0, failed: 0 })
  const [confirmingReject, setConfirmingReject] = useState(false)

  const scenes = useMemo(() => {
    const grouped = new Map<string, CaseReviewItem[]>()
    cases.forEach((testCase) => grouped.set(testCase.scene, [...(grouped.get(testCase.scene) ?? []), testCase]))
    return [...grouped].sort((left, right) => right[1].length - left[1].length)
  }, [cases])

  const decide = async (decision: ReviewDecision) => {
    setPending(true)
    setOutcome({ stale: 0, failed: 0 })
    const result = await settleReviews(chosen, (item) => decideCaseReview(projectId, item, decision))
    setPending(false)
    onReviewed()
    if (result.stale > 0 || result.failed > 0) setOutcome(result)
    else onClose()
  }

  return (
    <Dialog labelledBy="case-review-title" onClose={onClose} title={copy.title}>
      <div className="crd">
        <p className="dialog-copy">{copy.dialogCopy}</p>
        <label className="crd-all">
          <input checked={selection.allChosen} onChange={selection.toggleAll} type="checkbox" />
          {copy.selected(chosen.length, cases.length)}
        </label>
        <div className="crd-list">
          {scenes.map(([scene, members]) => (
            <section key={scene}>
              <h3 className="crd-scene">{scene} <span>{members.length}</span></h3>
              {members.map((testCase) => (
                <label className="crd-row" key={testCase.id}>
                  <input checked={selection.isChosen(testCase)} onChange={() => selection.toggle(testCase)} type="checkbox" />
                  <span className="crd-body">
                    <span className="crd-step">
                      {testCase.step}
                      {testCase.kind === 'EXCEPTION' && <span className="crd-kind">{t.testCases.kind.EXCEPTION}</span>}
                      {selection.isChanged(testCase) && <span className="crd-kind crd-kind--changed">{copy.changed}</span>}
                    </span>
                    {testCase.precondition !== null && (
                      <span className="crd-field crd-field--precondition"><b>{fields.precondition}</b><span>{testCase.precondition}</span></span>
                    )}
                    <span className="crd-field crd-field--expected"><b>{fields.expectedValue}</b><span>{testCase.expectedValue}</span></span>
                  </span>
                </label>
              ))}
            </section>
          ))}
        </div>
        {outcome.stale > 0 && <div className="inline-error" role="alert"><span aria-hidden="true">!</span>{copy.stale(outcome.stale)}</div>}
        {outcome.failed > 0 && <div className="inline-error" role="alert"><span aria-hidden="true">!</span>{copy.failed(outcome.failed)}</div>}
        <div className="dialog-actions">
          <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">{copy.close}</button>
          <button className="button button--secondary crd-reject" disabled={pending || chosen.length === 0} onClick={() => setConfirmingReject(true)} type="button">
            {copy.reject(chosen.length)}
          </button>
          <button className="button button--primary" disabled={pending || chosen.length === 0} onClick={() => void decide('APPROVE')} type="button">
            {pending ? copy.approving : copy.approve(chosen.length)}
          </button>
        </div>
      </div>
      {confirmingReject && (
        <ConfirmActionDialog
          body={<p>{copy.rejectCopy(chosen.length)}</p>}
          cancelLabel={copy.cancel}
          confirmLabel={copy.reject(chosen.length)}
          onClose={() => setConfirmingReject(false)}
          onConfirm={async () => {
            await decide('REJECT')
            setConfirmingReject(false)
          }}
          pendingLabel={copy.rejecting}
          title={copy.rejectTitle}
          toFailureMessage={() => copy.failed(chosen.length)}
        />
      )}
    </Dialog>
  )
}
