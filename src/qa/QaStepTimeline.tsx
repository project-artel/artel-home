import { useI18n } from '../i18n/useI18n'
import { groupStepsByCase, type ScenarioStep } from '../testScenarios/scenarioTypes'
import type { QaProgress, QaStepProgress, QaStepState } from './qaProgress'

/**
 * A horizontal, video-scrubber-style timeline of a scenario run (ARTEL-290): the
 * steps laid left-to-right, each coloured by its verdict, bracketed into the TC
 * (verification) regions they belong to. The TC bracket carries the region's
 * final verdict (its last step's), so a middle-step failure and the TC outcome
 * are both legible at a glance. Sits under the game like a play bar; clicking a
 * cell jumps to the log that judged that step.
 */
const STATE_GLYPHS: Record<QaStepState, string> = {
  passed: '✓',
  failed: '✕',
  running: '◐',
  pending: '○',
  unreported: '—',
  unknown: '?',
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
        const verdict = rows.at(-1)?.state ?? 'pending'
        if (verdict === 'passed') tcPassed += 1
        else if (verdict === 'failed') tcFailed += 1
        return { kind: 'tc' as const, key: `c${groupIndex}`, no: tcSeq, verdict, rows }
      })
    : [{ kind: 'plain' as const, key: 'all', rows: progress.steps }]

  return (
    <section className="qa-timeline" aria-label={s.title}>
      <div className="qa-timeline-head">
        <span className="qa-timeline-title">{s.title}</span>
        {tcSeq > 0 && <span className="qa-timeline-tc">{s.casesSummary(tcPassed, tcFailed, tcSeq)}</span>}
        <span className="qa-timeline-steps">{s.summary(progress.reported, progress.total, progress.passed, progress.failed)}</span>
      </div>

      <div className="qa-timeline-track">
        {blocks.map((block) => (
          <div
            key={block.key}
            className={`qa-tl-block${block.kind === 'tc' ? ` qa-tl-block--tc qa-tl-block--${block.verdict}` : ' qa-tl-block--plain'}`}
            // Each block claims width in proportion to its step count, so the whole
            // track fills the sector; cells keep a min-width so a run with many
            // steps stops shrinking and the track scrolls instead.
            style={{ flexGrow: Math.max(1, block.rows.length) }}
          >
            <div className={`qa-tl-cap${block.kind === 'tc' ? '' : ' qa-tl-cap--plain'}`}>
              {block.kind === 'tc' ? (
                <>
                  <span className="qa-tl-cap-no">{s.caseLabel(block.no)}</span>
                  <span className={`qa-tl-cap-verdict qa-tl-cap-verdict--${block.verdict}`}>
                    <span aria-hidden="true">{STATE_GLYPHS[block.verdict]}</span>{s.stateLabels[block.verdict]}
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
                const label = `${step.step}. ${title} — ${s.stateLabels[step.state]}`
                const cell = (
                  <>
                    <span className="qa-tl-cell-head">
                      <span aria-hidden="true" className="qa-tl-cell-glyph">{STATE_GLYPHS[step.state]}</span>
                      <span className="qa-tl-cell-no">{step.step}</span>
                    </span>
                    <span className="qa-tl-cell-name">{title}</span>
                  </>
                )
                const className = `qa-tl-cell qa-tl-cell--${step.state}${isVerify ? ' qa-tl-cell--verify' : ''}`
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
