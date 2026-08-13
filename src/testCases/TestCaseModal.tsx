import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { SceneChip } from './SceneChip'
import { SpecGradeChip } from './SpecGradeChip'
import { getTestCase } from './testCaseApi'
import type { TestCase } from './testCaseTypes'

/**
 * Read-only view of a single TestCase's content (ARTEL-289 #3), opened from a
 * step's TC badge. Shows what the case verifies — the screen, both statuses, the
 * precondition and the expected value — never the internal id (the
 * caller passes a human `label` like "TC 2"). Fetched on open by `caseId`, which
 * stays out of the UI.
 *
 * This card is the only place the spec's grade is shown, and the only place it
 * is used at all: the authoring agent deliberately never sees it (a grade is the
 * spec author's self-assessment, so treating it as evidence would just be one
 * model believing another's opinion). Invisible here means unused everywhere.
 */
export function TestCaseModal({
  projectId,
  caseId,
  label,
  onClose,
}: {
  projectId: string
  caseId: number
  label: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const m = t.scenarios.tcModal
  const statusLabel = t.scenarios.composition.status
  const [testCase, setTestCase] = useState<TestCase | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    setState('loading')
    getTestCase(projectId, String(caseId), controller.signal)
      .then((tc) => { setTestCase(tc); setState('ready') })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState('error')
      })
    return () => controller.abort()
  }, [projectId, caseId])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="tc-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tc-modal" role="dialog" aria-modal="true" aria-labelledby="tc-modal-title">
        <div className="tc-modal-head">
          <span className="st-tc-badge">{label}</span>
          <button className="tc-modal-close" aria-label={m.close} onClick={onClose} type="button">✕</button>
        </div>
        {state === 'loading' && <p className="tc-modal-note">{m.loading}</p>}
        {state === 'error' && <p className="tc-modal-note">{m.error}</p>}
        {state === 'ready' && testCase !== null && (
          <div className="tc-modal-body">
            <h3 id="tc-modal-title" className="tc-modal-title">{testCase.step || m.untitled}</h3>
            <div className="tc-modal-tags">
              <SceneChip scene={testCase.scene} />
              <span className={`vpill ${testCase.verificationStatus}`}>
                <span className={`vdot ${testCase.verificationStatus}`} />{statusLabel[testCase.verificationStatus]}
              </span>
              {/* The spec author's own grade, kept beside ours rather than merged:
                  "the spec is settled" and "we have verified it" are different claims.
                  Shown even when settled — this card is where that question gets
                  asked directly, so the boring answer still belongs. */}
              <SpecGradeChip status={testCase.status} />
            </div>
            <dl className="tc-modal-fields">
              <div className="tc-field">
                <dt className="tc-field-label">{m.precondition}</dt>
                <dd className="tc-field-val">{testCase.precondition && testCase.precondition.length > 0 ? testCase.precondition : '—'}</dd>
              </div>
              <div className="tc-field">
                <dt className="tc-field-label">{m.expected}</dt>
                <dd className="tc-field-val">{testCase.expectedValue || '—'}</dd>
              </div>
              {/* Only when there is something to say. An empty "reasons" row would
                  read as "we looked and found none", which is a different claim
                  from the spec never having sent any. */}
              {testCase.evidenceGaps.length > 0 && (
                <div className="tc-field">
                  <dt className="tc-field-label">{m.evidenceGaps}</dt>
                  <dd className="tc-field-val">
                    <ul className="tc-gap-list">
                      {testCase.evidenceGaps.map((gap, index) => (
                        <li key={`${gap}-${index}`} className="tc-gap">{gap}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
