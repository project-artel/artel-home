import { useI18n } from '../i18n/useI18n'
import { groupStepsByCase, type ScenarioDraft } from './scenarioTypes'

/**
 * Read-only view of a scenario as an ordered list of steps (재설계 2026-08-08).
 *
 * A scenario body is `steps[]`: one action each, with an optional `case_id`. A run
 * of consecutive steps sharing a `case_id` is one TestCase's verification region,
 * shown as a boxed group whose last step is the check; steps with no `case_id` are
 * plain actions rendered on their own. Manual editing (reorder/add, TC picker) is a
 * later track — for now the studio displays what the chat authored.
 */
export function ScenarioStepsView({ draft }: { draft: ScenarioDraft }) {
  const { t } = useI18n()
  const e = t.scenarios.stepsView
  const groups = groupStepsByCase(draft.steps)

  return (
    <main className="edoc-wrap">
      <div className="edoc st-steps">
        <header className="st-steps-head">
          <h1 className="st-steps-title">{draft.title.length > 0 ? draft.title : t.scenarios.page.untitled}</h1>
        </header>

        {draft.steps.length === 0 ? (
          <p className="st-steps-empty">{e.empty}</p>
        ) : (
          <ol className="st-steps-list">
            {groups.map((group, gi) =>
              group.caseId === null ? (
                group.steps.map((step, si) => (
                  <li key={`a-${group.indices[si]}`} className="st-step st-step--plain">
                    <span className="st-step-no">{group.indices[si] + 1}</span>
                    <span className="st-step-action">{step.action || e.noAction}</span>
                    {step.hint && <span className="st-step-hint">{step.hint}</span>}
                  </li>
                ))
              ) : (
                <li key={`c-${gi}`} className="st-tc">
                  <div className="st-tc-head">
                    <span className="st-tc-badge">TC</span>
                    <span className="st-tc-id">#{group.caseId}</span>
                    <span className="st-tc-meta">{e.caseSteps(group.steps.length)}</span>
                  </div>
                  <ol className="st-tc-steps">
                    {group.steps.map((step, si) => {
                      const isVerify = si === group.steps.length - 1
                      return (
                        <li
                          key={`c-${gi}-${si}`}
                          className={`st-step${isVerify ? ' st-step--verify' : ''}`}
                        >
                          <span className="st-step-no">{group.indices[si] + 1}</span>
                          <span className="st-step-action">{step.action || e.noAction}</span>
                          {isVerify && <span className="st-step-tag">{e.verify}</span>}
                          {step.hint && <span className="st-step-hint">{step.hint}</span>}
                        </li>
                      )
                    })}
                  </ol>
                </li>
              ),
            )}
          </ol>
        )}
      </div>
    </main>
  )
}
