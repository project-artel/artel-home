import { useId, useMemo, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { SceneChip } from '../testCases/SceneChip'
import type { TestCase } from '../testCases/testCaseTypes'
import { selectAddableCases } from './freeScenarioCases'
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
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const addable = useMemo(() => selectAddableCases(project.cases, steps, ''), [project.cases, steps])
  const shown = useMemo(() => selectAddableCases(project.cases, steps, query), [project.cases, steps, query])

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

  function describe(testCase: TestCase): string {
    return testCase.step.length > 0 ? testCase.step : testCase.id
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title}>
      <div className="form">
        {project.status === 'loading' && <p className="dialog-copy" role="status">{m.loading}</p>}
        {project.status === 'error' && <p className="inline-error" role="alert">{m.loadFailed}</p>}
        {project.status === 'ready' && (
          <>
            <div className="field">
              <label className="field-label" htmlFor={searchId}>{m.search}</label>
              <input
                className="field-input"
                id={searchId}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={m.searchPlaceholder}
                type="search"
                value={query}
              />
            </div>
            {addable.length === 0 ? (
              <p className="dialog-copy">{m.empty}</p>
            ) : shown.length === 0 ? (
              <p className="dialog-copy">{m.noMatch}</p>
            ) : (
              <ul className="free-add-list">
                {shown.map((testCase) => (
                  <li key={testCase.id}>
                    <label className="free-add-row">
                      <input
                        aria-label={m.selectRow(describe(testCase))}
                        checked={picked.has(testCase.id)}
                        onChange={() => toggle(testCase.id)}
                        type="checkbox"
                      />
                      <span className={`vdot ${testCase.verificationStatus}`} />
                      <span className="free-add-text">{describe(testCase)}</span>
                      <SceneChip scene={testCase.scene} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
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
