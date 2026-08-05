import { useI18n } from '../i18n/useI18n'
import type { QaProgress, QaStepProgress, QaStepState } from './qaProgress'

/**
 * A shape per state, so the strip is readable without color — the states differ
 * by glyph first and by token second.
 */
const STATE_GLYPHS: Record<QaStepState, string> = {
  passed: '✓',
  failed: '✕',
  running: '◐',
  pending: '○',
  unreported: '—',
  unknown: '?',
}

function QaStepChip({
  onJump,
  step,
}: {
  onJump: (logId: string) => void
  step: QaStepProgress
}) {
  const { t } = useI18n()
  const labels = t.qa.steps.stateLabels
  const notes = t.qa.steps.stateNotes
  const stateLabel = labels[step.state]
  const title = step.title.length > 0 ? step.title : t.qa.steps.untitled(step.step)
  // The note explains a state the user cannot verify from the strip itself; the
  // verdict explains one they can, and it reads in full at the jump target.
  const note =
    step.state === 'running' || step.state === 'unreported' || step.state === 'unknown'
      ? notes[step.state]
      : step.verdict

  const body = (
    <>
      <span aria-hidden="true" className="qa-step-glyph">
        {STATE_GLYPHS[step.state]}
      </span>
      <span className="qa-step-index mono" translate="no">
        {step.step}
      </span>
      <span className="qa-step-title">{title}</span>
      <span className="qa-step-state">{stateLabel}</span>
      {note !== null && <span className="sr-status">{note}</span>}
    </>
  )

  const jumpTarget = step.verdictLogId

  return (
    <li className={`qa-step qa-step--${step.state}`}>
      {jumpTarget === null ? (
        <span className="qa-step-body">{body}</span>
      ) : (
        <button
          className="qa-step-body qa-step-body--linked"
          onClick={() => onJump(jumpTarget)}
          title={step.verdict ?? undefined}
          type="button"
        >
          {body}
          <span className="sr-status">{t.qa.steps.jump(step.step)}</span>
        </button>
      )}
    </li>
  )
}

/**
 * The run's shape at a glance: every scenario step, what happened to it, and a
 * way into the evidence.
 *
 * The verdict text is deliberately not repeated as visible copy. It was written
 * about a moment in the log, and the click sends the reader to that moment
 * instead of to a copy of it that has lost its surroundings.
 */
export function QaStepStrip({
  onJump,
  progress,
}: {
  onJump: (logId: string) => void
  progress: QaProgress
}) {
  const { t } = useI18n()
  if (progress.total === 0) return null

  const summary = t.qa.steps.summary(
    progress.reported,
    progress.total,
    progress.passed,
    progress.failed,
  )
  const anyLinked = progress.steps.some((step) => step.verdictLogId !== null)

  return (
    <section aria-labelledby="qa-steps-title" className="qa-steps">
      <header className="qa-steps-header">
        <h2 id="qa-steps-title">{t.qa.steps.title}</h2>
        <p className="qa-steps-summary">{summary}</p>
      </header>

      {/* Decorative: the same numbers are already stated above in words. */}
      <div aria-hidden="true" className="qa-steps-meter">
        <span
          className="qa-steps-meter-fill"
          style={{ inlineSize: `${(progress.reported / progress.total) * 100}%` }}
        />
      </div>

      <ol className="qa-step-list">
        {progress.steps.map((step) => (
          <QaStepChip key={step.step} onJump={onJump} step={step} />
        ))}
      </ol>

      {anyLinked && <p className="qa-steps-hint">{t.qa.steps.jumpHint}</p>}

      {/* One summarized announcement per change, never one per log. */}
      <p aria-live="polite" className="sr-status">
        {summary}
      </p>
    </section>
  )
}
