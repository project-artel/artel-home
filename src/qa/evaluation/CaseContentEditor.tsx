import { useEffect, useState } from 'react'
import { getTestCase, updateTestCase } from '../../testCases/testCaseApi'
import * as api from './evaluationApi'
import type { evaluationCopy } from './evaluationCopy'

type Props = {
  projectId: string
  attempt: api.Attempt
  copy: (typeof evaluationCopy)['ko' | 'en']
  onRevision: (value: api.RevisedCase) => void
  onReported: () => void
}

const editable = ['precondition', 'step', 'expected'] as const
const fields = ['scene', ...editable] as const

function content(row: Awaited<ReturnType<typeof getTestCase>>): api.RevisedCase {
  return { scene: row.scene, precondition: row.precondition, step: row.step, expected: row.expectedValue }
}

export function CaseContentEditor({ projectId, attempt, copy, onRevision, onReported }: Props) {
  const [issue, setIssue] = useState<api.ContentReview | null>(null)
  const [checked, setChecked] = useState(false)
  const [note, setNote] = useState('')
  const [beforeEdit, setBeforeEdit] = useState<api.RevisedCase | null>(null)
  const [draft, setDraft] = useState<api.RevisedCase | null>(null)
  const [saved, setSaved] = useState<api.RevisedCase | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const { id, logId, testCaseId } = attempt
  const report = issue?.attemptId === id ? issue : null

  useEffect(() => {
    const controller = new AbortController()
    void api.contentReviews(projectId, testCaseId, controller.signal).then(rows => {
      if (!controller.signal.aborted) setIssue(rows[0] ?? null)
    }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [projectId, testCaseId])

  async function edit() {
    setBusy(true)
    setError(false)
    try {
      const current = content(await getTestCase(projectId, testCaseId))
      setBeforeEdit(current)
      setDraft(current)
    }
    catch { setError(true) }
    finally { setBusy(false) }
  }

  async function saveCase(value: api.RevisedCase) {
    setBusy(true)
    setError(false)
    try {
      const current = content(await updateTestCase(projectId, testCaseId, {
        precondition: value.precondition ?? '', step: value.step, expectedValue: value.expected,
      }))
      setDraft(null)
      setSaved(current)
      onRevision(current)
      void api.contentReviews(projectId, testCaseId).then(rows => setIssue(rows[0] ?? null)).catch(() => setError(true))
      window.dispatchEvent(new CustomEvent('artel:case-content-review', { detail: projectId }))
    } catch { setError(true) }
    finally { setBusy(false) }
  }

  async function reportIssue() {
    if (!logId) return
    setBusy(true)
    setError(false)
    try {
      await api.reportContentIssue(projectId, logId, note)
      const rows = await api.contentReviews(projectId, testCaseId)
      setIssue(rows[0] ?? null)
      onReported()
      window.dispatchEvent(new CustomEvent('artel:case-content-review', { detail: projectId }))
    } catch { setError(true) }
    finally { setBusy(false) }
  }

  async function loadRevision() {
    setBusy(true)
    setError(false)
    try {
      const current = content(await getTestCase(projectId, testCaseId))
      setSaved(current)
      onRevision(current)
    } catch { setError(true) }
    finally { setBusy(false) }
  }

  return <section className="qe-form" aria-label={copy.TC_CONTENT_ISSUE}>
    <label className="qe-option">
      <input type="checkbox" checked={checked || report !== null} disabled={busy || report !== null}
        onChange={event => setChecked(event.target.checked)} /> {copy.TC_CONTENT_ISSUE}
    </label>
    {checked && !report && <form className="qe-form qe-form--nested" onSubmit={event => {
      event.preventDefault()
      void reportIssue()
    }}>
      <label>{copy.contentReason}<textarea className="field-input field-input--multiline" maxLength={2000}
        value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label>
      <div className="qe-form-foot"><button className="button button--secondary button--compact" disabled={busy}>{copy.reportIssue}</button></div>
    </form>}
    {report?.note && <p className="qe-verdict-text">{report.note}</p>}
    {report && !draft && !saved && <div className="qe-form-foot">
      {report.revisedAt
        ? <button type="button" className="button button--secondary button--compact" disabled={busy} onClick={() => void loadRevision()}>{copy.revisedCase}</button>
        : <button type="button" className="button button--secondary button--compact" disabled={busy} onClick={() => void edit()}>{copy.editCase}</button>}
    </div>}
    {draft && <form className="qe-form qe-form--nested" onSubmit={event => {
      event.preventDefault()
      void saveCase(draft)
    }}>
      {editable.map(field => <label key={field}>{copy[field]}<textarea className="field-input field-input--multiline"
        required={field !== 'precondition'} value={draft[field] ?? ''} disabled={busy}
        onChange={event => setDraft({ ...draft, [field]: event.target.value })} /></label>)}
      <div className="qe-form-foot">
        <button type="button" className="button button--secondary button--compact" disabled={busy} onClick={() => setDraft(null)}>{copy.cancelEdit}</button>
        <button className="button button--primary button--compact" disabled={busy || editable.every(field => (draft[field] ?? '') === (beforeEdit?.[field] ?? ''))}>{copy.caseSave}</button>
      </div>
    </form>}
    {(report?.state === 'NEEDS_REVALIDATION' || (report?.state === 'NEEDS_REVISION' && saved)) && <span className="qe-meta">{copy.revalidationNeeded}</span>}
    {saved && <div className="qe-case-comparison">
      {[{ label: copy.originalCase, value: attempt.caseSnapshot }, { label: copy.revisedCase, value: saved }].map(side =>
        <div key={side.label}><strong>{side.label}</strong><dl className="qe-snapshot">{fields.filter(field => attempt.caseSnapshot?.[field] !== saved[field]).map(field =>
          <div key={field}><dt>{copy[field]}</dt><dd>{side.value?.[field] ?? '—'}</dd></div>)}</dl></div>)}
    </div>}
    {error && <p className="qe-status" role="alert">{copy.error}</p>}
  </section>
}
