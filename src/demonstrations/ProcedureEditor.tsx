import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { procedureApprovable, procedureDraftValid, textLines } from './procedure'
import type { DemonstrationEvent, Outcome, ProcedureRevision, VerificationProcedure } from './types'

export function ProcedureEditor({ revision, events, busy, onSave, onReview }: {
  revision: ProcedureRevision; events: DemonstrationEvent[]; busy: boolean
  onSave: (procedure: VerificationProcedure) => void; onReview: (action: 'approve' | 'revoke') => void
}) {
  const { t } = useI18n()
  const copy = t.demonstrations
  const section = useRef<HTMLElement>(null)
  useEffect(() => { section.current?.focus() }, [])
  const [draft, setDraft] = useState(revision.procedure)
  const eventIds = events.map((event) => event.id)
  const dirty = JSON.stringify(draft) !== JSON.stringify(revision.procedure)
  const change = <K extends keyof VerificationProcedure>(key: K, value: VerificationProcedure[K]) => setDraft((previous) => ({ ...previous, [key]: value }))
  const statusLabels = { DRAFT: copy.draft, APPROVED: copy.approved, SUPERSEDED: copy.superseded, REVOKED: copy.revoked }
  function lines(key: 'preconditions' | 'facts' | 'inferences' | 'unresolvedQuestions', label: string) {
    return <LineField label={label} hint={copy.lineHint} initial={draft[key]} onChange={(value) => change(key, value)} />
  }
  return <section className="demo-procedure" ref={section} tabIndex={-1} aria-label={copy.procedure}>
    <h3>{copy.procedure}</h3>
    <p>{copy.revision} {revision.revision} · {statusLabels[revision.status]}</p>
    <div className="demo-procedure-summary">
      <h4>{draft.title}</h4>
      <p>{copy.outcome}: {draft.observedOutcome === 'PASS' ? copy.pass : draft.observedOutcome === 'FAIL' ? copy.fail : copy.inconclusive}</p>
      <h4>{copy.preconditions}</h4><ul>{draft.preconditions.map((line, index) => <li key={index}>{line}</li>)}</ul>
      <h4>{copy.steps}</h4><ol>{draft.steps.map((step, index) => <li key={index}><p>{step.instruction}</p><p className="demo-hint">{copy.completion}: {step.completionCondition}</p></li>)}</ol>
      <h4>{copy.assertions}</h4><ul>{draft.assertions.map((assertion, index) => <li key={index}><p>{assertion.expected}</p><p className="demo-hint">{copy.failureCondition}: {assertion.failure} · {copy.when}: {assertion.when}</p></li>)}</ul>
      {draft.unresolvedQuestions.length > 0 && <div role="status"><h4>{copy.questions}</h4><ul>{draft.unresolvedQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul><p className="demo-hint">{copy.questionsHint}</p></div>}
    </div>
    <fieldset disabled={busy}>
      <details><summary>{copy.editProcedure}</summary>
      <label>{copy.procedureTitle}<input value={draft.title} onChange={(event) => change('title', event.target.value)} /></label>
      <label>{copy.outcome}<select value={draft.observedOutcome} onChange={(event) => change('observedOutcome', event.target.value as Outcome)}>
        <option value="PASS">{copy.pass}</option><option value="FAIL">{copy.fail}</option><option value="INCONCLUSIVE">{copy.inconclusive}</option>
      </select></label>
      {lines('preconditions', copy.preconditions)}
      <h4>{copy.steps}</h4>
      {draft.steps.map((step, index) => <fieldset className="demo-item" key={index}>
        <legend>{copy.steps} {index + 1}</legend>
        {(['instruction', 'target', 'completionCondition'] as const).map((key) => <label key={key}>{key === 'instruction' ? copy.instruction : key === 'target' ? copy.target : copy.completion}
          <textarea value={step[key]} onChange={(event) => change('steps', draft.steps.map((entry, position) => position === index ? { ...entry, [key]: event.target.value } : entry))} />
        </label>)}
        <SourceReferences events={events} selected={step.evidenceEventIds} onChange={(evidenceEventIds) => change('steps', draft.steps.map((entry, position) => position === index ? { ...entry, evidenceEventIds } : entry))} />
        <button type="button" onClick={() => change('steps', draft.steps.filter((_, position) => position !== index))}>{copy.remove}</button>
      </fieldset>)}
      <button type="button" onClick={() => change('steps', [...draft.steps, { instruction: '', target: '', completionCondition: '', evidenceEventIds: [] }])}>{copy.add}</button>
      <h4>{copy.assertions}</h4>
      {draft.assertions.map((assertion, index) => <fieldset className="demo-item" key={index}>
        <legend>{copy.assertions} {index + 1}</legend>
        {(['expected', 'failure', 'when'] as const).map((key) => <label key={key}>{key === 'expected' ? copy.expected : key === 'failure' ? copy.failureCondition : copy.when}
          <textarea value={assertion[key]} onChange={(event) => change('assertions', draft.assertions.map((entry, position) => position === index ? { ...entry, [key]: event.target.value } : entry))} />
        </label>)}
        <SourceReferences events={events} selected={assertion.evidenceEventIds} onChange={(evidenceEventIds) => change('assertions', draft.assertions.map((entry, position) => position === index ? { ...entry, evidenceEventIds } : entry))} />
        <button type="button" onClick={() => change('assertions', draft.assertions.filter((_, position) => position !== index))}>{copy.remove}</button>
      </fieldset>)}
      <button type="button" onClick={() => change('assertions', [...draft.assertions, { expected: '', failure: '', when: '', evidenceEventIds: [] }])}>{copy.add}</button>
      {lines('facts', copy.facts)}{lines('inferences', copy.inferences)}{lines('unresolvedQuestions', copy.questions)}

      {!procedureDraftValid(draft, eventIds) && <p role="status">{copy.invalidProcedure}</p>}
      <div className="demo-actions"><button type="button" className="button button--secondary" disabled={!dirty || !procedureDraftValid(draft, eventIds)} onClick={() => onSave(draft)}>{copy.save}</button></div>
      </details>
      <p className="demo-hint">{copy.approvalHint}</p>
      <div className="demo-actions">
        <button type="button" className="button button--primary" disabled={dirty || revision.status !== 'DRAFT' || !procedureApprovable(draft, eventIds)} onClick={() => onReview('approve')}>{copy.approve}</button>
        {revision.status === 'APPROVED' && <button type="button" className="button button--secondary" onClick={() => onReview('revoke')}>{copy.revoke}</button>}
      </div>
    </fieldset>
  </section>
}

function LineField({ label, hint, initial, onChange }: { label: string; hint: string; initial: string[]; onChange: (lines: string[]) => void }) {
  const [text, setText] = useState(initial.join('\n'))
  return <label>{label}<textarea aria-description={hint} value={text} onChange={(event) => { setText(event.target.value); onChange(textLines(event.target.value)) }} /></label>
}

function SourceReferences({ events, selected, onChange }: { events: DemonstrationEvent[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const { t } = useI18n()
  const copy = t.demonstrations
  const labels = { INPUT: copy.input, ACTION_RESULT: copy.result, PULSE: copy.pulse, EVIDENCE: copy.evidence, ANNOTATION: copy.annotation, CONTROL: copy.control }
  return <fieldset><legend>{copy.sources}</legend>
    <div>{selected.map((id) => <a key={id} href={'#demo-event-' + id}>#{id} </a>)}</div>
    <div className="demo-source-options">{events.map((event) => <label key={event.id}>
      <input type="checkbox" checked={selected.includes(event.id)} onChange={(change) => onChange(change.target.checked ? [...selected, event.id] : selected.filter((id) => id !== event.id))} />
      #{event.id} · {labels[event.kind]} · {new Date(event.createdAt).toLocaleTimeString()}
    </label>)}</div>
  </fieldset>
}
