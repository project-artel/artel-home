import { useState } from 'react'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { NO_OUTCOME, settleReviews, useReviewSelection, type SettleOutcome } from '../testCases/reviewSelection'
import type { ReviewResult } from '../testCases/useReviewQueueNotice'
import { decideScenarioReview } from './scenarioApi'
import type { ScenarioReviewItem } from './scenarioTypes'

/**
 * 승인 대기 시나리오의 스텝과 Test Case 내용을 보여 주고 고른 것을 승인하거나 거절(삭제)한다. 체크를 푼 시나리오는
 * 승인 대기로 남는다. 승인된 시나리오를 고친 것은 이전 본문이 남지 않아 거절하지 못한다.
 */
export function ScenarioReviewDialog({
  projectId,
  scenarios,
  onClose,
  onReviewed,
}: {
  projectId: string
  scenarios: readonly ScenarioReviewItem[]
  onClose: () => void
  /** 끝난 결정을 알린다. 받는 쪽이 완료 안내를 띄우고 대기 목록을 다시 읽는다. */
  onReviewed: (result: ReviewResult) => void
}) {
  const { t } = useI18n()
  const copy = t.scenarios.reviewNotice
  const fields = t.testCases.editor
  const selection = useReviewSelection(scenarios)
  const { chosen } = selection
  const rejectable = chosen.filter((scenario) => scenario.rejectable)
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<SettleOutcome>(NO_OUTCOME)
  const [confirmingReject, setConfirmingReject] = useState(false)

  const decide = async (targets: readonly ScenarioReviewItem[], decision: 'APPROVE' | 'REJECT') => {
    setPending(true)
    setOutcome(NO_OUTCOME)
    const result = await settleReviews(targets, (item) => decideScenarioReview(projectId, item, decision))
    setPending(false)
    onReviewed({ decision, count: result.done })
    if (result.stale > 0 || result.failed > 0) setOutcome(result)
    else onClose()
  }

  return (
    <Dialog labelledBy="scenario-review-title" onClose={onClose} title={copy.title}>
      <div className="crd">
        <p className="dialog-copy">{copy.dialogCopy}</p>
        <label className="crd-all">
          <input checked={selection.allChosen} onChange={selection.toggleAll} type="checkbox" />
          {copy.selected(chosen.length, scenarios.length)}
        </label>
        <div className="crd-list">
          {scenarios.map((scenario) => (
            <section key={scenario.testScenarioId}>
              <label className="crd-row crd-row--head">
                <input checked={selection.isChosen(scenario)} onChange={() => selection.toggle(scenario)} type="checkbox" />
                <span className="crd-body">
                  <span className="crd-step">
                    {scenario.title}
                    {selection.isChanged(scenario) && <span className="crd-kind crd-kind--changed">{copy.changed}</span>}
                    {!scenario.rejectable && <span className="crd-kind" title={copy.editTitle}>{copy.edit}</span>}
                  </span>
                  <span className="crd-note">
                    {[
                      scenario.runs.map((run) => run.name).join(', '),
                      copy.steps(scenario.steps.length),
                      scenario.executionMode === 'FREE' ? copy.free : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                  {scenario.description !== '' && <span className="crd-note">{scenario.description}</span>}
                </span>
              </label>
              <ol className="crd-steps">
                {scenario.steps.map((step, index) => (
                  <li className="crd-body" key={index}>
                    <span className="crd-step-action">
                      {step.action}
                      {step.testCaseId === null && <span className="crd-kind">{copy.noCase}</span>}
                    </span>
                    {step.precondition !== null && (
                      <span className="crd-field crd-field--precondition"><b>{fields.precondition}</b><span>{step.precondition}</span></span>
                    )}
                    {step.expectedValue !== null && (
                      <span className="crd-field crd-field--expected"><b>{fields.expectedValue}</b><span>{step.expectedValue}</span></span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        {outcome.stale > 0 && <div className="inline-error" role="alert"><span aria-hidden="true">!</span>{copy.stale(outcome.stale)}</div>}
        {outcome.failed > 0 && <div className="inline-error" role="alert"><span aria-hidden="true">!</span>{copy.failed(outcome.failed)}</div>}
        <div className="dialog-actions">
          <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">{copy.close}</button>
          <button className="button button--secondary crd-reject" disabled={pending || rejectable.length === 0} onClick={() => setConfirmingReject(true)} type="button">
            {copy.reject(rejectable.length)}
          </button>
          <button className="button button--primary" disabled={pending || chosen.length === 0} onClick={() => void decide(chosen, 'APPROVE')} type="button">
            {pending ? copy.approving : copy.approve(chosen.length)}
          </button>
        </div>
      </div>
      {confirmingReject && (
        <ConfirmActionDialog
          body={<p>{copy.rejectCopy(rejectable.length)}</p>}
          cancelLabel={copy.cancel}
          confirmLabel={copy.reject(rejectable.length)}
          onClose={() => setConfirmingReject(false)}
          onConfirm={async () => {
            await decide(rejectable, 'REJECT')
            setConfirmingReject(false)
          }}
          pendingLabel={copy.rejecting}
          title={copy.rejectTitle}
          toFailureMessage={() => copy.failed(rejectable.length)}
        />
      )}
    </Dialog>
  )
}
