import { useId } from 'react'
import { Dialog } from '../../design-system/primitives/Dialog'
import { useI18n } from '../../i18n/useI18n'
import type { PendingQaReview } from './qaPendingReview'
import './qaPendingReview.css'

export function QaPendingReviewDialog({ review, pending, failure, onClose, onConfirm }: {
  review: PendingQaReview
  pending: boolean
  failure: string | null
  onClose: () => void
  onConfirm: () => void
}) {
  const titleId = useId()
  const { t } = useI18n()
  const copy = t.qa.launch.panel.pendingReview
  const groups = [
    { label: copy.scenarios, items: review.scenarios },
    { label: copy.cases, items: review.cases },
  ]
  const count = review.scenarios.length + review.cases.length
  return (
    <Dialog title={copy.title} labelledBy={titleId} onClose={() => { if (!pending) onClose() }}>
      {groups.filter(({ items }) => items.length > 0).map(({ label, items }) => (
        <section className="qa-pending-review" key={label} aria-label={label}>
          <h3>{label} · {items.length}</h3>
          <ul className="dialog-copy">
            {items.map(({ id, label }) => <li key={id}>{label || copy.untitled(id)}</li>)}
          </ul>
        </section>
      ))}
      {failure !== null && <div className="inline-error" role="alert">{failure}</div>}
      <div className="dialog-actions">
        <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">{copy.cancel}</button>
        <button className="button button--primary" disabled={pending} onClick={onConfirm} type="button">
          {pending ? copy.approving : copy.approveAndRun(count)}
        </button>
      </div>
    </Dialog>
  )
}
