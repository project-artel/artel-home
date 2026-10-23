import { useI18n } from '../i18n/useI18n'
import type { VerificationStatus } from '../testCases/testCaseTypes'
import { indexCasesById } from '../testScenarios/freeScenarioCases'
import { groupStepsByCase, type ExecutionMode, type ScenarioStep } from '../testScenarios/scenarioTypes'
import { useProjectCases } from '../testScenarios/useProjectCases'
import type { QaProgress, QaStepGrade, QaStepProgress, QaStepState } from './qaProgress'

/**
 * A scenario's steps as a vertical list under its rail item, top to bottom in run
 * order, with the steps of one TC (verification region) nested under a head that
 * carries the region's verdict — its last step's.
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
  executionMode = 'ORDERED',
  gameBuildId = null,
  onJump,
  progress,
  projectId,
  scenarioSteps,
}: {
  /**
   * In a `FREE` scenario each step is one test case, listed as "TC n" with the case's own
   * text, and the agent decides the order. Rows stay in scenario order and verdicts are
   * matched by step number, so a verdict arriving out of order lands on its own row.
   */
  executionMode?: ExecutionMode
  /** 판정 기준 버전(ARTEL-1070, TR 의 버전). FREE 시나리오의 케이스 내용을 이 버전으로 읽는다. 없으면 최신이다. */
  gameBuildId?: string | null
  projectId: string
  /** 서버가 TC 상태로 저장한 판정(ARTEL-995). TC 머리에 저장된 상태를 점으로 따로 보인다. */
  caseVerdicts?: ReadonlyMap<string, VerificationStatus>
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
    const step = row.progress
    if (step === null) {
      return (
        <li key={row.step} className="qa-rail-step qa-rail-step--neutral">
          <span className="qa-rail-step-no">{numberLabel}</span>
          <span className="qa-rail-step-title">{title}</span>
        </li>
      )
    }

    const expectation =
      step.expectedPassed === null ? null : step.expectedPassed ? s.expected.passed : s.expected.failed
    // The tooltip is where an inverted colour is explained, so it names all three:
    // what happened, what was expected, and which way they went.
    const cheatNames = step.usedCheats.map((used) => used.name)
    const label = [
      `${numberLabel}. ${title} · ${s.stateLabels[step.state]}`,
      expectation,
      cheatNames.length === 0 ? null : `${t.gameFunctions.timeline.usedCheats(cheatNames.length)}: ${cheatNames.join(', ')}`,
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
        <span className="qa-rail-step-no">{numberLabel}</span>
        <span className="qa-rail-step-title">{title}</span>
        {step.usedCheats.length > 0 && (
          <span className="gf-badge" translate="no">
            {t.gameFunctions.timeline.cheatBadge}
            {step.usedCheats.length > 1 && <span className="mono"> ×{step.usedCheats.length}</span>}
          </span>
        )}
        <span className="visually-hidden">{s.stateLabels[step.state]}</span>
      </>
    )
    const className = `qa-rail-step ${toneClass('qa-rail-step', step.state, step.grade)}${step.usedCheats.length > 0 ? ' qa-rail-step--cheat' : ''}`
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
      {progress !== null && progress.total > 0 && (
        <p className="qa-rail-steps-note mono">
          {s.summary(progress.reported, progress.total, progress.passed, progress.failed)}
        </p>
      )}
      <ol className="qa-rail-step-list">
        {blocks.map((block, blockIndex) => {
          if (block.caseId === null) return block.rows.map(renderRow)
          const last = block.rows.at(-1)?.progress ?? null
          return (
            <li key={`case-${blockIndex}`} className="qa-rail-case">
              <div className="qa-rail-case-head">
                <span className="qa-rail-case-no">{s.caseLabel(block.caseNumber)}</span>
                {caseVerdicts.has(String(block.caseId)) && (
                  <SavedVerdict status={caseVerdicts.get(String(block.caseId)) as VerificationStatus} />
                )}
                {last !== null && (
                  <span className={`qa-rail-case-verdict ${toneClass('qa-rail-case-verdict', last.state, last.grade)}`}>
                    <span aria-hidden="true">{STATE_GLYPHS[last.state]}</span>
                    {s.stateLabels[last.state]}
                  </span>
                )}
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
