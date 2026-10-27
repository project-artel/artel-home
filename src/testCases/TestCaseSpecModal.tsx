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
 *
 * **고르기(ARTEL-1115).** `onPick` 을 주면 스텝에 붙일 TC 를 고르는 창이 된다 — 가져다 대면 오른쪽에 미리 보고,
 * 누르거나 Enter 로 고른다. 이때 목록은 부르는 쪽이 넘긴 `cases`(런이 따르는 빌드 버전의 TC)이고, 다른 버전의
 * TC 는 처음부터 보이지 않는다. QA 는 런 버전에 없는 TC 의 연결을 지우기 때문이다.
 */
export function TestCaseSpecModal({
  gameBuildId,
  projectId,
  onClose,
  cases: givenCases,
  onPick,
  currentCaseId = null,
  scope,
}: {
  gameBuildId?: string | null
  projectId: string
  onClose: () => void
  /** 미리 읽어 둔 TC. 주면 프로젝트 전량을 따로 읽지 않는다. */
  cases?: TestCase[]
  onPick?: (testCase: TestCase) => void
  /** 고르기 창에서 지금 연결된 TC — 미리 보기에 표시한다. */
  currentCaseId?: number | null
  /** 고르기 창의 범위 안내 — "이 런이 따르는 1.1 버전의 TC" 처럼. */
  scope?: string
}) {
  const { t } = useI18n()
  const p = t.scenarios.palette
  const statusLabel = t.scenarios.composition.status

  const [loadedCases, setCases] = useState<TestCase[]>([])
  const cases = givenCases ?? loadedCases
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Filter>('ALL')
  const [scene, setScene] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (givenCases !== undefined) return undefined
    const controller = new AbortController()
    listTestCases(projectId, controller.signal)
      .then(setCases)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadFailed(true)
      })
    return () => controller.abort()
  }, [projectId, givenCases])

  const q = query.replace(/`/g, '').trim().toLowerCase()
  const shown = useMemo(
    () =>
      cases.filter(
        (testCase) =>
          (status === 'ALL' || testCase.verificationStatus === status) &&
          (scene === '' || testCase.scene === scene) &&
          // 명세 글은 이름을 백틱으로 감싼다. 쳐 넣는 사람은 백틱을 치지 않으니 빼고 맞춘다.
          (q === '' ||
            [testCase.step, testCase.scene, testCase.precondition ?? '', testCase.expectedValue]
              .some((part) => part.replace(/`/g, '').toLowerCase().includes(q))),
      ),
    [cases, status, scene, q],
  )

  const nav = useCaseListNav(shown.length)
  const { active, edge: listEdge, listRef, setActive } = nav

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key === 'Enter' && onPick !== undefined && shown[active] !== undefined && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onPick(shown[active])
      return
    }
    nav.onKeyDown(event)
  }

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className={onPick !== undefined ? 'cp cp--pick' : 'cp'} onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown} role="dialog" aria-modal="true">
        {scope !== undefined && <p className="cp-pick-scope">{scope}</p>}
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
                    gameBuildId={gameBuildId}
                    active={index === active}
                    fallbackTitle={`TC ${index + 1}`}
                    index={index}
                    key={testCase.id}
                    onClick={() => (onPick !== undefined ? onPick(testCase) : setActive(index))}
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
                      {currentCaseId !== null && String(currentCaseId) === info.id && <span className="cp-info-current">{p.pickCurrent}</span>}
                    </div>
                    <dl className="cp-info-fields">
                      <dt>{p.infoPre}</dt>
                      <dd>{info.precondition !== null && info.precondition.length > 0 ? info.precondition : <span className="cp-info-none">—</span>}</dd>
                      <dt>{p.infoExp}</dt>
                      <dd>{info.expectedValue.length > 0 ? info.expectedValue : <span className="cp-info-none">—</span>}</dd>
                    </dl>
                    {onPick !== undefined && (
                      <button className="button button--primary button--compact cp-pick" onClick={() => onPick(info)} type="button">
                        {p.pickThis}
                      </button>
                    )}
                  </>
                )
              })()}
            </aside>
          )}
        </div>

        <div className="cp-foot">
          <span>↑↓ {p.hintNav}{onPick !== undefined && ` · enter ${p.hintPick}`} · esc {p.hintClose}</span>
          <span>{shown.length} / {cases.length}</span>
        </div>

      </div>
    </div>
  )
}
