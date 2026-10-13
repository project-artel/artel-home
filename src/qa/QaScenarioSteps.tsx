import { useI18n } from '../i18n/useI18n'
import { groupStepsByCase, type ScenarioStep } from '../testScenarios/scenarioTypes'
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

function stepRows(scenarioSteps: ScenarioStep[], progress: QaProgress | null): StepRow[] {
  if (progress !== null && progress.steps.length > 0) {
    return progress.steps.map((step) => ({ step: step.step, title: step.title, progress: step }))
  }
  return scenarioSteps.map((step, index) => ({ step: index + 1, title: step.action, progress: null }))
}

export function QaScenarioSteps({
  onJump,
  progress,
  scenarioSteps,
}: {
  onJump?: (logId: string) => void
  progress: QaProgress | null
  scenarioSteps: ScenarioStep[]
}) {
  const { t } = useI18n()
  const s = t.qa.steps
  const rows = stepRows(scenarioSteps, progress)
  if (rows.length === 0) return <p className="qa-rail-steps-empty">{t.qa.run.railNoSteps}</p>

  const rowByStep = new Map(rows.map((row) => [row.step, row]))
  const groups = scenarioSteps.length > 0 ? groupStepsByCase(scenarioSteps) : []
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
    const title = row.title.length > 0 ? row.title : s.untitled(row.step)
    const step = row.progress
    if (step === null) {
      return (
        <li key={row.step} className="qa-rail-step qa-rail-step--neutral">
          <span className="qa-rail-step-no">{row.step}</span>
          <span className="qa-rail-step-title">{title}</span>
        </li>
      )
    }

    const expectation =
      step.expectedPassed === null ? null : step.expectedPassed ? s.expected.passed : s.expected.failed
    // The tooltip is where an inverted colour is explained, so it names all three:
    // what happened, what was expected, and which way they went.
    const label = [
      `${row.step}. ${title} · ${s.stateLabels[step.state]}`,
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
        <span className="qa-rail-step-no">{row.step}</span>
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
    <div className="qa-rail-steps">
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
