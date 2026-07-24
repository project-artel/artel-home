import { Fragment, useId, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import {
  createEmptyStep,
  withSequentialSteps,
  type ScenarioDraft,
  type ScenarioStep,
} from './scenarioTypes'

/**
 * The scenario the agent produced, as a row of step nodes the user can revise.
 *
 * The steps are laid out as a flow rather than a form: their order is the
 * scenario, so it has to be the thing you see first. Each node is a small card
 * carrying only what identifies it, and the four fields open in one editor
 * below the flow when a node is selected — with a dozen steps on screen,
 * inlining four inputs into every card would bury the sequence under its own
 * detail.
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
  saving,
  onChange,
  readOnly,
}: {
  draft: ScenarioDraft
  dirty: boolean
  saving: boolean
  onChange: (draft: ScenarioDraft) => void
  readOnly: boolean
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const [selected, setSelected] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  function replaceSteps(steps: ScenarioStep[]) {
    onChange({ ...draft, steps: withSequentialSteps(steps) })
  }

  /** Lifts the step at `from` out of the list and drops it in at `to`. */
  function moveStep(from: number, to: number) {
    if (to < 0 || to >= draft.steps.length || from === to) return

    const reordered = [...draft.steps]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    replaceSteps(reordered)
    setSelected(to)
    setAnnouncement(t.scenarios.canvas.stepMoved(to + 1, reordered.length))
  }

  function addStep() {
    const steps = [...draft.steps, createEmptyStep()]
    replaceSteps(steps)
    // Selected on creation: an empty node says nothing about itself, so the
    // only useful next move is to fill it in.
    setSelected(steps.length - 1)
    setAnnouncement(t.scenarios.canvas.stepAdded(steps.length))
  }

  function removeStep(index: number) {
    replaceSteps(draft.steps.filter((_, at) => at !== index))
    setSelected(null)
    setAnnouncement(t.scenarios.canvas.stepRemoved(index + 1))
  }

  const selectedStep = selected === null ? null : draft.steps[selected] ?? null

  return (
    <section className="panel scenario-canvas" aria-labelledby="scenario-canvas-title">
      <header className="panel-header panel-header--split">
        <div>
          <h2 id="scenario-canvas-title">{t.scenarios.canvas.title}</h2>
          <p className="scenario-hint">
            {readOnly ? t.scenarios.canvas.hintReadOnly : t.scenarios.canvas.hintEditable}
          </p>
        </div>
        {/* Autosave is quiet by default: only in-flight ("Saving…") or the brief
            window where an edit is waiting to be saved ("Unsaved") is shown. */}
        {!readOnly && saving && (
          <span className="badge scenario-dirty">{t.scenarios.canvas.saving}</span>
        )}
        {!readOnly && !saving && dirty && (
          <span className="badge scenario-dirty">{t.scenarios.canvas.unsaved}</span>
        )}
      </header>

      <div className="scenario-fields">
        <div className="field">
          <label className="field-label" htmlFor={titleId}>{t.scenarios.canvas.titleLabel}</label>
          {readOnly ? (
            <p className="scenario-readonly-value">
              {draft.title.length > 0
                ? draft.title
                : <span className="detail-empty">{t.scenarios.canvas.noTitle}</span>}
            </p>
          ) : (
            <input
              className="field-input"
              id={titleId}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              placeholder={t.scenarios.canvas.titlePlaceholder}
              value={draft.title}
            />
          )}
        </div>

        <div className="field">
          <label className="field-label" htmlFor={descriptionId}>
            {t.scenarios.canvas.descriptionLabel}
          </label>
          {readOnly ? (
            <p className="scenario-readonly-value">
              {draft.description.length > 0
                ? draft.description
                : <span className="detail-empty">{t.scenarios.canvas.noDescription}</span>}
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

      {draft.steps.length === 0 && readOnly ? (
        <p className="panel-empty">{t.scenarios.canvas.emptyClosed}</p>
      ) : (
        <ol className="scenario-flow">
          {draft.steps.map((step, index) => (
            <StepNode
              dragging={dragging === index}
              dropBefore={dropTarget === index && dragging !== null && dragging !== index}
              index={index}
              key={index}
              onDragEnd={() => {
                setDragging(null)
                setDropTarget(null)
              }}
              onDragStart={() => setDragging(index)}
              onDragOverNode={() => setDropTarget(index)}
              onDrop={() => {
                if (dragging !== null) moveStep(dragging, index)
                setDragging(null)
                setDropTarget(null)
              }}
              onSelect={() => setSelected(selected === index ? null : index)}
              readOnly={readOnly}
              selected={selected === index}
              step={step}
            />
          ))}

          {!readOnly && (
            <li className="scenario-flow-item">
              <button className="scenario-node scenario-node--add" onClick={addStep} type="button">
                <span aria-hidden="true" className="scenario-node-plus">+</span>
                {t.scenarios.canvas.addStep}
              </button>
            </li>
          )}
        </ol>
      )}

      {draft.steps.length === 0 && !readOnly && (
        <p className="panel-empty">{t.scenarios.canvas.emptyOpen}</p>
      )}

      {selectedStep !== null && selected !== null && (
        <StepEditor
          canMoveDown={selected < draft.steps.length - 1}
          canMoveUp={selected > 0}
          index={selected}
          onChange={(updated) =>
            replaceSteps(draft.steps.map((existing, at) => (at === selected ? updated : existing)))
          }
          onClose={() => setSelected(null)}
          onMoveDown={() => moveStep(selected, selected + 1)}
          onMoveUp={() => moveStep(selected, selected - 1)}
          onRemove={() => removeStep(selected)}
          readOnly={readOnly}
          step={selectedStep}
        />
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </section>
  )
}

/**
 * One node in the flow: its number, its title, and the action it performs.
 *
 * Dragging is pointer-only by nature, so the editor keeps `Move earlier` and
 * `Move later` buttons — reordering has to be reachable from the keyboard, and
 * a drag handle that only responds to a mouse would strand that path.
 */
function StepNode({
  dragging,
  dropBefore,
  index,
  onDragEnd,
  onDragOverNode,
  onDragStart,
  onDrop,
  onSelect,
  readOnly,
  selected,
  step,
}: {
  dragging: boolean
  dropBefore: boolean
  index: number
  onDragEnd: () => void
  onDragOverNode: () => void
  onDragStart: () => void
  onDrop: () => void
  onSelect: () => void
  readOnly: boolean
  selected: boolean
  step: ScenarioStep
}) {
  const { t } = useI18n()
  const classes = ['scenario-flow-item']
  if (dragging) classes.push('scenario-flow-item--dragging')
  if (dropBefore) classes.push('scenario-flow-item--drop')

  return (
    <li
      className={classes.join(' ')}
      draggable={!readOnly}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (readOnly) return
        // Without this the drop is refused and the browser animates the node
        // back to where it started.
        event.preventDefault()
        onDragOverNode()
      }}
      onDragStart={onDragStart}
      onDrop={(event) => {
        if (readOnly) return
        event.preventDefault()
        onDrop()
      }}
    >
      <button
        aria-current={selected ? 'true' : undefined}
        className={selected ? 'scenario-node scenario-node--selected' : 'scenario-node'}
        onClick={onSelect}
        type="button"
      >
        <span className="mono scenario-node-step">{String(index + 1).padStart(2, '0')}</span>
        <span className="scenario-node-title">
          {step.title.length > 0 ? step.title : t.scenarios.canvas.untitledStep}
        </span>
        <span className="scenario-node-action">
          {step.action.length > 0 ? step.action : t.scenarios.canvas.noActionYet}
        </span>
      </button>
    </li>
  )
}

/** Labels and hints live in the locale dictionary under the same keys. */
const STEP_FIELD_KEYS = ['title', 'state', 'action', 'expected'] as const

/**
 * The selected step's four fields, in the order a tester reads them — starting
 * state, action, expected result — so a step can be judged without
 * cross-referencing the ones around it.
 */
function StepEditor({
  canMoveDown,
  canMoveUp,
  index,
  onChange,
  onClose,
  onMoveDown,
  onMoveUp,
  onRemove,
  readOnly,
  step,
}: {
  canMoveDown: boolean
  canMoveUp: boolean
  index: number
  onChange: (step: ScenarioStep) => void
  onClose: () => void
  onMoveDown: () => void
  onMoveUp: () => void
  onRemove: () => void
  readOnly: boolean
  step: ScenarioStep
}) {
  const { t } = useI18n()
  const fieldPrefix = useId()
  const fields = t.scenarios.canvas.stepFields

  return (
    <div className="scenario-step-editor">
      <header className="scenario-step-editor-header">
        <h3>{t.scenarios.canvas.stepHeading(index + 1)}</h3>
        <div className="scenario-step-actions">
          {!readOnly && (
            <>
              <button
                className="button button--secondary button--compact"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                type="button"
              >
                {t.scenarios.canvas.moveEarlier}
              </button>
              <button
                className="button button--secondary button--compact"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                type="button"
              >
                {t.scenarios.canvas.moveLater}
              </button>
              <button
                className="button button--danger-quiet button--compact"
                onClick={onRemove}
                type="button"
              >
                {t.scenarios.canvas.remove}
              </button>
            </>
          )}
          <button
            className="button button--secondary button--compact"
            onClick={onClose}
            type="button"
          >
            {t.scenarios.canvas.close}
          </button>
        </div>
      </header>

      {readOnly ? (
        <dl className="detail-fields">
          {STEP_FIELD_KEYS.map((key) => (
            <Fragment key={key}>
              <dt>{fields[key].label}</dt>
              <dd>
                {step[key].length > 0
                  ? step[key]
                  : <span className="detail-empty">{t.scenarios.canvas.notSpecified}</span>}
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        STEP_FIELD_KEYS.map((key) => (
          <div className="field" key={key}>
            <label className="field-label" htmlFor={`${fieldPrefix}-${key}`}>
              {fields[key].label}
            </label>
            <input
              className="field-input"
              id={`${fieldPrefix}-${key}`}
              onChange={(event) => onChange({ ...step, [key]: event.target.value })}
              value={step[key]}
            />
            <p className="field-hint">{fields[key].hint}</p>
          </div>
        ))
      )}
    </div>
  )
}
