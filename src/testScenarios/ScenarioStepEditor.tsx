import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { TestCaseModal } from '../testCases/TestCaseModal'
import {
  countExpectedFailures,
  firstExpectedFailureIndex,
  groupStepsByCase,
} from './scenarioTypes'
import type { StepEditor } from './useStepEditor'

/**
 * The three states a step's expected verdict can be in, in the order they are
 * offered. `null` sits first because it is the default and the honest answer
 * until a human has actually decided.
 */
const EXPECTED_STATES: (boolean | null)[] = [null, true, false]

/**
 * Editable steps of a scenario (ARTEL-289): add / edit / remove / reorder. Steps
 * are a flat ordered list; a step bound to a TestCase carries a TC badge (내부
 * case_id는 노출하지 않고 등장 순번만) that opens the case read-only, and rows can
 * be dragged to reorder.
 *
 * This is a controlled view: undo/redo, autosave state, and the ⌘K TC spec live
 * on the studio header ({@link TestScenarioPage}), because they are run-scoped —
 * one agent authors many scenarios, so those controls do not belong inside a
 * single scenario's body.
 */
export function ScenarioStepEditor({
  projectId,
  editor,
}: {
  projectId: string
  editor: StepEditor
}) {
  const { t } = useI18n()
  const e = t.scenarios.stepsEditor
  const { working } = editor
  // The TestCase a badge points at, opened read-only. `label` is the human "TC N",
  // never the internal case_id.
  const [tcView, setTcView] = useState<{ caseId: number; label: string } | null>(null)
  // Drag-reorder: index being dragged, and the row it is hovering over.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function onDrop(target: number) {
    if (dragIndex !== null && dragIndex !== target) editor.moveStep(dragIndex, target)
    setDragIndex(null)
    setOverIndex(null)
  }

  // Expected-verdict rollup for the whole scenario. Both numbers are things the
  // author cannot see from the rows alone once the list is longer than a screen.
  const expectedFailCount = countExpectedFailures(working.steps)
  const firstFailIndex = firstExpectedFailureIndex(working.steps)
  // Only worth saying when a later step actually exists to be cut off.
  const showUnreachable = firstFailIndex !== -1 && firstFailIndex < working.steps.length - 1

  const expectedText = (value: boolean | null) =>
    value === null ? e.expectedUnset : value ? e.expectedPass : e.expectedFail
  const expectedShort = (value: boolean | null) =>
    value === null ? e.expectedUnsetShort : value ? e.expectedPassShort : e.expectedFailShort
  const expectedModifier = (value: boolean | null) =>
    value === null ? 'unset' : value ? 'pass' : 'fail'

  // Per-step TC ordinal (내부 id 대신 순번). Consecutive same case_id = one TC.
  const tcNoByIndex = new Map<number, number>()
  let tcSeq = 0
  for (const group of groupStepsByCase(working.steps)) {
    if (group.caseId === null) continue
    tcSeq += 1
    for (const index of group.indices) tcNoByIndex.set(index, tcSeq)
  }

  return (
    <main className="edoc-wrap">
      <div className="edoc st-editor">
        <header className="st-editor-head">
          <input
            className="st-editor-title"
            value={working.title}
            placeholder={t.scenarios.page.untitled}
            aria-label={e.titleLabel}
            onChange={(ev) => editor.setTitle(ev.target.value)}
          />
        </header>

        {editor.saveError !== null && <p className="st-editor-error">{e.saveFailed}</p>}

        <ol className="st-editor-list">
          {working.steps.map((step, index) => {
            const tcNo = tcNoByIndex.get(index)
            return (
              <li
                key={index}
                className={`st-erow${step.case_id !== null ? ' st-erow--tc' : ''}${overIndex === index && dragIndex !== null ? ' st-erow--over' : ''}`}
                onDragOver={(ev) => { ev.preventDefault(); setOverIndex(index) }}
                onDrop={() => onDrop(index)}
              >
                <span
                  className="st-erow-drag"
                  draggable
                  title={e.drag}
                  aria-label={e.drag}
                  onDragStart={() => setDragIndex(index)}
                  onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
                >⠿</span>
                <span className="st-erow-no">{index + 1}</span>
                <div className="st-erow-body">
                  <textarea
                    className="st-erow-action"
                    rows={1}
                    value={step.action}
                    placeholder={e.actionPlaceholder}
                    aria-label={e.actionLabel}
                    onChange={(ev) => {
                      editor.updateStep(index, { action: ev.target.value })
                      ev.target.style.height = 'auto'
                      ev.target.style.height = `${ev.target.scrollHeight}px`
                    }}
                  />
                  <div className="st-erow-meta">
                    {tcNo !== undefined && step.case_id !== null && (
                      <button
                        className="st-tc-badge st-tc-badge--btn"
                        type="button"
                        title={e.viewCase}
                        onClick={() => setTcView({ caseId: step.case_id as number, label: `TC ${tcNo}` })}
                      >
                        TC {tcNo}
                      </button>
                    )}
                    <input
                      className="st-erow-hint"
                      value={step.hint ?? ''}
                      placeholder={e.hintPlaceholder}
                      aria-label={e.hintLabel}
                      onChange={(ev) => editor.updateStep(index, { hint: ev.target.value || null })}
                    />
                    {/*
                      Three explicit choices rather than a checkbox. A checkbox has
                      two states and would force "not graded" to share a rendering
                      with one of the verdicts — which is the same mistake as
                      defaulting the label to true, just moved into the UI.
                    */}
                    <div
                      className="st-erow-expected"
                      role="radiogroup"
                      aria-label={`${e.expectedLabel} — ${index + 1}`}
                    >
                      {EXPECTED_STATES.map((value) => (
                        <button
                          key={String(value)}
                          type="button"
                          role="radio"
                          aria-checked={step.expected_passed === value}
                          className={`st-exp st-exp--${expectedModifier(value)}${
                            step.expected_passed === value ? ' st-exp--on' : ''
                          }`}
                          title={expectedText(value)}
                          onClick={() => editor.updateStep(index, { expected_passed: value })}
                        >
                          {expectedShort(value)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="st-erow-actions">
                  <button className="iconbtn" type="button" title={e.moveUp} disabled={index === 0} onClick={() => editor.moveStep(index, index - 1)}>↑</button>
                  <button className="iconbtn" type="button" title={e.moveDown} disabled={index === working.steps.length - 1} onClick={() => editor.moveStep(index, index + 1)}>↓</button>
                  <button className="iconbtn iconbtn--danger" type="button" title={e.remove} onClick={() => editor.removeStep(index)}>✕</button>
                </div>
              </li>
            )
          })}
        </ol>

        <button className="st-editor-add" type="button" onClick={editor.addStep}>＋ {e.addStep}</button>

        {/*
          Scenario-level rollup. Zero expected failures is not an error — it is a
          scenario that cannot tell a lenient agent from a careful one, and the
          author is the only one who can fix that.
        */}
        {working.steps.length > 0 && (
          <footer className="st-editor-expected">
            <span
              className={`st-editor-expected-count${
                expectedFailCount === 0 ? ' st-editor-expected-count--none' : ''
              }`}
            >
              {e.expectedFailCount(expectedFailCount)}
            </span>
            {expectedFailCount === 0 && (
              <p className="st-editor-expected-note">{e.expectedNoneWarning}</p>
            )}
            {showUnreachable && (
              <p className="st-editor-expected-note">
                {e.expectedUnreachable(firstFailIndex + 1)}
              </p>
            )}
          </footer>
        )}
      </div>
      {tcView !== null && (
        <TestCaseModal
          projectId={projectId}
          caseId={tcView.caseId}
          label={tcView.label}
          onClose={() => setTcView(null)}
        />
      )}
    </main>
  )
}
