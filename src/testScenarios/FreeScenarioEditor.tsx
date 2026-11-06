import { buildDisplayName } from '../projects/buildEnvironment'
import { useTestCaseLabel } from '../testCases/testCaseIdentifiers'
import { TestCaseHover } from '../testCases/TestCaseHover'
import { useMemo, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { SceneChip } from '../testCases/SceneChip'
import { AddCasesDialog } from './AddCasesDialog'
import type { RunGameBuild } from '../testRuns/testRunApi'
import { combineCaseListStatus, describeFreeCases, indexCasesById } from './freeScenarioCases'
import { FreeScenarioBadge } from './FreeScenarioBadge'
import { buildFreeCaseSteps } from './scenarioTypes'
import type { StepEditor } from './useStepEditor'
import { useProjectCases } from './useProjectCases'
import { InfoHint } from '../design-system/primitives/InfoHint'

/**
 * The body of a FREE scenario: its test cases, with no order to edit and no step text.
 *
 * Reads and writes the same draft as {@link ScenarioStepEditor}, so title edits, removals
 * and additions all go through the studio's autosave and undo. The number in the badge is
 * only the listing order here, and the QA agent picks its own; `TC #id` names the case
 * itself, so the badge and the label do not repeat one number.
 */
export function FreeScenarioEditor({
  build = null,
  editor,
  gameBuildId: gameBuildIdProp = null,
  projectId,
}: {
  /** TR 의 빌드 버전. 주면 `gameBuildId` 대신 쓰고, 이 빌드에 없는 케이스 표시에 버전 이름을 붙인다. */
  build?: RunGameBuild | null
  editor: StepEditor
  /** TR 의 버전(ARTEL-1070). 그 버전에 든 케이스를 그 버전 내용으로 보이고 고른다. 없으면 최신이다. */
  gameBuildId?: string | null
  projectId: string
}) {
  const { t } = useI18n()
  const caseLabel = useTestCaseLabel()
  const m = t.scenarios.free
  const { working } = editor
  const gameBuildId = build?.gameBuildId ?? gameBuildIdProp
  const buildName = build === null ? null : buildDisplayName(build)
  // 케이스 내용과 "프로젝트에 없음" 은 전체 목록으로 가린다. 빌드로 좁힌 목록만 보면 그 빌드에
  // `test_case_version` 행이 없는 케이스가 모두 지워진 것처럼 보인다.
  const projectCases = useProjectCases(projectId, true, null)
  const buildCases = useProjectCases(projectId, gameBuildId !== null, gameBuildId)
  const listStatus = combineCaseListStatus(projectCases.status, gameBuildId === null ? null : buildCases.status)
  // 추가 창은 그 빌드에 든 케이스만 내민다.
  const offered = gameBuildId === null ? projectCases : buildCases
  const [adding, setAdding] = useState(false)
  const rows = useMemo(
    () =>
      describeFreeCases(
        working.steps,
        indexCasesById(projectCases.cases),
        gameBuildId === null ? null : indexCasesById(buildCases.cases),
      ),
    [working.steps, projectCases.cases, buildCases.cases, gameBuildId],
  )
  const showCaseContent = listStatus === 'ready'

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
            <InfoHint>{m.hint}</InfoHint>
          </header>
          {editor.saveError !== null && <p className="st-editor-error">{t.scenarios.stepsEditor.saveFailed}</p>}

          <h2 className="free-heading">
            {m.heading} <span className="count-pill">{rows.length}</span>
          </h2>
          {listStatus === 'loading' && <p className="empty-note" role="status">{m.casesLoading}</p>}
          {listStatus === 'error' && <p className="st-editor-error" role="alert">{m.casesLoadFailed}</p>}
          {rows.length === 0 ? (
            <p className="empty-note">{m.empty}</p>
          ) : (
            <ul className="free-case-list">
              {rows.map((row) => (
                <li className="free-case" key={row.caseId}>
                  <span className="st-erow-no">{row.number}</span>
                  <div className="free-case-body">
                    <div className="free-case-head">
                      {showCaseContent && row.testCase !== null && <span className={`vdot ${row.testCase.verificationStatus}`} />}
                      <TestCaseHover projectId={projectId} caseId={row.caseId} gameBuildId={gameBuildId}><span className="free-case-label">{caseLabel(row.caseId)}</span></TestCaseHover>
                      {showCaseContent && (
                        <span className="free-case-title">
                          {row.testCase === null ? m.missingCase : row.testCase.step || m.missingCase}
                        </span>
                      )}
                      {showCaseContent && row.testCase !== null && <SceneChip scene={row.testCase.scene} />}
                      {showCaseContent && row.availability === 'notInBuild' && (
                        <>
                          <span className="free-case-flag">
                            <span aria-hidden="true">⚠</span> {m.notInBuild(buildName)}
                          </span>
                          <InfoHint>{m.notInBuildHint}</InfoHint>
                        </>
                      )}
                    </div>
                    {showCaseContent && row.testCase !== null && (
                      <p className="free-case-expected">
                        <span className="free-case-expected-label">{m.expected}</span>{' '}
                        {row.testCase.expectedValue.length > 0 ? row.testCase.expectedValue : m.noExpected}
                      </p>
                    )}
                  </div>
                  <button
                    aria-label={`${m.remove}: ${caseLabel(row.caseId)}`}
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
          project={offered}
          steps={working.steps}
        />
      )}
    </div>
  )
}
