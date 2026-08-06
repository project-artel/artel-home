import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { CASE_STEP_KINDS, type CaseStep, type CaseStepKind, type TestCase, type VerificationStatus } from '../testCases/testCaseTypes'
import { shortcutLabel } from '../shell/platform'
import { CategoryChip } from '../testCases/CategoryChip'
import { CasePalette } from './CasePalette'
import type { useScenarioComposition } from './useScenarioComposition'

type Comp = ReturnType<typeof useScenarioComposition>

/** Rollup status of a scenario from its cases (broken wins; all-verified is verified). */
export function rollupStatus(cases: TestCase[]): VerificationStatus {
  if (cases.some((c) => c.verificationStatus === 'BROKEN')) return 'BROKEN'
  if (cases.length > 0 && cases.every((c) => c.verificationStatus === 'VERIFIED')) return 'VERIFIED'
  return 'DRAFT'
}

/**
 * The scenario document: an editable title and the ordered case flow, with a
 * detail card grid for the selected case and the reusable-case library.
 *
 * The flow is identified by **position, not case id**: a case may appear more
 * than once in one flow (a feature revisited — shop → … → shop), so selection,
 * drag, move and remove all act on the index. Editing a case's fields still
 * flows through its id, since the same reusable case backs every occurrence.
 */
export function ScenarioComposition({
  comp,
  projectId,
  readOnly,
  initialCaseId = null,
}: {
  comp: Comp
  projectId: string
  readOnly: boolean
  /** Pre-selected case (deep-link from the Map's case node), opens its detail. */
  initialCaseId?: string | null
}) {
  const { t } = useI18n()
  const c = t.scenarios.composition
  const editable = !readOnly

  const [selected, setSelected] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [libReload, setLibReload] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)

  // ⌘K / Ctrl+K summons the case palette from anywhere in the studio.
  useEffect(() => {
    if (!editable) return undefined
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable])

  // Follow the deep-link: when the Map points at a case (?case=), select its first
  // occurrence in the flow once the composition is loaded.
  useEffect(() => {
    if (initialCaseId === null || comp.status !== 'ready') return
    const idx = comp.working.order.indexOf(initialCaseId)
    if (idx >= 0) setSelected(idx)
    // Deep-link is a one-shot on the ?case= param; order is read at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCaseId, comp.status])

  // Bring the selected case's detail into view — a deep-link and a flow click both
  // scroll it into sight rather than leaving it below the fold.
  useEffect(() => {
    if (comp.status !== 'ready' || selected === null) return undefined
    const timer = window.setTimeout(
      () => detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      60,
    )
    return () => window.clearTimeout(timer)
  }, [comp.status, selected])

  if (comp.status === 'loading') {
    return <main className="edoc-wrap"><div className="edoc"><p className="empty-note">{c.loading}</p></div></main>
  }
  if (comp.status !== 'ready') {
    return <main className="edoc-wrap"><div className="edoc"><p className="empty-note">{c.loadFailed}</p></div></main>
  }

  const order = comp.working.order
  const cases = comp.cases
  const status = rollupStatus(cases)

  function dropOn(targetIndex: number) {
    if (dragging === null || dragging === targetIndex) return
    // order와 자리별 Step을 함께 이동한다(lockstep) — 훅의 moveAt이 둘을 같은 splice로 옮긴다.
    comp.moveAt(dragging, targetIndex)
    setDragging(null)
    setSelected(null)
  }
  function move(fromIndex: number, delta: number) {
    const to = fromIndex + delta
    if (to < 0 || to >= order.length) return
    comp.moveAt(fromIndex, to)
    setSelected(to)
  }
  function removeAt(index: number) {
    comp.removeAt(index)
    setSelected((s) => (s === null ? null : s === index ? null : s > index ? s - 1 : s))
  }
  function removeAllOf(caseId: string) {
    comp.removeFromScenario(caseId)
    setSelected(null)
  }

  const selectedCase =
    selected !== null && selected < order.length
      ? comp.working.caseById[order[selected]] ?? null
      : null

  return (
    <main className="edoc-wrap">
      <article className="edoc">
        {readOnly && <div className="ro-banner">{c.hintReadOnly}</div>}

        <div className="sc-head">
          <input
            aria-label={c.scenarioTitleLabel}
            className="sc-title"
            disabled={!editable}
            onChange={(event) => comp.setTitle(event.target.value)}
            placeholder={c.scenarioTitlePlaceholder}
            value={comp.working.title}
          />
          <span className={`vpill ${status}`}><span className={`vdot ${status}`} />{c.status[status]}</span>
        </div>
        <div className="sc-meta mono">{cases.length} {c.caseUnit}</div>

        <p className="flow-label"><span className="n mono">#</span> {c.stepLabel}</p>

        {order.length === 0 ? (
          <p className="empty-note">{c.noCases}</p>
        ) : (
          <ol className="flow">
            {order.map((id, index) => {
              const testCase = comp.working.caseById[id]
              if (testCase === undefined) return null
              return (
                <li key={`${id}-${index}`} style={{ listStyle: 'none' }}>
                  <button
                    className={'fnode' + (selected === index ? ' sel' : '') + (dragging === index ? ' dragging' : '')}
                    draggable={editable}
                    onClick={() => setSelected(selected === index ? null : index)}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(event) => { if (editable) event.preventDefault() }}
                    onDragStart={() => setDragging(index)}
                    onDrop={(event) => { if (editable) { event.preventDefault(); dropOn(index) } }}
                    type="button"
                  >
                    <span className="handle" aria-hidden="true">⠿</span>
                    <span className="fnode-num">{String(index + 1).padStart(2, '0')}</span>
                    <span className="fnode-main">
                      <span className="fnode-title">{testCase.title.length > 0 ? testCase.title : c.newCaseTitle}</span>
                      <CategoryChip category={testCase.category} />
                    </span>
                    <span className={`vdot ${testCase.verificationStatus}`} />
                  </button>
                </li>
              )
            })}
          </ol>
        )}

        {editable && !showNew && (
          <div className="flow-add">
            <button className="add-new" onClick={() => setShowNew(true)} type="button">{c.addCase}</button>
            <button className="add-lib" onClick={() => setPaletteOpen(true)} type="button">
              {c.openLibrary} <kbd className="kbd">{shortcutLabel('K')}</kbd>
            </button>
          </div>
        )}

        {showNew && editable && (
          <NewCaseForm
            onCancel={() => setShowNew(false)}
            onCreate={async (input) => {
              const created = await comp.createAndAdd(input)
              if (created === null) return false
              setSelected(order.length)
              setShowNew(false)
              setLibReload((n) => n + 1)
              return true
            }}
          />
        )}

        {selectedCase !== null && selected !== null && (
          <div ref={detailRef}>
            <CaseDetail
              testCase={selectedCase}
              position={selected}
              total={order.length}
              readOnly={!editable}
              steps={comp.working.stepsByPosition[selected] ?? []}
              onEdit={(patch) => comp.editCase(selectedCase.id, patch)}
              onEditSteps={(steps) => comp.editStepsAt(selected, steps)}
              onMoveUp={() => move(selected, -1)}
              onMoveDown={() => move(selected, 1)}
              onRemove={() => removeAt(selected)}
            />
          </div>
        )}

        {paletteOpen && editable && (
          <CasePalette
            projectId={projectId}
            reloadKey={libReload}
            order={order}
            onAdd={(testCase) => comp.addExisting(testCase)}
            onRemove={removeAllOf}
            onClose={() => setPaletteOpen(false)}
          />
        )}
      </article>
    </main>
  )
}

function autogrow(el: HTMLTextAreaElement | null) {
  if (el === null) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

function CaseDetail({
  testCase,
  position,
  total,
  readOnly,
  steps,
  onEdit,
  onEditSteps,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  testCase: TestCase
  position: number
  total: number
  readOnly: boolean
  steps: CaseStep[]
  onEdit: (patch: Partial<TestCase>) => void
  onEditSteps: (steps: CaseStep[]) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const d = t.scenarios.composition.detail
  const statusLabel = t.scenarios.composition.status
  const preRef = useRef<HTMLTextAreaElement>(null)
  const expRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { autogrow(preRef.current); autogrow(expRef.current) }, [testCase.id])

  return (
    <section className="detail">
      <div className="detail-head">
        <h3>{d.heading} · {String(position + 1).padStart(2, '0')}</h3>
        {!readOnly && (
          <div className="detail-tools">
            <button className="iconbtn" disabled={position <= 0} onClick={onMoveUp} title={d.moveUp} type="button">↑</button>
            <button className="iconbtn" disabled={position >= total - 1} onClick={onMoveDown} title={d.moveDown} type="button">↓</button>
            <button className="iconbtn" onClick={onRemove} title={d.remove} type="button">✕</button>
          </div>
        )}
      </div>

      <div className="doc-grid">
        <div className="card">
          <p className="card-label"><span className="mk">▍</span>{d.category}</p>
          <input className="cinput" disabled={readOnly} onChange={(e) => onEdit({ category: e.target.value })} value={testCase.category} />
        </div>
        <div className="card">
          <p className="card-label"><span className="mk">▍</span>{d.status} <span className="sub">{d.statusHint}</span></p>
          <span className={`vpill ${testCase.verificationStatus}`}>
            <span className={`vdot ${testCase.verificationStatus}`} />{statusLabel[testCase.verificationStatus]}
          </span>
        </div>
        <div className="card full">
          <p className="card-label"><span className="mk">▍</span>{d.precondition} <span className="sub">{d.preHint}</span></p>
          <textarea className="rt2" disabled={readOnly} onChange={(e) => { onEdit({ precondition: e.target.value }); autogrow(e.target) }} ref={preRef} value={testCase.precondition ?? ''} />
        </div>
        <div className="card full">
          <p className="card-label"><span className="mk">▍</span>{d.expected} <span className="sub">{d.expHint}</span></p>
          <textarea className="rt2" disabled={readOnly} onChange={(e) => { onEdit({ expected: e.target.value }); autogrow(e.target) }} ref={expRef} value={testCase.expected} />
        </div>
      </div>

      <StepGroups steps={steps} readOnly={readOnly} onChange={onEditSteps} />
    </section>
  )
}

/**
 * 저작 Step 편집기(ARTEL-280). kind별 3그룹(도달/실행/검증)으로 표기 — 실행 모델(사전조건
 * 도달 → 실행 → 검증)과 1:1이라 검토가 명확하다. Step은 그 자리(순서) 전용이며 실행 시 advisory다.
 *
 * 그룹이 kind를 정하므로 kind 드롭다운은 없다. 편집하지 않는 필드(input/id/assert)는 보존한다 —
 * Agent/CSV가 채운 값을 UI가 지우지 않게.
 */
function StepGroups({
  steps,
  readOnly,
  onChange,
}: {
  steps: CaseStep[]
  readOnly: boolean
  onChange: (steps: CaseStep[]) => void
}) {
  const { t } = useI18n()
  const s = t.scenarios.composition.steps

  const patchAt = (index: number, patch: Partial<CaseStep>) =>
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  const removeAt = (index: number) => onChange(steps.filter((_, i) => i !== index))
  const add = (kind: CaseStepKind) =>
    onChange([
      ...steps,
      // setup은 판정하지 않는다(fast-forward) → assert=false. 나머진 판정.
      { id: '', kind, assert: kind !== 'setup', intent: '', hint: null, input: null, observe: null },
    ])

  return (
    <section className="steps">
      <div className="steps-head">
        <span className="steps-title">{s.title}</span>
        <span className="steps-caveat">{s.sequenceCaveat}</span>
      </div>
      {CASE_STEP_KINDS.map((kind) => {
        // 이 kind의 스텝만, 원래 인덱스와 함께(편집·삭제는 전역 인덱스로 한다).
        const rows = steps.map((step, index) => ({ step, index })).filter((r) => r.step.kind === kind)
        return (
          <div className={`step-group step-${kind}`} key={kind}>
            <div className="step-group-head">
              <span className="step-kind">{s.kinds[kind]}</span>
              <span className="step-kind-sub">{s.kindHints[kind]}</span>
              {!readOnly && (
                <button className="step-add" onClick={() => add(kind)} type="button">+ {s.add}</button>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="step-empty">{s.empty}</p>
            ) : (
              rows.map(({ step, index }) => (
                <div className="step-row" key={index}>
                  <input
                    aria-label={s.intentLabel}
                    className="step-intent"
                    disabled={readOnly}
                    onChange={(e) => patchAt(index, { intent: e.target.value })}
                    placeholder={s.intentPlaceholder}
                    value={step.intent}
                  />
                  <input
                    aria-label={s.hintLabel}
                    className="step-aux"
                    disabled={readOnly}
                    onChange={(e) => patchAt(index, { hint: e.target.value || null })}
                    placeholder={s.hintPlaceholder}
                    value={step.hint ?? ''}
                  />
                  {!readOnly && (
                    <button className="step-del" onClick={() => removeAt(index)} title={s.remove} type="button">✕</button>
                  )}
                </div>
              ))
            )}
          </div>
        )
      })}
    </section>
  )
}

/**
 * Defines a new reusable case. Category, title and expected are required (the
 * server rejects blanks), so the create button stays disabled until they are
 * filled — an empty create would 400 and silently do nothing.
 */
function NewCaseForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: { category: string; title: string; precondition: string | null; expected: string }) => Promise<boolean>
  onCancel: () => void
}) {
  const { t } = useI18n()
  const d = t.scenarios.composition.detail
  const cr = t.scenarios.composition.create
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [precondition, setPrecondition] = useState('')
  const [expected, setExpected] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = category.trim().length > 0 && title.trim().length > 0 && expected.trim().length > 0

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    await onCreate({
      category: category.trim(),
      title: title.trim(),
      precondition: precondition.trim().length > 0 ? precondition.trim() : null,
      expected: expected.trim(),
    })
    setBusy(false)
  }

  return (
    <section className="new-case-form">
      <div className="detail-head"><h3>{cr.heading}</h3></div>
      <div className="doc-grid">
        <div className="card">
          <p className="card-label"><span className="mk">▍</span>{cr.titleLabel}</p>
          <input autoFocus className="cinput" onChange={(e) => setTitle(e.target.value)} placeholder={cr.titlePlaceholder} value={title} />
        </div>
        <div className="card">
          <p className="card-label"><span className="mk">▍</span>{d.category}</p>
          <input className="cinput" onChange={(e) => setCategory(e.target.value)} placeholder={cr.categoryPlaceholder} value={category} />
        </div>
        <div className="card full">
          <p className="card-label"><span className="mk">▍</span>{d.precondition} <span className="sub">{d.preHint}</span></p>
          <textarea className="rt2" onChange={(e) => setPrecondition(e.target.value)} rows={2} value={precondition} />
        </div>
        <div className="card full">
          <p className="card-label"><span className="mk">▍</span>{d.expected} <span className="sub">{d.expHint}</span></p>
          <textarea className="rt2" onChange={(e) => setExpected(e.target.value)} rows={2} value={expected} />
        </div>
      </div>
      <div className="flow-add" style={{ marginTop: 12 }}>
        <button className="add-new" disabled={!valid || busy} onClick={submit} type="button">{cr.submit}</button>
        <button className="add-lib" onClick={onCancel} type="button">{cr.cancel}</button>
      </div>
    </section>
  )
}
