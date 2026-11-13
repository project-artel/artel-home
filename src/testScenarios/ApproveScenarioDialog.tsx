import { InlineError } from '../design-system/primitives/Feedback'
import { Button } from '../design-system/primitives/Button'
import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { approveScenarioFailure } from './approveScenarioError'
import { approveTestScenario } from './scenarioApi'
import type { ScenarioDraft } from './scenarioTypes'

/**
 * Confirms finalizing a scenario. Approval keeps the scenario and its
 * conversation. In the run-scoped chat (ARTEL-206 Step 6) a scenario's content
 * is its case composition (saved continuously), so approval no longer carries a
 * step draft — `draft` is optional and, when omitted, the server just finalizes
 * without overwriting the payload.
 */
export function ApproveScenarioDialog({
  testScenarioId,
  draft,
  onClose,
  onApproved,
}: {
  testScenarioId: number
  draft?: ScenarioDraft
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
      setFailure(approveScenarioFailure(error, t.scenarios.approve))
      setPending(false)
    }
  }

  return (
    <Dialog title={t.scenarios.approve.title} labelledBy="approve-scenario-title" onClose={onClose}>
      <p className="dialog-copy">{t.scenarios.approve.copy}</p>

      {failure !== null && (
        <InlineError>
          <span aria-hidden="true">!</span>
          {failure}
        </InlineError>
      )}

      <div className="dialog-actions">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={onClose}
          type="button"
        >
          {t.scenarios.approve.cancel}
        </Button>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() => void confirm()}
          type="button"
        >
          {pending ? t.scenarios.approve.pending : t.scenarios.approve.confirm}
        </Button>
      </div>
    </Dialog>
  )
}
