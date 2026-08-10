import { useI18n } from '../i18n/useI18n'
import { groupStepsByCase, type ScenarioStep } from '../testScenarios/scenarioTypes'
import type { QaProgress, QaStepProgress, QaStepState } from './qaProgress'

/**
 * 2-tier judgment view of a scenario run (ARTEL-290 #4): what happened to every
 * STEP, and — for each TC (a verification region = consecutive steps sharing a
 * case_id, as defined by the scenario) — its final verdict, taken from the
 * region's last (verification) step.
 *
 * A middle step can fail while the TC still passes, or vice-versa, so both tiers
 * are shown: each TC is a card carrying its verdict, with its steps nested; steps
 * that belong to no case render as plain rows. The regions come from the scenario
 * (`groupStepsByCase`), so this needs the scenario steps; without them it degrades
 * to a flat step list.
 */
const STATE_GLYPHS: Record<QaStepState, string> = {
  passed: '✓',
  failed: '✕',
  running: '◐',
  pending: '○',
  unreported: '—',
  unknown: '?',
}

function StepRow({
  onJump,
  step,
  isVerification,
}: {
  onJump: (logId: string) => void
  step: QaStepProgress
  isVerification: boolean
}) {
  const { t } = useI18n()
  const s = t.qa.steps
  const title = step.title.length > 0 ? step.title : s.untitled(step.step)
  const body = (
    <>
      <span aria-hidden="true" className="qa-row-glyph">{STATE_GLYPHS[step.state]}</span>
      <span className="qa-row-no mono" translate="no">{step.step}</span>
      <span className="qa-row-title">{title}</span>
      {isVerification && <span className="qa-row-tag">{s.verification}</span>}
      <span className="qa-row-state">{s.stateLabels[step.state]}</span>
    </>
  )
  return (
    <li className={`qa-row qa-row--${step.state}${isVerification ? ' qa-row--verify' : ''}`}>
      {step.verdictLogId === null ? (
        <span className="qa-row-body">{body}</span>
      ) : (
        <button className="qa-row-body qa-row-body--linked" onClick={() => onJump(step.verdictLogId as string)} title={step.verdict ?? undefined} type="button">
          {body}
          <span className="sr-status">{s.jump(step.step)}</span>
        </button>
      )}
    </li>
  )
}

export function QaCaseProgress({
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

  const stepSummary = s.summary(progress.reported, progress.total, progress.passed, progress.failed)

  // Fallback: no scenario steps to define regions → a flat step list.
  if (!grouped) {
    return (
      <section className="qa-tiers" aria-labelledby="qa-tiers-title">
        <header className="qa-tiers-head">
          <h2 id="qa-tiers-title">{s.title}</h2>
          <p className="qa-tiers-summary">{stepSummary}</p>
        </header>
        <ol className="qa-tiers-list">
          {progress.steps.map((step) => (
            <StepRow key={step.step} onJump={onJump} step={step} isVerification={false} />
          ))}
        </ol>
      </section>
    )
  }

  let tcSeq = 0
  let tcPassed = 0
  let tcFailed = 0
  const blocks = groups.map((group, groupIndex) => {
    const rows = group.indices
      .map((index) => byStep.get(index + 1))
      .filter((step): step is QaStepProgress => step !== undefined)
    if (group.caseId === null) {
      return { kind: 'plain' as const, key: `p${groupIndex}`, rows }
    }
    tcSeq += 1
    const verdict = rows.at(-1)?.state ?? 'pending'
    if (verdict === 'passed') tcPassed += 1
    else if (verdict === 'failed') tcFailed += 1
    return { kind: 'tc' as const, key: `c${groupIndex}`, no: tcSeq, verdict, rows, lastStep: group.indices.length - 1 }
  })
  const casesSummary = s.casesSummary(tcPassed, tcFailed, tcSeq)

  return (
    <section className="qa-tiers" aria-labelledby="qa-tiers-title">
      <header className="qa-tiers-head">
        <h2 id="qa-tiers-title">{s.title}</h2>
        {tcSeq > 0 && <p className="qa-tiers-summary qa-tiers-summary--tc">{casesSummary}</p>}
        <p className="qa-tiers-summary">{stepSummary}</p>
      </header>

      <div className="qa-tiers-list">
        {blocks.map((block) =>
          block.kind === 'tc' ? (
            <section key={block.key} className={`qa-tc qa-tc--${block.verdict}`}>
              <header className="qa-tc-head">
                <span className="qa-tc-badge">{s.caseLabel(block.no)}</span>
                <span className={`qa-tc-verdict qa-tc-verdict--${block.verdict}`}>
                  <span aria-hidden="true">{STATE_GLYPHS[block.verdict]}</span>
                  {s.stateLabels[block.verdict]}
                </span>
              </header>
              <ol className="qa-tc-steps">
                {block.rows.map((step, k) => (
                  <StepRow key={step.step} onJump={onJump} step={step} isVerification={k === block.lastStep} />
                ))}
              </ol>
            </section>
          ) : (
            <ol key={block.key} className="qa-plain-steps">
              {block.rows.map((step) => (
                <StepRow key={step.step} onJump={onJump} step={step} isVerification={false} />
              ))}
            </ol>
          ),
        )}
      </div>
    </section>
  )
}
