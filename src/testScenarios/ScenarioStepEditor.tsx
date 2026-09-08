import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { TestCaseModal } from '../testCases/TestCaseModal'
import { GapFillModal } from './GapFillModal'
import { groupStepsByCase, isGapStep } from './scenarioTypes'
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
  // The gap being answered: its index and the detail the block hides behind ⓘ.
  const [gapFill, setGapFill] = useState<{ index: number; blockedBy: string | null; detail: string } | null>(null)
  // Drag-reorder: index being dragged, and the row it is hovering over.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  // The centre column hides its scrollbar and marks the two edges instead, the
  // way the TC spec list does — three bars on one screen was one too many, and
  // this is the column that sits between the other two. `top`/`bottom` mean the
  // scroll is AT that end, so the arrow there has nothing left to point at.
  const bodyRef = useRef<HTMLElement>(null)
  const [edge, setEdge] = useState({ top: true, bottom: true })

  function readEdge(el: HTMLElement) {
    setEdge({
      top: el.scrollTop <= 2,
      bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
    })
  }

  // Measured through a ResizeObserver rather than on render: adding or removing a
  // step changes how far the column can scroll, and so does resizing the window.
  useEffect(() => {
    const el = bodyRef.current
    if (el === null) return undefined
    const observer = new ResizeObserver(() => readEdge(el))
    observer.observe(el)
    if (el.firstElementChild !== null) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [])

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
    <div className={'edoc-shell' + (edge.top ? ' at-top' : '') + (edge.bottom ? ' at-bottom' : '')}>
      <div className="edoc-fade edoc-fade--top" aria-hidden="true"><span className="edoc-fade-hint">▴</span></div>
      <main className="edoc-wrap" onScroll={(event) => readEdge(event.currentTarget)} ref={bodyRef}>
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
            // A gap is not a step: no number, no TC badge, nothing to type into. It says
            // the route between the checks around it is unknown, and a run skips it —
            // rendering it as an editable action would invite someone to run a line
            // nobody could perform, and to record that as a failure.
            if (isGapStep(step)) {
              return (
                <li key={index} className="st-erow st-erow--gap">
                  <span className="st-gap-mark" aria-hidden="true">⚠</span>
                  <div className="st-gap-body">
                    <span className="st-gap-title">{e.gapTitle}</span>
                    {step.step_unknown_reason !== null && (
                      <span className="st-gap-where mono">{step.step_unknown_reason}</span>
                    )}
                  </div>
                  {/* 자세한 사정은 호버로 연다. 블록에 다 적으면 정작 할 일(스텝 추가)이 묻힌다. */}
                  <span className="st-gap-info" tabIndex={0} aria-label={e.gapDetail}>
                    ⓘ
                    <span className="st-gap-pop" role="tooltip">{step.action}</span>
                  </span>
                  <button
                    className="st-gap-add"
                    type="button"
                    onClick={() => setGapFill({ index, blockedBy: step.step_unknown_reason, detail: step.action })}
                  >
                    ＋ {e.gapAddStep}
                  </button>
                  <button className="iconbtn iconbtn--danger" type="button" title={e.remove} onClick={() => editor.removeStep(index)}>✕</button>
                </li>
              )
            }
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
                    {/* 명세가 모르는 자리를 사람 말로 채운 스텝. 코드가 확인할 수 없는 근거라
                        말한 당사자에게 보이는 것이 유일한 대비다 — 아니면 여기서 고친다. */}
                    {step.step_source === 'HUMAN' && (
                      <span className="st-human-badge" title={e.humanStepHelp}>{e.humanStep}</span>
                    )}
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
      </main>
      <div className="edoc-fade edoc-fade--bottom" aria-hidden="true"><span className="edoc-fade-hint">▾</span></div>
      {gapFill !== null && (
        <GapFillModal
          blockedBy={gapFill.blockedBy}
          detail={gapFill.detail}
          onCancel={() => setGapFill(null)}
          onConfirm={(steps) => { editor.replaceStep(gapFill.index, steps); setGapFill(null) }}
        />
      )}
      {tcView !== null && (
        <TestCaseModal
          projectId={projectId}
          caseId={tcView.caseId}
          label={tcView.label}
          onClose={() => setTcView(null)}
        />
      )}
    </div>
  )
}
