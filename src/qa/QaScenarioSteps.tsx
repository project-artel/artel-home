import { TestCaseHover } from '../testCases/TestCaseHover'
import { useI18n } from '../i18n/useI18n'
import type { VerificationStatus } from '../testCases/testCaseTypes'
import { indexCasesById } from '../testScenarios/freeScenarioCases'
import { groupStepsByCase, type ExecutionMode, type ScenarioStep } from '../testScenarios/scenarioTypes'
import { useProjectCases } from '../testScenarios/useProjectCases'
import type { QaProgress, QaStepGrade, QaStepProgress, QaStepState } from './qaProgress'
import { summarizeQaCases, type QaCaseReport } from './qaCaseProgress'

/**
 * TC 목록과 참고 절차를 시나리오 순서로 표시한다. TC 머리는 case_id에 맞는
 * 판정을 사용하고, 이전 실행 기록만 마지막 step 판정으로 표시한다.
 *
 * Only the focused scenario has a log stream, so only it gets `progress`: each
 * row then shows its verdict, and a judged row is a button that jumps to the log
 * that judged it. Any other scenario lists its step titles without a state, and
 * the list says so instead of drawing every step as pending.
 *
 * A step someone wrote an expectation for (`expected_passed`, ARTEL-301) is
 * coloured by whether the Agent's verdict matched it, not by the verdict itself.
 * The glyph keeps showing what actually happened, and the band at the row's left
 * edge shows what was expected.
 */
const STATE_GLYPHS: Record<QaStepState, string> = {
  passed: '✓',
  failed: '✕',
  inconclusive: '?',
  running: '◐',
  pending: '○',
  unreported: '—',
  unknown: '?',
}

type StepRow = {
  step: number
  title: string
  /** `null` on a scenario that is not focused: nothing here knows its verdicts. */
  progress: QaStepProgress | null
}

/** The colour class for a row or a TC head: the grade wins wherever there is one. */
function toneClass(prefix: string, state: QaStepState, grade: QaStepGrade): string {
  return grade === null ? `${prefix}--${state}` : `${prefix}--grade-${grade}`
}

function stepRows(
  scenarioSteps: ScenarioStep[],
  progress: QaProgress | null,
  titleOf: (stepNumber: number, fallback: string) => string,
): StepRow[] {
  if (progress !== null && progress.steps.length > 0) {
    return progress.steps.map((step) => ({ step: step.step, title: titleOf(step.step, step.title), progress: step }))
  }
  return scenarioSteps.map((step, index) => ({ step: index + 1, title: titleOf(index + 1, step.action), progress: null }))
}

export function QaScenarioSteps({
  caseVerdicts = new Map(),
  caseReports = new Map(),
  executionMode = 'ORDERED',
  gameBuildId = null,
  onJump,
  progress,
  projectId,
  scenarioSteps,
}: {
  /**
   * FREE의 한 행은 TC다. 실행 순서와 무관하게 case_id로 판정을 대응하고
   * 화면의 행 순서는 시나리오 순서를 유지한다.
   */
  executionMode?: ExecutionMode
  /** 판정 기준 버전(ARTEL-1070, TR 의 버전). FREE 시나리오의 케이스 내용을 이 버전으로 읽는다. 없으면 최신이다. */
  gameBuildId?: string | null
  projectId: string
  /** 서버가 TC 상태로 저장한 판정(ARTEL-995). TC 머리에 저장된 상태를 점으로 따로 보인다. */
  caseVerdicts?: ReadonlyMap<string, VerificationStatus>
  caseReports?: ReadonlyMap<string, QaCaseReport>
  onJump?: (logId: string) => void
  progress: QaProgress | null
  scenarioSteps: ScenarioStep[]
}) {
  const { t } = useI18n()
  const s = t.qa.steps
  const isFree = executionMode === 'FREE'
  // The case list is read only for a FREE scenario, whose rows have no text of their own
  // until a run starts: the server fills a blank `action` from the case then.
  const projectCases = useProjectCases(projectId, isFree, gameBuildId)
  const casesById = indexCasesById(projectCases.cases)
  const titleOf = (stepNumber: number, fallback: string): string => {
    if (!isFree) return fallback
    const caseId = scenarioSteps[stepNumber - 1]?.case_id
    const testCase = caseId === null || caseId === undefined ? undefined : casesById.get(String(caseId))
    return testCase !== undefined && testCase.step.length > 0 ? testCase.step : fallback
  }
  const rows = stepRows(scenarioSteps, progress, titleOf)
  const caseSummary = summarizeQaCases(scenarioSteps, caseReports)
  const hasCaseReports = scenarioSteps.some((step) => caseReports.get(String(step.case_id))?.source === 'case_report')
  const summary = hasCaseReports ? caseSummary : progress
  if (rows.length === 0) return <p className="qa-rail-steps-empty">{t.qa.run.railNoSteps}</p>

  const rowByStep = new Map(rows.map((row) => [row.step, row]))
  // A FREE scenario has no regions to nest: every step is its own test case.
  const groups = scenarioSteps.length > 0 && !isFree ? groupStepsByCase(scenarioSteps) : []
  const blocks =
    groups.length > 0
      ? groups.map((group, groupIndex) => ({
          caseId: group.caseId,
          // TCs are numbered among themselves, skipping the plain steps between them.
          caseNumber: groups.slice(0, groupIndex + 1).filter((candidate) => candidate.caseId !== null).length,
          rows: group.indices
            .map((index) => rowByStep.get(index + 1))
            .filter((row): row is StepRow => row !== undefined),
        }))
      : [{ caseId: null, caseNumber: 0, rows }]

  function renderRow(row: StepRow) {
    const title = row.title.length > 0 ? row.title : isFree ? s.caseLabel(row.step) : s.untitled(row.step)
    const numberLabel = isFree ? s.caseLabel(row.step) : String(row.step)
    // TC 판정이 참고 절차 각각의 완료나 진행 위치를 뜻하지는 않는다.
    const step = !isFree && hasCaseReports && row.progress !== null
      && !['passed', 'failed', 'inconclusive'].includes(row.progress.state) ? null : row.progress
    if (step === null) {
      return (
        <li key={row.step} className="qa-rail-step qa-rail-step--neutral">
          <TestCaseHover projectId={projectId} caseId={isFree ? scenarioSteps[row.step - 1]?.case_id : null} gameBuildId={gameBuildId}><span className="qa-rail-step-no">{numberLabel}</span></TestCaseHover>
          <span className="qa-rail-step-title">{title}</span>
        </li>
      )
    }

    const expectation =
      step.expectedPassed === null ? null : step.expectedPassed ? s.expected.passed : s.expected.failed
    // The tooltip is where an inverted colour is explained, so it names all three:
    // what happened, what was expected, and which way they went.
    const label = [
      `${numberLabel}. ${title} · ${s.stateLabels[step.state]}`,
      expectation,
      step.grade === null ? null : s.gradeLabels[step.grade],
    ]
      .filter((part): part is string => part !== null)
      .join(' · ')
    const body = (
      <>
        {step.expectedPassed !== null && (
          <span
            aria-hidden="true"
            className={`qa-rail-step-expect qa-rail-step-expect--${step.expectedPassed ? 'passed' : 'failed'}`}
          />
        )}
        <span aria-hidden="true" className="qa-rail-step-glyph">{STATE_GLYPHS[step.state]}</span>
        <TestCaseHover projectId={projectId} caseId={isFree ? scenarioSteps[row.step - 1]?.case_id : null} gameBuildId={gameBuildId}><span className="qa-rail-step-no">{numberLabel}</span></TestCaseHover>
        <span className="qa-rail-step-title">{title}</span>
        <span className="visually-hidden">{s.stateLabels[step.state]}</span>
      </>
    )
    const className = `qa-rail-step ${toneClass('qa-rail-step', step.state, step.grade)}`
    const verdictLogId = step.verdictLogId
    return (
      <li key={row.step}>
        {verdictLogId === null || onJump === undefined ? (
          <span className={className} title={label}>{body}</span>
        ) : (
          <button className={`${className} qa-rail-step--linked`} onClick={() => onJump(verdictLogId)} title={label} type="button">
            {body}
          </button>
        )}
      </li>
    )
  }

  return (
    <div className={isFree ? 'qa-rail-steps qa-rail-steps--free' : 'qa-rail-steps'}>
      {isFree && (
        <p className="qa-rail-steps-note">
          <span className="free-badge">{s.freeBadge}</span> {s.freeNote}
        </p>
      )}
      {progress === null && <p className="qa-rail-steps-note">{t.qa.run.railVerdictsWhenOpen}</p>}
      {summary !== null && summary.total > 0 && (
        <p className="qa-rail-steps-note mono">
          {s.summary(summary.reported, summary.total, summary.passed, summary.failed)}
        </p>
      )}
      <ol className="qa-rail-step-list">
        {blocks.map((block, blockIndex) => {
          if (block.caseId === null) return block.rows.map(renderRow)
          const last = block.rows.at(-1)?.progress ?? null
          const caseReport = caseReports.get(String(block.caseId))
          const report = caseReport?.source === 'case_report' ? caseReport : undefined
          const state = report?.state ?? last?.state
          const grade = report === undefined ? last?.grade ?? null : null
          const logId = report?.logId ?? last?.verdictLogId
          const label = state === undefined ? null : `${s.caseLabel(block.caseNumber)} · ${s.stateLabels[state]}`
          const verdict = state === undefined ? null : (
            <><span aria-hidden="true">{STATE_GLYPHS[state]}</span>{s.stateLabels[state]}</>
          )
          return (
            <li key={`case-${blockIndex}`} className="qa-rail-case">
              <div className="qa-rail-case-head">
                <TestCaseHover projectId={projectId} caseId={block.caseId} gameBuildId={gameBuildId}><span className="qa-rail-case-no">{s.caseLabel(block.caseNumber)}</span></TestCaseHover>
                {caseVerdicts.has(String(block.caseId)) && (
                  <SavedVerdict status={caseVerdicts.get(String(block.caseId)) as VerificationStatus} />
                )}
                {state !== undefined && (logId == null || onJump === undefined ? (
                  <span className={`qa-rail-case-verdict ${toneClass('qa-rail-case-verdict', state, grade)}`} title={label ?? undefined}>{verdict}</span>
                ) : (
                  <button type="button" className={`qa-rail-case-verdict ${toneClass('qa-rail-case-verdict', state, grade)}`}
                    aria-label={label ?? undefined} onClick={() => onJump(logId)}>{verdict}</button>
                ))}
              </div>
              <ol className="qa-rail-step-list">{block.rows.map(renderRow)}</ol>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * 서버가 이 TC 에 실제로 저장한 상태. 옆의 판정(agent 의 말)과 늘 같지는 않다 — `BROKEN` 인 TC 는
 * 판정이 와도 저장되지 않는다. 그래서 따로 보인다.
 */
function SavedVerdict({ status }: { status: VerificationStatus }) {
  const { t } = useI18n()
  return (
    <span className="qa-rail-case-saved" title={t.qa.steps.savedTitle(t.testCases.outcome[status])}>
      <span className={`vdot vdot--${status.toLowerCase()}`} />
      <span className="visually-hidden">{t.qa.steps.savedTitle(t.testCases.outcome[status])}</span>
    </span>
  )
}
