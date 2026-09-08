import { useI18n } from '../i18n/useI18n'
import { groupStepsByCase, type ScenarioStep } from '../testScenarios/scenarioTypes'
import type { QaProgress, QaStepGrade, QaStepProgress, QaStepState } from './qaProgress'

/**
 * A horizontal, video-scrubber-style timeline of a scenario run (ARTEL-290): the
 * steps laid left-to-right, each coloured by its verdict, bracketed into the TC
 * (verification) regions they belong to. The TC bracket carries the region's
 * final verdict (its last step's), so a middle-step failure and the TC outcome
 * are both legible at a glance. Sits under the game like a play bar; clicking a
 * cell jumps to the log that judged that step.
 *
 * A step someone wrote an expectation for (`expected_passed`, ARTEL-301) is drawn
 * against that expectation instead: green where the Agent's verdict matches it,
 * red where it does not. That inverts the colour on a step the game is supposed to
 * refuse — reporting it as failed is the right answer — so the glyph keeps showing
 * what actually happened and the cell is marked as graded. Ordinary projects have
 * no labels at all, and every step there reads exactly as it did before.
 */
const STATE_GLYPHS: Record<QaStepState, string> = {
  passed: '✓',
  failed: '✕',
  running: '◐',
  pending: '○',
  unreported: '—',
  unknown: '?',
}

/** The colour class for a cell or a TC cap: the grade wins wherever there is one. */
function toneClass(prefix: string, state: QaStepState, grade: QaStepGrade): string {
  return grade === null ? `${prefix}--${state}` : `${prefix}--grade-${grade}`
}

export function QaStepTimeline({
  onJump,
  progress,
  scenarioSteps,
}: {
  onJump: (logId: string) => void
  progress: QaProgress
  scenarioSteps: ScenarioStep[]
}) {
  const { t } = useI18n()
  const s = t.qa.steps
  if (progress.total === 0) return null

  const byStep = new Map(progress.steps.map((step) => [step.step, step]))
  const groups = groupStepsByCase(scenarioSteps)
  const grouped = scenarioSteps.length > 0 && groups.length > 0

  let tcSeq = 0
  let tcPassed = 0
  let tcFailed = 0

  const blocks = grouped
    ? groups.map((group, groupIndex) => {
        const rows = group.indices
          .map((index) => byStep.get(index + 1))
          .filter((step): step is QaStepProgress => step !== undefined)
        if (group.caseId === null) return { kind: 'plain' as const, key: `p${groupIndex}`, rows }
        tcSeq += 1
        const last = rows.at(-1)
        const verdict = last?.state ?? 'pending'
        // The TC counts stay a count of what the run concluded, graded or not: a
        // check the game refuses really did fail, and folding the grade in here
        // would leave the run with no line saying so.
        if (verdict === 'passed') tcPassed += 1
        else if (verdict === 'failed') tcFailed += 1
        return {
          kind: 'tc' as const,
          key: `c${groupIndex}`,
          no: tcSeq,
          verdict,
          grade: last?.grade ?? null,
          expectedPassed: last?.expectedPassed ?? null,
          rows,
        }
      })
    : [{ kind: 'plain' as const, key: 'all', rows: progress.steps }]

  return (
    <section className="qa-timeline" aria-label={s.title}>
      <div className="qa-timeline-head">
        <span className="qa-timeline-title">{s.title}</span>
        {tcSeq > 0 && <span className="qa-timeline-tc">{s.casesSummary(tcPassed, tcFailed, tcSeq)}</span>}
        <span className="qa-timeline-steps">{s.summary(progress.reported, progress.total, progress.passed, progress.failed)}</span>
        {progress.labeled > 0 && (
          <span className="qa-timeline-grade" title={s.gradeNote}>
            {s.gradeSummary(progress.correct, progress.wrong, progress.labeled)}
          </span>
        )}
      </div>

      <div className="qa-timeline-track">
        {blocks.map((block) => (
          <div
            key={block.key}
            className={`qa-tl-block${block.kind === 'tc' ? ` qa-tl-block--tc ${toneClass('qa-tl-block', block.verdict, block.grade)}` : ' qa-tl-block--plain'}`}
            // Each block claims width in proportion to its step count, so the whole
            // track fills the sector; cells keep a min-width so a run with many
            // steps stops shrinking and the track scrolls instead.
            style={{ flexGrow: Math.max(1, block.rows.length) }}
          >
            <div className={`qa-tl-cap${block.kind === 'tc' ? '' : ' qa-tl-cap--plain'}`}>
              {block.kind === 'tc' ? (
                <>
                  <span className="qa-tl-cap-no">{s.caseLabel(block.no)}</span>
                  <span
                    className={`qa-tl-cap-verdict ${toneClass('qa-tl-cap-verdict', block.verdict, block.grade)}`}
                    title={block.expectedPassed === null ? undefined : s.gradeNote}
                  >
                    <span aria-hidden="true">{STATE_GLYPHS[block.verdict]}</span>{s.stateLabels[block.verdict]}
                    {/* The cells' band, shrunk to fit a text row. Without something
                        here the cap reads as a red "Passed", which is the one way
                        this strip can mislead — and a glyph here would repeat the
                        verdict's own character, the noise the band replaced. */}
                    {block.expectedPassed !== null && (
                      <span
                        aria-hidden="true"
                        className={`qa-tl-cap-expect qa-tl-cap-expect--${block.expectedPassed ? 'passed' : 'failed'}`}
                      />
                    )}
                  </span>
                </>
              ) : (
                <span className="qa-tl-cap-label">{s.stepsHeading}</span>
              )}
            </div>
            <div className="qa-tl-cells">
              {block.rows.map((step, k) => {
                const isVerify = block.kind === 'tc' && k === block.rows.length - 1
                const title = step.title.length > 0 ? step.title : s.untitled(step.step)
                const expectation =
                  step.expectedPassed === null
                    ? null
                    : step.expectedPassed
                      ? s.expected.passed
                      : s.expected.failed
                // The tooltip is where the inverted colour is explained, so it names
                // all three: what happened, what was expected, and which way they went.
                const label = [
                  `${step.step}. ${title} — ${s.stateLabels[step.state]}`,
                  expectation,
                  step.grade === null ? null : s.gradeLabels[step.grade],
                ]
                  .filter((part): part is string => part !== null)
                  .join(' · ')
                const cell = (
                  <>
                    {/* The expectation gets its own band rather than a glyph beside
                        the verdict: a step expected to pass and one that did pass
                        drew the same character twice, which read as a rendering
                        slip instead of an answer. A band is a second channel — the
                        cell body says how the grading came out, this says what was
                        being graded against, and its absence says nothing was. */}
                    {step.expectedPassed !== null && (
                      <span
                        aria-hidden="true"
                        className={`qa-tl-cell-expect qa-tl-cell-expect--${step.expectedPassed ? 'passed' : 'failed'}`}
                      />
                    )}
                    <span className="qa-tl-cell-head">
                      <span aria-hidden="true" className="qa-tl-cell-glyph">{STATE_GLYPHS[step.state]}</span>
                      <span className="qa-tl-cell-no">{step.step}</span>
                    </span>
                    <span className="qa-tl-cell-name">{title}</span>
                  </>
                )
                const className = `qa-tl-cell ${toneClass('qa-tl-cell', step.state, step.grade)}${isVerify ? ' qa-tl-cell--verify' : ''}`
                return step.verdictLogId === null ? (
                  <span key={step.step} className={className} title={label}>{cell}</span>
                ) : (
                  <button key={step.step} className={`${className} qa-tl-cell--linked`} onClick={() => onJump(step.verdictLogId as string)} title={label} type="button">
                    {cell}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
