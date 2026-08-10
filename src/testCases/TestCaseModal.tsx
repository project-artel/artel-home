import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { getTestCase } from './testCaseApi'
import type { TestCase } from './testCaseTypes'

/**
 * Read-only view of a single TestCase's content (ARTEL-289 #3), opened from a
 * step's TC badge. Shows what the case verifies (scene/category, precondition,
 * expected) — never the internal id (the caller passes a human `label` like
 * "TC 2"). Fetched on open by `caseId`, which stays out of the UI.
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
            <h3 id="tc-modal-title" className="tc-modal-title">{testCase.title || m.untitled}</h3>
            {testCase.category && <span className="tc-modal-cat">{testCase.category}</span>}
            <dl className="tc-modal-fields">
              <dt>{m.precondition}</dt>
              <dd>{testCase.precondition && testCase.precondition.length > 0 ? testCase.precondition : '—'}</dd>
              <dt>{m.expected}</dt>
              <dd>{testCase.expected || '—'}</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
