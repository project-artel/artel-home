import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { deleteTestScenario } from './scenarioApi'

export function DeleteScenarioDialog({
  testScenarioId,
  scenarioTitle,
  confirmationCopy,
  onClose,
  onDeleted,
}: {
  testScenarioId: number
  scenarioTitle: string
  confirmationCopy?: string
  onClose: () => void
  onDeleted: () => void
}) {
  const { t } = useI18n()
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [hasQaHistory, setHasQaHistory] = useState(false)
  const cancelButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (hasQaHistory) cancelButton.current?.focus()
  }, [hasQaHistory])

  async function confirm() {
    setPending(true)
    setFailure(null)

    try {
      await deleteTestScenario(testScenarioId, hasQaHistory)
      onDeleted()
    } catch (error: unknown) {
      if (!hasQaHistory && error instanceof ProjectApiError && error.status === 409 && error.code === 'scenario_has_qa_history') {
        setHasQaHistory(true)
        setPending(false)
        return
      }
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
    <Dialog
      title={t.scenarios.delete.title}
      labelledBy="delete-scenario-title"
      onClose={() => { if (!pending) onClose() }}
    >
      <p className="dialog-copy" role={hasQaHistory ? 'alert' : undefined}>
        {hasQaHistory
          ? t.scenarios.delete.historyWarning(name)
          : confirmationCopy ?? <><strong>{name}</strong>{t.scenarios.delete.copySuffix}</>}
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
          ref={cancelButton}
          type="button"
        >
          {t.scenarios.delete.cancel}
        </button>
        <button
          className="button button--danger"
          disabled={pending}
          onClick={() => void confirm()}
          type="button"
        >
          {pending
            ? t.scenarios.delete.pending
            : hasQaHistory ? t.scenarios.delete.confirmWithHistory : t.scenarios.delete.confirm}
        </button>
      </div>
    </Dialog>
  )
}
