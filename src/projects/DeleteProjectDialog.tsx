import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { deleteProject, ProjectApiError } from './projectApi'

/**
 * Deletion cannot be undone from this UI — the server keeps the row, but
 * exposes no restore path — so the destructive button is never the one that
 * already has focus, and the project name is spelled out in the question.
 */
export function DeleteProjectDialog({
  projectId,
  projectName,
  onClose,
  onDeleted,
}: {
  projectId: string
  projectName: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    setFailure(null)

    try {
      await deleteProject(projectId)
      onDeleted()
    } catch (error: unknown) {
      setFailure(
        error instanceof ProjectApiError && error.isForbidden
          ? 'Only an owner can delete this project.'
          : 'The project could not be deleted. Please try again.',
      )
      setPending(false)
    }
  }

  return (
    <Dialog title="Delete project" labelledBy="delete-project-title" onClose={onClose}>
      <p className="dialog-copy">
        <strong>{projectName}</strong> and its planning documents will no longer be
        reachable. This cannot be undone.
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
          {pending ? 'Deleting…' : 'Delete project'}
        </button>
      </div>
    </Dialog>
  )
}
