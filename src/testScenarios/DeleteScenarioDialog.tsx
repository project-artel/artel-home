import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { ProjectApiError } from '../projects/projectApi'
import { deleteTestScenario } from './scenarioApi'

/**
 * Confirms discarding a scenario (Decline). Deletion removes the scenario and
 * its conversation with no restore path, so the destructive button is never the
 * one that already has focus and the scenario is named in the question.
 */
export function DeleteScenarioDialog({
  testScenarioId,
  scenarioTitle,
  onClose,
  onDeleted,
}: {
  testScenarioId: number
  scenarioTitle: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    setFailure(null)

    try {
      await deleteTestScenario(testScenarioId)
      onDeleted()
    } catch (error: unknown) {
      setFailure(
        error instanceof ProjectApiError && error.isNotFound
          ? 'This scenario is no longer available.'
          : 'The scenario could not be deleted. Please try again.',
      )
      setPending(false)
    }
  }

  const name = scenarioTitle.length > 0 ? scenarioTitle : 'This untitled scenario'

  return (
    <Dialog title="Delete scenario" labelledBy="delete-scenario-title" onClose={onClose}>
      <p className="dialog-copy">
        <strong>{name}</strong> and its conversation will be permanently removed.
        This cannot be undone.
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
          {pending ? 'Deleting…' : 'Delete scenario'}
        </button>
      </div>
    </Dialog>
  )
}
