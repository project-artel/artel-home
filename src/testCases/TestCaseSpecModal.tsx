import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { listTestCases } from './testCaseApi'
import type { TestCase } from './testCaseTypes'

/**
 * Read-only browser of every TestCase in the project (ARTEL-289 #4). Opened from
 * the scenario studio to look up the full spec while authoring steps — a scrollable
 * list with a client-side filter. Purely 조회: no editing, no linking. Internal ids
 * stay hidden (rows are numbered by position only), matching the studio's "TC ID
 * 노출 금지" rule.
 */
export function TestCaseSpecModal({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const m = t.scenarios.specViewer
  const [cases, setCases] = useState<TestCase[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setState('loading')
    listTestCases(projectId, {}, controller.signal)
      .then((list) => { setCases(list); setState('ready') })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState('error')
      })
    return () => controller.abort()
  }, [projectId])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Numbering follows the loaded order so a filtered view keeps stable ordinals.
  const numbered = useMemo(
    () => cases.map((testCase, index) => ({ testCase, no: index + 1 })),
    [cases],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length === 0) return numbered
    return numbered.filter(({ testCase }) =>
      [testCase.title, testCase.category, testCase.precondition, testCase.expected]
        .some((field) => (field ?? '').toLowerCase().includes(q)),
    )
  }, [numbered, query])

  return (
    <div className="tc-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tc-spec" role="dialog" aria-modal="true" aria-labelledby="tc-spec-title">
        <div className="tc-spec-head">
          <h3 id="tc-spec-title" className="tc-spec-title">{m.title}</h3>
          <span className="tc-spec-count">{m.count(state === 'ready' ? cases.length : 0)}</span>
          <button className="tc-modal-close" aria-label={m.close} onClick={onClose} type="button">✕</button>
        </div>
        <div className="tc-spec-search">
          <input
            className="tc-spec-search-input"
            value={query}
            placeholder={m.search}
            aria-label={m.search}
            onChange={(ev) => setQuery(ev.target.value)}
          />
        </div>
        <div className="tc-spec-body">
          {state === 'loading' && <p className="tc-modal-note">{m.loading}</p>}
          {state === 'error' && <p className="tc-modal-note">{m.error}</p>}
          {state === 'ready' && filtered.length === 0 && <p className="tc-modal-note">{m.empty}</p>}
          {state === 'ready' && filtered.length > 0 && (
            <ol className="tc-spec-list">
              {filtered.map(({ testCase, no }) => (
                <li key={no} className="tc-spec-item">
                  <div className="tc-spec-item-head">
                    <span className="st-tc-badge">TC {no}</span>
                    {testCase.category && <span className="tc-modal-cat">{testCase.category}</span>}
                    <span className="tc-spec-item-title">{testCase.title || m.untitled}</span>
                  </div>
                  <dl className="tc-modal-fields">
                    <dt>{m.precondition}</dt>
                    <dd>{testCase.precondition && testCase.precondition.length > 0 ? testCase.precondition : '—'}</dd>
                    <dt>{m.expected}</dt>
                    <dd>{testCase.expected || '—'}</dd>
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
