import { InlineError } from '../design-system/primitives/Feedback'
import { Button } from '../design-system/primitives/Button'
import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
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
  const { t } = useI18n()
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
          ? t.scenarios.delete.gone
          : t.scenarios.delete.failed,
      )
      setPending(false)
    }
  }

  const name = scenarioTitle.length > 0 ? scenarioTitle : t.scenarios.delete.untitledName

  return (
    <Dialog title={t.scenarios.delete.title} labelledBy="delete-scenario-title" onClose={onClose}>
      <p className="dialog-copy">
        <strong>{name}</strong>
        {t.scenarios.delete.copySuffix}
      </p>

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
          {t.scenarios.delete.cancel}
        </Button>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => void confirm()}
          type="button"
        >
          {pending ? t.scenarios.delete.pending : t.scenarios.delete.confirm}
        </Button>
      </div>
    </Dialog>
  )
}
