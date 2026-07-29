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
 * The shared case library: every case in the project, filterable by status,
 * with each row showing whether it is already in this scenario.
 *
 * Adding pulls an existing case into the scenario's composition; removing takes
 * it back out without touching the case. Deleting destroys the case for the
 * whole project, so it is the one action that reaches past this scenario.
 */
export function CaseLibrary({
  projectId,
  inScenario,
  onAdd,
  onRemove,
  onDelete,
  onClose,
}: {
  projectId: string
  inScenario: Set<string>
  onAdd: (testCase: TestCase) => void
  onRemove: (caseId: string) => void
  onDelete: (caseId: string) => Promise<boolean>
  onClose: () => void
}) {
  const { t } = useI18n()
  const l = t.scenarios.composition.library
  const status = t.scenarios.composition.status
  const [cases, setCases] = useState<TestCase[]>([])
  const [filter, setFilter] = useState<Filter>('ALL')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    listTestCases(projectId, {}, controller.signal)
      .then((list) => setCases(list))
      .catch(() => undefined)
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [projectId])

  const shown = filter === 'ALL' ? cases : cases.filter((testCase) => testCase.verificationStatus === filter)

  return (
    <section className="case-library">
      <header className="case-library-head">
        <h3>{l.title}</h3>
        <button className="button button--secondary button--compact" onClick={onClose} type="button">{l.close}</button>
      </header>

      <div className="case-library-filters">
        {(['ALL', ...VERIFICATION_STATUSES] as Filter[]).map((f) => (
          <button
            className={filter === f ? 'fchip on' : 'fchip'}
            key={f}
            onClick={() => setFilter(f)}
            type="button"
          >
            {f === 'ALL' ? l.filterAll : status[f]}
          </button>
        ))}
      </div>

      <div className="case-library-list">
        {loading ? (
          <p className="panel-empty">{l.loading}</p>
        ) : shown.length === 0 ? (
          <p className="panel-empty">{l.empty}</p>
        ) : (
          shown.map((testCase) => {
            const inside = inScenario.has(testCase.id)
            return (
              <div className={inside ? 'case-library-row' : 'case-library-row is-out'} key={testCase.id}>
                <span className={`vdot vdot--${testCase.verificationStatus.toLowerCase()}`} aria-hidden="true" />
                <div className="case-library-main">
                  <div className="case-library-title">{testCase.title.length > 0 ? testCase.title : testCase.id}</div>
                  <div className="case-library-sub">
                    {testCase.category} · {status[testCase.verificationStatus]} · <span className="mono">{testCase.id}</span>
                  </div>
                </div>
                <div className="case-library-actions">
                  {inside ? (
                    <button className="membtn in" onClick={() => onRemove(testCase.id)} type="button">{l.added}</button>
                  ) : (
                    <button className="membtn out" onClick={() => onAdd(testCase)} type="button">{l.add}</button>
                  )}
                  <button
                    className="button button--danger-quiet button--compact"
                    onClick={() => {
                      void onDelete(testCase.id).then((ok) => {
                        if (ok) setCases((current) => current.filter((existing) => existing.id !== testCase.id))
                      })
                    }}
                    type="button"
                  >
                    {l.delete}
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
