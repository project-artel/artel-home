import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import {
  VERIFICATION_STATUSES,
  type TestCase,
  type VerificationStatus,
} from '../testCases/testCaseTypes'
import { CaseLibrary } from './CaseLibrary'
import { useScenarioComposition } from './useScenarioComposition'

/**
 * The scenario body in the 3-tier model: an ordered list of reusable TestCases.
 *
 * This replaces the old inline-step canvas. The three affordances the canvas had
 * are preserved through {@link useScenarioComposition}, just repointed at the
 * composition and case endpoints: undo/redo, debounced autosave, and drag
 * reorder. Cases are shared library entries, so a fourth affordance is added —
 * pulling an existing case in, or removing one without deleting it.
 *
 * The agent chat lives beside this but does not drive it yet: the agent still
 * authors the scenario's draft, not its cases. That gap is called out in the UI
 * rather than hidden.
 */
export function ScenarioComposition({
  projectId,
  testScenarioId,
  readOnly,
}: {
  projectId: string
  testScenarioId: number
  readOnly: boolean
}) {
  const { t } = useI18n()
  const c = t.scenarios.composition
  const comp = useScenarioComposition(projectId, testScenarioId)

  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const editable = !readOnly

  // Undo/redo keyboard shortcuts, outside text fields (their own text-undo wins).
  useEffect(() => {
    if (!editable) return undefined
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const target = event.target as HTMLElement | null
      const inField =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (inField) return
      const key = event.key.toLowerCase()
      const wantsRedo = (key === 'z' && event.shiftKey) || key === 'y'
      const wantsUndo = key === 'z' && !event.shiftKey
      if (!wantsRedo && !wantsUndo) return
      event.preventDefault()
      if (wantsRedo) {
        if (comp.canRedo) comp.redo()
      } else if (comp.canUndo) {
        comp.undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editable, comp.canUndo, comp.canRedo, comp.undo, comp.redo])

  if (comp.status === 'loading') {
    return <section className="panel scenario-composition"><p className="panel-empty">{c.loading}</p></section>
  }
  if (comp.status === 'missing' || comp.status === 'error') {
    return (
      <section className="panel scenario-composition">
        <div className="panel-message" role="alert">
          <p>{c.loadFailed}</p>
          <button className="button button--secondary" onClick={comp.reload} type="button">{c.retry}</button>
        </div>
      </section>
    )
  }

  const order = comp.working.order

  function move(id: string, delta: number) {
    const from = order.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= order.length) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    comp.reorder(next)
    setAnnouncement(c.moved(from + 1, to + 1))
  }

  function dropOn(targetId: string) {
    if (dragging === null || dragging === targetId) return
    const next = [...order]
    const from = next.indexOf(dragging)
    const [moved] = next.splice(from, 1)
    next.splice(next.indexOf(targetId), 0, moved)
    comp.reorder(next)
    setDragging(null)
  }

  async function addNewCase() {
    const created = await comp.createAndAdd({ title: c.newCaseTitle, category: '' })
    if (created !== null) {
      setSelected(created.id)
      setAnnouncement(c.detail.added)
    }
  }

  function removeFromScenario(id: string) {
    comp.removeFromScenario(id)
    if (selected === id) setSelected(null)
    setAnnouncement(c.detail.removed)
  }

  const selectedCase =
    selected !== null && order.includes(selected) ? comp.working.caseById[selected] ?? null : null

  return (
    <section className="panel scenario-composition" aria-labelledby="scenario-composition-title">
      <header className="panel-header panel-header--split">
        <div>
          <h2 id="scenario-composition-title">{c.title}</h2>
          <p className="scenario-hint">{editable ? c.hint : c.hintReadOnly}</p>
        </div>
        {editable && (
          <div className="scenario-canvas-tools">
            <button
              className="button button--secondary button--compact"
              disabled={!comp.canUndo}
              onClick={comp.undo}
              title={c.undoTitle}
              type="button"
            >
              {c.undo}
            </button>
            <button
              className="button button--secondary button--compact"
              disabled={!comp.canRedo}
              onClick={comp.redo}
              title={c.redoTitle}
              type="button"
            >
              {c.redo}
            </button>
            {comp.saving && <span className="badge scenario-dirty">{c.saving}</span>}
            {!comp.saving && comp.dirty && <span className="badge scenario-dirty">{c.unsaved}</span>}
          </div>
        )}
      </header>

      <div className="scenario-fields">
        <div className="field">
          <label className="field-label" htmlFor="scn-title">{c.scenarioTitleLabel}</label>
          {editable ? (
            <input
              className="field-input"
              id="scn-title"
              onChange={(event) => comp.setTitle(event.target.value)}
              placeholder={c.scenarioTitlePlaceholder}
              value={comp.working.title}
            />
          ) : (
            <p className="scenario-readonly-value">
              {comp.working.title.length > 0 ? comp.working.title : <span className="detail-empty">{c.untitled}</span>}
            </p>
          )}
        </div>
      </div>

      <p className="scenario-flow-label"><span className="mono n">#</span> {c.stepLabel}</p>

      {order.length === 0 ? (
        <p className="panel-empty">{c.noCases}</p>
      ) : (
        <ol className="scenario-flow">
          {order.map((id, index) => {
            const testCase = comp.working.caseById[id]
            if (testCase === undefined) return null
            return (
              <li
                className={
                  'scenario-flow-item scenario-case-item' +
                  (dragging === id ? ' scenario-flow-item--dragging' : '')
                }
                draggable={editable}
                key={id}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => {
                  if (!editable) return
                  event.preventDefault()
                }}
                onDragStart={() => setDragging(id)}
                onDrop={(event) => {
                  if (!editable) return
                  event.preventDefault()
                  dropOn(id)
                }}
              >
                <button
                  aria-current={selected === id ? 'true' : undefined}
                  className={selected === id ? 'scenario-node scenario-node--selected' : 'scenario-node'}
                  onClick={() => setSelected(selected === id ? null : id)}
                  type="button"
                >
                  <span className="mono scenario-node-step">{String(index + 1).padStart(2, '0')}</span>
                  <span className="scenario-case-main">
                    <span className="scenario-node-title">
                      {testCase.title.length > 0 ? testCase.title : c.newCaseTitle}
                    </span>
                    {testCase.category.length > 0 && (
                      <span className="scenario-case-category">{testCase.category}</span>
                    )}
                  </span>
                  <span className="mono scenario-case-id">{testCase.id}</span>
                  <StatusDot status={testCase.verificationStatus} />
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {editable && (
        <div className="scenario-add-row">
          <button className="button button--secondary" onClick={addNewCase} type="button">
            {c.addCase}
          </button>
          <button className="button button--secondary" onClick={() => setLibOpen((open) => !open)} type="button">
            {c.fromLib}
          </button>
        </div>
      )}

      {libOpen && editable && (
        <CaseLibrary
          projectId={projectId}
          inScenario={new Set(order)}
          onAdd={(testCase) => comp.addExisting(testCase)}
          onRemove={(id) => removeFromScenario(id)}
          onDelete={(id) => comp.deleteCase(id)}
          onClose={() => setLibOpen(false)}
        />
      )}

      {selectedCase !== null && (
        <CaseDetail
          testCase={selectedCase}
          position={order.indexOf(selectedCase.id)}
          total={order.length}
          readOnly={!editable}
          onEdit={(patch) => comp.editCase(selectedCase.id, patch)}
          onMoveUp={() => move(selectedCase.id, -1)}
          onMoveDown={() => move(selectedCase.id, 1)}
          onRemove={() => removeFromScenario(selectedCase.id)}
          onClose={() => setSelected(null)}
        />
      )}

      <p className="scenario-agent-note">{c.agentNote}</p>
      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </section>
  )
}

function StatusDot({ status }: { status: VerificationStatus }) {
  return <span className={`vdot vdot--${status.toLowerCase()}`} aria-hidden="true" />
}

/**
 * The selected case's editable fields. A case is a shared library entry, so its
 * status and text edit here and autosave to the case itself; the up/down/remove
 * controls act on this scenario's ordering only.
 */
function CaseDetail({
  testCase,
  position,
  total,
  readOnly,
  onEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
  onClose,
}: {
  testCase: TestCase
  position: number
  total: number
  readOnly: boolean
  onEdit: (patch: Partial<TestCase>) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const d = t.scenarios.composition.detail
  const status = t.scenarios.composition.status
  const fieldPrefix = useId()

  return (
    <div className="scenario-step-editor">
      <header className="scenario-step-editor-header">
        <h3>{d.heading} · {String(position + 1).padStart(2, '0')}</h3>
        <div className="scenario-step-actions">
          {!readOnly && (
            <>
              <button className="button button--secondary button--compact" disabled={position <= 0} onClick={onMoveUp} type="button">{d.moveUp}</button>
              <button className="button button--secondary button--compact" disabled={position >= total - 1} onClick={onMoveDown} type="button">{d.moveDown}</button>
              <button className="button button--danger-quiet button--compact" onClick={onRemove} type="button">{d.remove}</button>
            </>
          )}
          <button className="button button--secondary button--compact" onClick={onClose} type="button">{d.close}</button>
        </div>
      </header>

      <div className="field">
        <label className="field-label" htmlFor={`${fieldPrefix}-cat`}>{d.category}</label>
        <input
          className="field-input"
          disabled={readOnly}
          id={`${fieldPrefix}-cat`}
          onChange={(event) => onEdit({ category: event.target.value })}
          value={testCase.category}
        />
      </div>

      <div className="field">
        <span className="field-label">{d.status}</span>
        <div className="status-choose">
          {VERIFICATION_STATUSES.map((s) => (
            <button
              className={testCase.verificationStatus === s ? `status-choose-btn on ${s.toLowerCase()}` : 'status-choose-btn'}
              disabled={readOnly}
              key={s}
              onClick={() => onEdit({ verificationStatus: s })}
              type="button"
            >
              {status[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${fieldPrefix}-pre`}>{d.precondition} <span className="field-sub">{d.preHint}</span></label>
        <textarea
          className="field-input field-input--multiline"
          disabled={readOnly}
          id={`${fieldPrefix}-pre`}
          onChange={(event) => onEdit({ precondition: event.target.value })}
          rows={2}
          value={testCase.precondition ?? ''}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${fieldPrefix}-exp`}>{d.expected} <span className="field-sub">{d.expHint}</span></label>
        <textarea
          className="field-input field-input--multiline"
          disabled={readOnly}
          id={`${fieldPrefix}-exp`}
          onChange={(event) => onEdit({ expected: event.target.value })}
          rows={2}
          value={testCase.expected}
        />
      </div>

      <p className="field-hint">
        {d.lastBuild}: <span className="mono">{testCase.lastVerifiedBuildId ?? d.none}</span>
      </p>
    </div>
  )
}
