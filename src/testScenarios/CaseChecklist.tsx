import { useId, useMemo, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { SceneChip } from '../testCases/SceneChip'
import type { TestCase } from '../testCases/testCaseTypes'
import { selectAddableCases } from './freeScenarioCases'
import type { ScenarioStep } from './scenarioTypes'
import type { ProjectCases } from './useProjectCases'

/**
 * Search box and checkbox list of the project's test cases that a FREE scenario does not
 * hold yet. Shared by the dialog that adds cases to a FREE scenario and the one that
 * creates a FREE scenario, so both pick cases the same way. The caller owns `picked`.
 */
export function CaseChecklist({
  onToggle,
  picked,
  project,
  steps,
}: {
  onToggle: (caseId: string) => void
  picked: ReadonlySet<string>
  project: ProjectCases
  /** Steps the scenario already holds; their cases are not offered again. */
  steps: readonly ScenarioStep[]
}) {
  const { t } = useI18n()
  const m = t.scenarios.free.addDialog
  const searchId = useId()
  const [query, setQuery] = useState('')
  const addable = useMemo(() => selectAddableCases(project.cases, steps, ''), [project.cases, steps])
  const shown = useMemo(() => selectAddableCases(project.cases, steps, query), [project.cases, steps, query])

  if (project.status === 'loading') return <p className="dialog-copy" role="status">{m.loading}</p>
  if (project.status === 'error') return <p className="inline-error" role="alert">{m.loadFailed}</p>

  return (
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
                  onChange={() => onToggle(testCase.id)}
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
  )
}

function describe(testCase: TestCase): string {
  return testCase.step.length > 0 ? testCase.step : testCase.id
}
