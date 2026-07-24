import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { deleteGameInstance } from './gameApi'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from './projectApi'

/**
 * Deleting an instance revokes its key, and there is no re-issue endpoint: the
 * SDK install that used it stops reporting and has to be pointed at a brand new
 * instance. That is not recoverable from this UI, so — exactly as with project
 * deletion — the instance name is spelled out in the question and the
 * destructive button is second, never the one that already has focus.
 */
export function DeleteGameInstanceDialog({
  instanceId,
  instanceName,
  onClose,
  onDeleted,
  projectId,
}: {
  instanceId: string
  instanceName: string
  onClose: () => void
  onDeleted: () => void
  projectId: string
}) {
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { t } = useI18n()

  async function confirm() {
    setPending(true)
    setFailure(null)

    try {
      await deleteGameInstance(projectId, instanceId)
      onDeleted()
    } catch (error: unknown) {
      setFailure(
        error instanceof ProjectApiError && error.isForbidden
          ? t.projects.instanceDelete.forbidden
          : t.projects.instanceDelete.deleteFailed,
      )
      // No `finally`: a success unmounts this dialog, so clearing the pending
      // flag there would be a state update on a component that is already gone.
      setPending(false)
    }
  }

  return (
    <Dialog
      labelledBy="delete-instance-title"
      onClose={onClose}
      title={t.projects.instanceDelete.title}
    >
      <p className="dialog-copy">
        <strong>{instanceName}</strong>
        {t.projects.instanceDelete.confirmSuffix}
      </p>

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
          {t.projects.shared.cancel}
        </button>
        <button
          className="button button--danger"
          disabled={pending}
          onClick={() => void confirm()}
          type="button"
        >
          {pending ? t.projects.shared.deleting : t.projects.instanceDelete.confirm}
        </button>
      </div>
    </Dialog>
  )
}
