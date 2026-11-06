import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'

/**
 * Confirms taking a game away from the QA that is still running on it.
 *
 * The server refuses the first request, and this is the second: the operator is
 * told what ending that run costs and then starts theirs in the same place they
 * were already standing. Sending them to the other run's console to end it and
 * come back asks the same decision twice.
 *
 * Presentational on purpose — the start request belongs to the panel, which
 * holds the game, run, and model the operator picked.
 */
export function TakeOverQaRunDialog({
  failure,
  onClose,
  onConfirm,
  pending,
}: {
  failure: string | null
  onClose: () => void
  onConfirm: () => void
  pending: boolean
}) {
  const { t } = useI18n()

  return (
    <Dialog title={t.qa.takeover.title} labelledBy="takeover-qa-title" onClose={onClose}>
      <p className="dialog-copy">{t.qa.takeover.copy}</p>

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
          {t.qa.takeover.keepRunning}
        </button>
        <button
          className="button button--danger"
          disabled={pending}
          onClick={onConfirm}
          type="button"
        >
          {pending ? t.qa.takeover.pending : t.qa.takeover.confirm}
        </button>
      </div>
    </Dialog>
  )
}
