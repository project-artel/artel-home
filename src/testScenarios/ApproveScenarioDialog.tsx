import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
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
  const { t } = useI18n()
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
          ? t.scenarios.approve.gone
          : t.scenarios.approve.failed,
      )
      setPending(false)
    }
  }

  return (
    <Dialog title={t.scenarios.approve.title} labelledBy="approve-scenario-title" onClose={onClose}>
      <p className="dialog-copy">{t.scenarios.approve.copy}</p>

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
          {t.scenarios.approve.cancel}
        </button>
        <button
          className="button button--primary"
          disabled={pending}
          onClick={() => void confirm()}
          type="button"
        >
          {pending ? t.scenarios.approve.pending : t.scenarios.approve.confirm}
        </button>
      </div>
    </Dialog>
  )
}
