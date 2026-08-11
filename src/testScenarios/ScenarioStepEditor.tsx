import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { TestCaseModal } from '../testCases/TestCaseModal'
import { groupStepsByCase } from './scenarioTypes'
import type { StepEditor } from './useStepEditor'

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
