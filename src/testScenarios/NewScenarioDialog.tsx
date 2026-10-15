import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { getRunScenarios, setRunScenarios } from '../testRuns/testRunApi'
import { CaseChecklist } from './CaseChecklist'
import { createFreeScenario } from './scenarioApi'
import { useProjectCases } from './useProjectCases'

/**
 * The run's scenario creation flow: first the kind, then, for FREE, the title and test cases.
 *
 * An ordered scenario is made by the caller (`onOrdered`), exactly as before the choice
 * existed. A FREE scenario is created here and appended to the run, then reported through
 * `onCreated` so the caller can open it.
 */
export function NewScenarioDialog({
  onClose,
  onCreated,
  onOrdered,
  projectId,
  runId,
}: {
  onClose: () => void
  onCreated: (testScenarioId: number) => void
  onOrdered: () => void
  projectId: string
  runId: string
}) {
  const { t } = useI18n()
  const m = t.scenarios.newDialog
  const titleId = useId()
  const inputId = useId()
  const [kind, setKind] = useState<'choose' | 'free'>('choose')
  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const project = useProjectCases(projectId, kind === 'free')

  function toggle(caseId: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(caseId)) next.add(caseId)
      return next
    })
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setFailure(null)
    try {
      // Keep the project's list order rather than the order of the clicks.
      const caseIds = project.cases.filter((testCase) => picked.has(testCase.id)).map((testCase) => testCase.id)
      const id = await createFreeScenario(Number(projectId), title.trim(), caseIds)
      const existing = await getRunScenarios(projectId, runId)
      await setRunScenarios(projectId, runId, [...existing.map((item) => item.testScenarioId), String(id)])
      onCreated(id)
    } catch {
      setFailure(m.free.failed)
      setPending(false)
    }
  }

  if (kind === 'choose') {
    return (
      <Dialog labelledBy={titleId} onClose={onClose} title={m.title}>
        <div className="form">
          <p className="dialog-copy">{m.copy}</p>
          <div className="new-kind-options">
            <button className="new-kind-option" onClick={onOrdered} type="button">
              <span className="new-kind-name">{m.ordered.name}</span>
              <span className="new-kind-hint">{m.ordered.hint}</span>
            </button>
            <button className="new-kind-option" onClick={() => setKind('free')} type="button">
              <span className="new-kind-name">{m.free.name}</span>
              <span className="new-kind-hint">{m.free.hint}</span>
            </button>
          </div>
          <div className="dialog-actions">
            <button className="button button--secondary" onClick={onClose} type="button">{m.cancel}</button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.free.title}>
      <form className="form new-free-form" onSubmit={(event) => void create(event)}>
        <div className="field">
          <label className="field-label" htmlFor={inputId}>{m.free.titleLabel}</label>
          <input
            className="field-input"
            id={inputId}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={m.free.titlePlaceholder}
            required
            value={title}
          />
        </div>
        <CaseChecklist onToggle={toggle} picked={picked} project={project} steps={[]} />
        {failure !== null && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {failure}
          </div>
        )}
        <div className="dialog-actions">
          <button className="button button--secondary" disabled={pending} onClick={() => setKind('choose')} type="button">
            {m.free.back}
          </button>
          <button
            className="button button--primary"
            disabled={pending || title.trim().length === 0 || picked.size === 0}
            type="submit"
          >
            {pending ? m.free.pending : m.free.confirm(picked.size)}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
