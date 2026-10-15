import { useMemo, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { SceneChip } from '../testCases/SceneChip'
import { AddCasesDialog } from './AddCasesDialog'
import { describeFreeCases, indexCasesById } from './freeScenarioCases'
import { FreeScenarioBadge } from './FreeScenarioBadge'
import { buildFreeCaseSteps } from './scenarioTypes'
import type { StepEditor } from './useStepEditor'
import { useProjectCases } from './useProjectCases'

/**
 * The body of a FREE scenario: its test cases, with no order to edit and no step text.
 *
 * Reads and writes the same draft as {@link ScenarioStepEditor}, so title edits, removals
 * and additions all go through the studio's autosave and undo. The number in the badge is
 * only the listing order here, and the QA agent picks its own; `TC #id` names the case
 * itself, so the badge and the label do not repeat one number.
 */
export function FreeScenarioEditor({
  editor,
  gameBuildId = null,
  projectId,
}: {
  editor: StepEditor
  /** TR 의 버전(ARTEL-1070). 그 버전에 든 케이스를 그 버전 내용으로 보이고 고른다. 없으면 최신이다. */
  gameBuildId?: string | null
  projectId: string
}) {
  const { t } = useI18n()
  const m = t.scenarios.free
  const { working } = editor
  const project = useProjectCases(projectId, true, gameBuildId)
  const [adding, setAdding] = useState(false)
  const rows = useMemo(
    () => describeFreeCases(working.steps, indexCasesById(project.cases)),
    [working.steps, project.cases],
  )

  return (
    <div className="edoc-shell at-top at-bottom">
      <main className="edoc-wrap">
        <div className="edoc st-editor">
          <header className="st-editor-head">
            <input
              aria-label={t.scenarios.stepsEditor.titleLabel}
              className="st-editor-title"
              onChange={(event) => editor.setTitle(event.target.value)}
              placeholder={t.scenarios.page.untitled}
              value={working.title}
            />
            <FreeScenarioBadge />
          </header>
          <p className="free-hint">{m.hint}</p>
          {editor.saveError !== null && <p className="st-editor-error">{t.scenarios.stepsEditor.saveFailed}</p>}

          <h2 className="free-heading">
            {m.heading} <span className="count-pill">{rows.length}</span>
          </h2>
          {rows.length === 0 ? (
            <p className="empty-note">{m.empty}</p>
          ) : (
            <ul className="free-case-list">
              {rows.map((row) => (
                <li className="free-case" key={row.caseId}>
                  <span className="st-erow-no">{row.number}</span>
                  <div className="free-case-body">
                    <div className="free-case-head">
                      {row.testCase !== null && <span className={`vdot ${row.testCase.verificationStatus}`} />}
                      <span className="free-case-label">{m.tcLabel(row.caseId)}</span>
                      <span className="free-case-title">
                        {row.testCase === null ? m.missingCase : row.testCase.step || m.missingCase}
                      </span>
                      {row.testCase !== null && <SceneChip scene={row.testCase.scene} />}
                    </div>
                    {row.testCase !== null && (
                      <p className="free-case-expected">
                        <span className="free-case-expected-label">{m.expected}</span>{' '}
                        {row.testCase.expectedValue.length > 0 ? row.testCase.expectedValue : m.noExpected}
                      </p>
                    )}
                  </div>
                  <button
                    aria-label={`${m.remove}: ${m.tcLabel(row.caseId)}`}
                    className="iconbtn iconbtn--danger"
                    onClick={() => editor.removeStep(row.index)}
                    title={m.remove}
                    type="button"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="st-editor-add" onClick={() => setAdding(true)} type="button">＋ {m.add}</button>
        </div>
      </main>
      {adding && (
        <AddCasesDialog
          onAdd={(caseIds) => {
            editor.appendSteps(buildFreeCaseSteps(caseIds))
            setAdding(false)
          }}
          onClose={() => setAdding(false)}
          project={project}
          steps={working.steps}
        />
      )}
    </div>
  )
}
