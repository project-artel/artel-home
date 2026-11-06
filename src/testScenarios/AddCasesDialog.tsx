import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { CaseChecklist } from './CaseChecklist'
import type { ScenarioStep } from './scenarioTypes'
import type { ProjectCases } from './useProjectCases'

/** Picks more test cases for a FREE scenario from those it does not hold yet. */
export function AddCasesDialog({
  onAdd,
  onClose,
  project,
  steps,
}: {
  onAdd: (caseIds: string[]) => void
  onClose: () => void
  project: ProjectCases
  steps: readonly ScenarioStep[]
}) {
  const { t } = useI18n()
  const m = t.scenarios.free.addDialog
  const titleId = useId()
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())

  function toggle(caseId: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(caseId)) next.add(caseId)
      return next
    })
  }

  function confirm() {
    // Keep the project's list order rather than the order of the clicks.
    onAdd(project.cases.filter((testCase) => picked.has(testCase.id)).map((testCase) => testCase.id))
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title}>
      <div className="form">
        <CaseChecklist onToggle={toggle} picked={picked} project={project} steps={steps} />
        <div className="dialog-actions">
          <button className="button button--secondary" onClick={onClose} type="button">{m.cancel}</button>
          <button
            className="button button--primary"
            disabled={picked.size === 0}
            onClick={confirm}
            type="button"
          >
            {m.confirm(picked.size)}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
