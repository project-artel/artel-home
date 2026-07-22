import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { deleteGameInstance } from './gameApi'
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

  async function confirm() {
    setPending(true)
    setFailure(null)

    try {
      await deleteGameInstance(projectId, instanceId)
      onDeleted()
    } catch (error: unknown) {
      setFailure(
        error instanceof ProjectApiError && error.isForbidden
          ? 'You do not have permission to delete this instance.'
          : 'The instance could not be deleted. Please try again.',
      )
      // No `finally`: a success unmounts this dialog, so clearing the pending
      // flag there would be a state update on a component that is already gone.
      setPending(false)
    }
  }

  return (
    <Dialog labelledBy="delete-instance-title" onClose={onClose} title="Delete game instance">
      <p className="dialog-copy">
        <strong>{instanceName}</strong> will stop reporting and its instance key
        will no longer work. Connecting that game again needs a new instance and
        a new key. This cannot be undone.
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
          Cancel
        </button>
        <button
          className="button button--danger"
          disabled={pending}
          onClick={() => void confirm()}
          type="button"
        >
          {pending ? 'Deleting…' : 'Delete instance'}
        </button>
      </div>
    </Dialog>
  )
}
