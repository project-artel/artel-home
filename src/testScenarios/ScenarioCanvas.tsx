import { Fragment, useId } from 'react'
import {
  createEmptyStep,
  withSequentialSteps,
  type ScenarioDraft,
  type ScenarioStep,
} from './scenarioTypes'

/**
 * The scenario the agent produced, as an ordered list of steps the user can
 * revise.
 *
 * Edits live on the client until a message carries them: the server updates
 * `payload` only when the agent replies, and there is no endpoint that stores a
 * draft on its own. The panel says so rather than implying a save happened.
 *
 * `readOnly` is the state a closed conversation leaves behind. Editing steps
 * that can no longer be sent anywhere would produce work the user cannot
 * deliver, so the controls go away and the scenario stays readable.
 */
export function ScenarioCanvas({
  draft,
  dirty,
  onChange,
  readOnly,
}: {
  draft: ScenarioDraft
  dirty: boolean
  onChange: (draft: ScenarioDraft) => void
  readOnly: boolean
}) {
  const titleId = useId()
  const descriptionId = useId()

  function replaceSteps(steps: ScenarioStep[]) {
    onChange({ ...draft, steps: withSequentialSteps(steps) })
  }

  function moveStep(index: number, offset: number) {
    const target = index + offset
    if (target < 0 || target >= draft.steps.length) return

    const reordered = [...draft.steps]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    replaceSteps(reordered)
  }

  const empty = draft.steps.length === 0 && draft.title.length === 0

  return (
    <section className="panel scenario-canvas" aria-labelledby="scenario-canvas-title">
      <header className="panel-header panel-header--split">
        <div>
          <h2 id="scenario-canvas-title">Scenario</h2>
          <p className="scenario-hint">
            {readOnly
              ? 'Read-only. The conversation that produced this scenario is closed.'
              : 'Edits are sent with your next message. Nothing is stored until the agent replies.'}
          </p>
        </div>
        {dirty && !readOnly && (
          <span className="badge scenario-dirty">Unsent edits</span>
        )}
      </header>

      {empty && readOnly ? (
        <p className="panel-empty">
          This scenario has no steps. The conversation closed before the agent produced one.
        </p>
      ) : (
        <div className="scenario-fields">
          <div className="field">
            <label className="field-label" htmlFor={titleId}>Title</label>
            {readOnly ? (
              <p className="scenario-readonly-value">
                {draft.title.length > 0 ? draft.title : <span className="detail-empty">No title</span>}
              </p>
            ) : (
              <input
                className="field-input"
                id={titleId}
                onChange={(event) => onChange({ ...draft, title: event.target.value })}
                placeholder="Ask the agent for a scenario, or name one yourself"
                value={draft.title}
              />
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor={descriptionId}>Description</label>
            {readOnly ? (
              <p className="scenario-readonly-value">
                {draft.description.length > 0
                  ? draft.description
                  : <span className="detail-empty">No description</span>}
              </p>
            ) : (
              <textarea
                className="field-input field-input--multiline"
                id={descriptionId}
                onChange={(event) => onChange({ ...draft, description: event.target.value })}
                rows={2}
                value={draft.description}
              />
            )}
          </div>
        </div>
      )}

      {draft.steps.length === 0 ? (
        !readOnly && (
          <p className="panel-empty">
            No steps yet. Describe what you want tested in the conversation, or add the first step
            here.
          </p>
        )
      ) : (
        <ol className="scenario-steps">
          {draft.steps.map((step, index) => (
            <ScenarioStepCard
              canMoveDown={index < draft.steps.length - 1}
              canMoveUp={index > 0}
              key={index}
              onChange={(updated) =>
                replaceSteps(draft.steps.map((existing, at) => (at === index ? updated : existing)))
              }
              onMoveDown={() => moveStep(index, 1)}
              onMoveUp={() => moveStep(index, -1)}
              onRemove={() => replaceSteps(draft.steps.filter((_, at) => at !== index))}
              readOnly={readOnly}
              step={step}
            />
          ))}
        </ol>
      )}

      {!readOnly && (
        <div className="form-actions">
          <button
            className="button button--secondary button--compact"
            onClick={() => replaceSteps([...draft.steps, createEmptyStep()])}
            type="button"
          >
            Add step
          </button>
        </div>
      )}
    </section>
  )
}

const STEP_FIELDS = [
  { key: 'title', label: 'Title', hint: 'What this step covers' },
  { key: 'state', label: 'Starting state', hint: 'Where the game must be before the action' },
  { key: 'action', label: 'Action', hint: 'What the agent performs' },
  { key: 'expected', label: 'Expected result', hint: 'What proves the step passed' },
] as const

/**
 * One step. The four fields are shown in the order a tester reads them —
 * starting state, action, expected result — so a step can be judged without
 * cross-referencing the ones around it.
 */
function ScenarioStepCard({
  canMoveDown,
  canMoveUp,
  onChange,
  onMoveDown,
  onMoveUp,
  onRemove,
  readOnly,
  step,
}: {
  canMoveDown: boolean
  canMoveUp: boolean
  onChange: (step: ScenarioStep) => void
  onMoveDown: () => void
  onMoveUp: () => void
  onRemove: () => void
  readOnly: boolean
  step: ScenarioStep
}) {
  const fieldPrefix = useId()

  return (
    <li className="scenario-step">
      <header className="scenario-step-header">
        <span className="mono scenario-step-number">Step {step.step}</span>
        {!readOnly && (
          <div className="scenario-step-actions">
            <button
              aria-label={`Move step ${step.step} earlier`}
              className="button button--secondary button--compact"
              disabled={!canMoveUp}
              onClick={onMoveUp}
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Move step ${step.step} later`}
              className="button button--secondary button--compact"
              disabled={!canMoveDown}
              onClick={onMoveDown}
              type="button"
            >
              ↓
            </button>
            <button
              aria-label={`Remove step ${step.step}`}
              className="button button--danger-quiet button--compact"
              onClick={onRemove}
              type="button"
            >
              Remove
            </button>
          </div>
        )}
      </header>

      {readOnly ? (
        <dl className="detail-fields">
          {STEP_FIELDS.map((field) => (
            <Fragment key={field.key}>
              <dt>{field.label}</dt>
              <dd>
                {step[field.key].length > 0
                  ? step[field.key]
                  : <span className="detail-empty">Not specified</span>}
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        STEP_FIELDS.map((field) => (
          <div className="field" key={field.key}>
            <label className="field-label" htmlFor={`${fieldPrefix}-${field.key}`}>
              {field.label}
            </label>
            <input
              className="field-input"
              id={`${fieldPrefix}-${field.key}`}
              onChange={(event) => onChange({ ...step, [field.key]: event.target.value })}
              value={step[field.key]}
            />
            <p className="field-hint">{field.hint}</p>
          </div>
        ))
      )}
    </li>
  )
}
