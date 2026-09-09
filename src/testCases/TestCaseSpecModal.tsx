import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { CaseListRow } from './CaseListRow'
import { CaseSceneFilter } from './CaseSceneFilter'
import { SceneChip } from './SceneChip'
import { SpecGradeChip } from './SpecGradeChip'
import { listTestCases } from './testCaseApi'
import { VERIFICATION_STATUSES, type TestCase, type VerificationStatus } from './testCaseTypes'
import { useCaseListNav } from './useCaseListNav'

type Filter = 'ALL' | VerificationStatus

/**
 * Read-only ⌘K browser of every TestCase in the project (ARTEL-289 #4). Reuses the
 * pre-Step-model command palette design (씬 chips + verification-status
 * filter + detail panel) — 조회 전용이라 시나리오에 담고 빼는 토글은 없다. Internal
 * ids stay hidden (rows number by position). Keyboard: ↑↓ move, Esc close.
 */
export function TestCaseSpecModal({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const p = t.scenarios.palette
  const statusLabel = t.scenarios.composition.status

  const [cases, setCases] = useState<TestCase[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Filter>('ALL')
  const [scene, setScene] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const controller = new AbortController()
    listTestCases(projectId, controller.signal)
      .then(setCases)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadFailed(true)
      })
    return () => controller.abort()
  }, [projectId])

  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      cases.filter(
        (testCase) =>
          (status === 'ALL' || testCase.verificationStatus === status) &&
          (scene === '' || testCase.scene === scene) &&
          (q === '' ||
            testCase.step.toLowerCase().includes(q) ||
            testCase.scene.toLowerCase().includes(q) ||
            (testCase.precondition ?? '').toLowerCase().includes(q) ||
            testCase.expectedValue.toLowerCase().includes(q)),
      ),
    [cases, status, scene, q],
  )

  const nav = useCaseListNav(shown.length)
  const { active, edge: listEdge, listRef, setActive } = nav

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    nav.onKeyDown(event)
  }

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp" onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown} role="dialog" aria-modal="true">
        <div className="cp-search">
          <span className="cp-search-icon" aria-hidden="true">⌕</span>
          <input className="cp-input" onChange={(event) => setQuery(event.target.value)} placeholder={p.searchPlaceholder} ref={inputRef} value={query} />
          <button className="cp-esc" onClick={onClose} type="button">ESC</button>
        </div>

        <div className="cp-filter-row">
          <span className="cp-filter-label">{p.statusLabel}</span>
          <div className="cp-chips">
            {(['ALL', ...VERIFICATION_STATUSES] as Filter[]).map((f) => (
              <button className={status === f ? 'fchip on' : 'fchip'} key={f} onClick={() => setStatus(f)} type="button">
                {f !== 'ALL' && <span className={`vdot ${f}`} />}{f === 'ALL' ? p.statusAll : statusLabel[f]}
              </button>
            ))}
          </div>
        </div>

        <CaseSceneFilter
          cases={cases}
          labels={{ all: p.sceneAll, noMatch: p.noMatch, scene: p.sceneLabel, search: p.sceneSearch }}
          onChange={setScene}
          value={scene}
        />

        <div className="cp-body">
          <div className={'cp-listwrap' + (listEdge.top ? ' at-top' : '') + (listEdge.bottom ? ' at-bottom' : '')}>
            <div className="cp-fade cp-fade--top" aria-hidden="true"><span className="cp-fade-hint">▴</span></div>
            <div className="cp-list" onScroll={nav.onScroll} ref={listRef}>
              {shown.length === 0 ? (
                <p className="cp-empty">{loadFailed ? p.noMatch : cases.length === 0 ? p.empty : p.noMatch}</p>
              ) : (
                shown.map((testCase, index) => (
                  <CaseListRow
                    active={index === active}
                    fallbackTitle={`TC ${index + 1}`}
                    index={index}
                    key={testCase.id}
                    onClick={() => setActive(index)}
                    onMouseEnter={() => setActive(index)}
                    statusLabel={statusLabel[testCase.verificationStatus]}
                    testCase={testCase}
                  />
                ))
              )}
            </div>
            <div className="cp-fade cp-fade--bottom" aria-hidden="true"><span className="cp-fade-hint">▾</span></div>
          </div>

          {shown[active] !== undefined && (
            <aside className="cp-info">
              {(() => {
                const info = shown[active]
                return (
                  <>
                    <div className="cp-info-head">
                      <span className={`vdot ${info.verificationStatus}`} />
                      <span className="cp-info-title">{info.step.length > 0 ? info.step : `TC ${active + 1}`}</span>
                    </div>
                    <div className="cp-info-tags">
                      <SceneChip scene={info.scene} />
                      <span className={`vpill ${info.verificationStatus}`}><span className={`vdot ${info.verificationStatus}`} />{statusLabel[info.verificationStatus]}</span>
                      {/* Always here, settled or not — the pane is the answer to
                          "what is this case?", so the grade belongs in it.
                          `evidenceGaps` does NOT: the list response omits it by
                          design, and this pane reads from the list. */}
                      <SpecGradeChip status={info.status} />
                    </div>
                    <dl className="cp-info-fields">
                      <dt>{p.infoPre}</dt>
                      <dd>{info.precondition !== null && info.precondition.length > 0 ? info.precondition : <span className="cp-info-none">—</span>}</dd>
                      <dt>{p.infoExp}</dt>
                      <dd>{info.expectedValue.length > 0 ? info.expectedValue : <span className="cp-info-none">—</span>}</dd>
                    </dl>
                  </>
                )
              })()}
            </aside>
          )}
        </div>

        <div className="cp-foot">
          <span>↑↓ {p.hintNav} · esc {p.hintClose}</span>
          <span>{shown.length} / {cases.length}</span>
        </div>

      </div>
    </div>
  )
}
