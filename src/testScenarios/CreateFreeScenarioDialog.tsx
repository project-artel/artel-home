import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import type { TestCase } from '../testCases/testCaseTypes'
import { createFreeScenario } from './scenarioApi'

/**
 * Names a FREE scenario and creates it from the cases chosen in the test case list.
 * The caller closes the dialog and opens the scenario once `onCreated` fires.
 */
export function CreateFreeScenarioDialog({
  cases,
  onClose,
  onCreated,
  projectId,
}: {
  cases: readonly TestCase[]
  onClose: () => void
  onCreated: (testScenarioId: number) => void
  projectId: string
}) {
  const { t } = useI18n()
  const m = t.testCases.createFree
  const titleId = useId()
  const inputId = useId()
  const [title, setTitle] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function confirm(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setFailure(null)
    try {
      const testScenarioId = await createFreeScenario(
        Number(projectId),
        title.trim(),
        cases.map((testCase) => testCase.id),
      )
      onCreated(testScenarioId)
    } catch {
      setFailure(m.failed)
      setPending(false)
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title(cases.length)}>
      <form className="form" onSubmit={(event) => void confirm(event)}>
        <p className="dialog-copy">{m.copy}</p>
        <div className="field">
          <label className="field-label" htmlFor={inputId}>{m.titleLabel}</label>
          <input
            className="field-input"
            id={inputId}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={m.titlePlaceholder}
            required
            value={title}
          />
        </div>

        {failure !== null && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {failure}
          </div>
        )}

        <div className="dialog-actions">
          <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">
            {m.cancel}
          </button>
          <button className="button button--primary" disabled={pending || title.trim().length === 0} type="submit">
            {pending ? m.pending : m.confirm}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
