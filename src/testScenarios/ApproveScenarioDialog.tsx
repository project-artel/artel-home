import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { ProjectApiError } from '../projects/projectApi'
import { approveTestScenario } from './scenarioApi'
import type { ScenarioDraft } from './scenarioTypes'

/**
 * Confirms finalizing a scenario. Approval keeps the scenario but clears the
 * conversation that produced it and closes the agent session, so the one
 * irreversible part — the chat — is spelled out before the user commits.
 *
 * The draft on screen is sent as the final version, so approving is also how
 * unsent canvas edits are saved for good.
 */
export function ApproveScenarioDialog({
  testScenarioId,
  draft,
  onClose,
  onApproved,
}: {
  testScenarioId: number
  draft: ScenarioDraft
  onClose: () => void
  onApproved: () => void
}) {
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    setFailure(null)

    try {
      await approveTestScenario(testScenarioId, draft)
      onApproved()
    } catch (error: unknown) {
      setFailure(
        error instanceof ProjectApiError && error.isNotFound
          ? 'This scenario is no longer available.'
          : 'The scenario could not be approved. Please try again.',
      )
      setPending(false)
    }
  }

  return (
    <Dialog title="Approve scenario" labelledBy="approve-scenario-title" onClose={onClose}>
      <p className="dialog-copy">
        The scenario on screen is saved as its final version. The conversation
        that produced it is cleared and the agent session closes — that part
        cannot be undone.
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
          className="button button--primary"
          disabled={pending}
          onClick={() => void confirm()}
          type="button"
        >
          {pending ? 'Approving…' : 'Approve scenario'}
        </button>
      </div>
    </Dialog>
  )
}
