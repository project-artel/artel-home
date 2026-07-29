import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { listTestCases } from '../testCases/testCaseApi'
import {
  VERIFICATION_STATUSES,
  type TestCase,
  type VerificationStatus,
} from '../testCases/testCaseTypes'

type Filter = 'ALL' | VerificationStatus

/**
 * The shared case library, styled to the studio mockup. Adding pulls an
 * existing case into the scenario; removing takes it back out without deleting;
 * deleting destroys the case for the whole project.
 */
export function CaseLibrary({
  projectId,
  reloadKey,
  inScenario,
  onAdd,
  onRemove,
  onDelete,
}: {
  projectId: string
  /** Bumped by the parent when a case is created, so the always-visible list re-fetches. */
  reloadKey: number
  inScenario: Set<string>
  onAdd: (testCase: TestCase) => void
  onRemove: (caseId: string) => void
  onDelete: (caseId: string) => Promise<boolean>
}) {
  const { t } = useI18n()
  const l = t.scenarios.composition.library
  const statusLabel = t.scenarios.composition.status
  const [cases, setCases] = useState<TestCase[]>([])
  const [filter, setFilter] = useState<Filter>('ALL')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    listTestCases(projectId, {}, controller.signal)
      .then(setCases)
      .catch(() => undefined)
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [projectId, reloadKey])

  const q = query.trim().toLowerCase()
  const shown = cases.filter(
    (testCase) =>
      (filter === 'ALL' || testCase.verificationStatus === filter) &&
      (q === '' ||
        testCase.title.toLowerCase().includes(q) ||
        testCase.category.toLowerCase().includes(q) ||
        testCase.id.includes(q)),
  )

  return (
    <section className="lib">
      <div className="lib-head">
        <h3>{l.title}</h3>
        <span className="count-pill" style={{ marginLeft: 'auto' }}>{shown.length}/{cases.length}</span>
      </div>
      <div className="lib-search">
        <span className="lib-search-icon" aria-hidden="true">⌕</span>
        <input
          className="lib-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={l.searchPlaceholder}
          type="search"
          value={query}
        />
        {query.length > 0 && (
          <button aria-label={l.clear} className="lib-search-clear" onClick={() => setQuery('')} type="button">✕</button>
        )}
      </div>
      <div className="lib-filter">
        {(['ALL', ...VERIFICATION_STATUSES] as Filter[]).map((f) => (
          <button className={filter === f ? 'fchip on' : 'fchip'} key={f} onClick={() => setFilter(f)} type="button">
            {f === 'ALL' ? l.filterAll : statusLabel[f]}
          </button>
        ))}
      </div>
      <div className="lib-list">
        {loading ? (
          <p className="empty-note">{l.loading}</p>
        ) : shown.length === 0 ? (
          <p className="empty-note">{cases.length === 0 ? l.empty : l.noMatch}</p>
        ) : (
          shown.map((testCase) => {
            const inside = inScenario.has(testCase.id)
            return (
              <div className={inside ? 'librow' : 'librow dim'} key={testCase.id}>
                <span className={`vdot ${testCase.verificationStatus}`} />
                <div>
                  <div className="lib-title">{testCase.title.length > 0 ? testCase.title : testCase.id}</div>
                  <div className="lib-sub">{testCase.category} · {statusLabel[testCase.verificationStatus]} · <span className="mono">{testCase.id}</span></div>
                </div>
                <div className="lib-actions">
                  {inside ? (
                    <button className="membtn in" onClick={() => onRemove(testCase.id)} type="button">{l.added}</button>
                  ) : (
                    <button className="membtn out" onClick={() => onAdd(testCase)} type="button">{l.add}</button>
                  )}
                  <button
                    className="iconbtn"
                    onClick={() => {
                      void onDelete(testCase.id).then((ok) => {
                        if (ok) setCases((current) => current.filter((existing) => existing.id !== testCase.id))
                      })
                    }}
                    title={l.delete}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
