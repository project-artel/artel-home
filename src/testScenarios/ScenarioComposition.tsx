import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { type TestCase, type VerificationStatus } from '../testCases/testCaseTypes'
import { CategoryChip } from '../testCases/CategoryChip'
import { CaseLibrary } from './CaseLibrary'
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
 * detail card grid for the selected case and the reusable-case library. Styled
 * to the studio mockup; the state comes from {@link useScenarioComposition},
 * lifted to the page so the topbar shares its undo/redo and save state.
 */
export function ScenarioComposition({
  comp,
  projectId,
  readOnly,
}: {
  comp: Comp
  projectId: string
  readOnly: boolean
}) {
  const { t } = useI18n()
  const c = t.scenarios.composition
  const editable = !readOnly

  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [libReload, setLibReload] = useState(0)

  if (comp.status === 'loading') {
    return <main className="edoc-wrap"><div className="edoc"><p className="empty-note">{c.loading}</p></div></main>
  }
  if (comp.status !== 'ready') {
    return <main className="edoc-wrap"><div className="edoc"><p className="empty-note">{c.loadFailed}</p></div></main>
  }

  const order = comp.working.order
  const cases = comp.cases
  const status = rollupStatus(cases)

  function dropOn(targetId: string) {
    if (dragging === null || dragging === targetId) return
    const next = [...order]
    const [moved] = next.splice(next.indexOf(dragging), 1)
    next.splice(next.indexOf(targetId), 0, moved)
    comp.reorder(next)
    setDragging(null)
  }
  function move(id: string, delta: number) {
    const from = order.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= order.length) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    comp.reorder(next)
  }
  function removeFromScenario(id: string) {
    comp.removeFromScenario(id)
    if (selected === id) setSelected(null)
  }

  const selectedCase =
    selected !== null && order.includes(selected) ? comp.working.caseById[selected] ?? null : null

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
                <li key={id} style={{ listStyle: 'none' }}>
                  <button
                    className={'fnode' + (selected === id ? ' sel' : '') + (dragging === id ? ' dragging' : '')}
                    draggable={editable}
                    onClick={() => setSelected(selected === id ? null : id)}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(event) => { if (editable) event.preventDefault() }}
                    onDragStart={() => setDragging(id)}
                    onDrop={(event) => { if (editable) { event.preventDefault(); dropOn(id) } }}
                    type="button"
                  >
                    <span className="handle" aria-hidden="true">⠿</span>
                    <span className="fnode-num">{String(index + 1).padStart(2, '0')}</span>
                    <span className="fnode-main">
                      <span className="fnode-title">{testCase.title.length > 0 ? testCase.title : c.newCaseTitle}</span>
                      <CategoryChip category={testCase.category} />
                    </span>
                    <span className="fnode-id mono">{testCase.id}</span>
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
          </div>
        )}

        {showNew && editable && (
          <NewCaseForm
            onCancel={() => setShowNew(false)}
            onCreate={async (input) => {
              const created = await comp.createAndAdd(input)
              if (created === null) return false
              setSelected(created.id)
              setShowNew(false)
              setLibReload((n) => n + 1)
              return true
            }}
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
          />
        )}

        {editable && (
          <CaseLibrary
            projectId={projectId}
            reloadKey={libReload}
            inScenario={new Set(order)}
            onAdd={(testCase) => comp.addExisting(testCase)}
            onRemove={removeFromScenario}
            onDelete={(id) => comp.deleteCase(id)}
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
  onEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  testCase: TestCase
  position: number
  total: number
  readOnly: boolean
  onEdit: (patch: Partial<TestCase>) => void
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
        <span className="mono" style={{ color: 'var(--st-muted)', fontSize: 12 }}>{testCase.id}</span>
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

      <p className="flow-label" style={{ margin: '12px 0 0' }}>
        {d.lastBuild}: <span className="mono">{testCase.lastVerifiedBuildId ?? d.none}</span>
      </p>
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
