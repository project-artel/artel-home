import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { cancelQaTry } from './qaApi'

/**
 * Confirms ending a run early.
 *
 * Asked rather than done on one click: a cancelled run cannot be resumed, and
 * the steps it never reached are simply unanswered.
 */
export function CancelQaTryDialog({
  onCancelled,
  onClose,
  qaTryId,
}: {
  onCancelled: () => void
  onClose: () => void
  qaTryId: string
}) {
  const { t } = useI18n()
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    setFailure(null)

    try {
      await cancelQaTry(qaTryId)
      onCancelled()
    } catch (error: unknown) {
      // 409 means it ended on its own while the dialog was open — the run is in
      // the state the user wanted, so the page just needs to catch up.
      if (error instanceof ProjectApiError && error.status === 409) {
        onCancelled()
        return
      }
      setFailure(
        error instanceof ProjectApiError && error.isNotFound
          ? t.qa.cancel.gone
          : t.qa.cancel.failed,
      )
      setPending(false)
    }
  }

  return (
    <Dialog title={t.qa.cancel.title} labelledBy="cancel-qa-title" onClose={onClose}>
      <p className="dialog-copy">{t.qa.cancel.copy}</p>

      {failure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}

      <div className="dialog-actions">
        <button
          className="button button--secondary"
          disabled={pending}
          onClick={onClose}
          type="button"
        >
          {t.qa.cancel.keepRunning}
        </button>
        <button
          className="button button--danger"
          disabled={pending}
          onClick={() => void confirm()}
          type="button"
        >
          {pending ? t.qa.cancel.pending : t.qa.cancel.confirm}
        </button>
      </div>
    </Dialog>
  )
}
