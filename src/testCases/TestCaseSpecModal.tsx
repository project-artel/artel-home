import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { SceneChip } from './SceneChip'
import { listTestCases } from './testCaseApi'
import { VERIFICATION_STATUSES, type TestCase, type VerificationStatus } from './testCaseTypes'

type Filter = 'ALL' | VerificationStatus

/** How many scene chips show before the rest collapse behind a "＋N" search. */
const MAX_SCENE_CHIPS = 7

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
  const [pinned, setPinned] = useState<string[]>([])
  const [sceneSearchOpen, setSceneSearchOpen] = useState(false)
  const [sceneQuery, setSceneQuery] = useState('')
  const [sceneAtEnd, setSceneAtEnd] = useState(false)
  const [listEdge, setListEdge] = useState({ top: true, bottom: false })
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  // Distinct scenes, most-frequent first — the scalable filter source.
  const sceneCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const testCase of cases) {
      const key = testCase.scene.trim()
      if (key.length > 0) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [cases])
  const scenes = useMemo(
    () => [...sceneCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    [sceneCounts],
  )

  // The chip row: pinned (recently searched) first, then frequency order, capped.
  const chipScenes = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const name of pinned) {
      if (scenes.includes(name) && !seen.has(name)) { seen.add(name); out.push(name) }
    }
    for (const name of scenes) {
      if (out.length >= MAX_SCENE_CHIPS) break
      if (!seen.has(name)) { seen.add(name); out.push(name) }
    }
    return out.slice(0, MAX_SCENE_CHIPS)
  }, [pinned, scenes])

  function pickScene(name: string) {
    setPinned((prev) => [name, ...prev.filter((n) => n !== name)])
    setScene(name)
    setSceneSearchOpen(false)
    setSceneQuery('')
  }

  const sceneSearchResults = useMemo(() => {
    const sq = sceneQuery.trim().toLowerCase()
    const matched = scenes.filter((name) => sq === '' || name.toLowerCase().includes(sq))
    return [...matched].sort((a, b) => Number(chipScenes.includes(a)) - Number(chipScenes.includes(b)))
  }, [scenes, sceneQuery, chipScenes])

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

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, shown.length - 1)))
  }, [shown.length])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function updateListEdge(el: HTMLElement) {
    setListEdge({
      top: el.scrollTop <= 2,
      bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
    })
  }
  useEffect(() => {
    if (listRef.current !== null) updateListEdge(listRef.current)
  }, [shown.length])

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
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

        {scenes.length > 0 && (
          <div className="cp-filter-row">
            <span className="cp-filter-label">{p.sceneLabel}</span>
            <div className="cp-chips">
              <button className={scene === '' ? 'fchip on' : 'fchip'} onClick={() => setScene('')} type="button">{p.sceneAll}</button>
              {chipScenes.map((name) => (
                <button className={scene === name ? 'fchip on' : 'fchip'} key={name} onClick={() => setScene(scene === name ? '' : name)} type="button">{name}</button>
              ))}
              {scenes.length > chipScenes.length && (
                <button className="fchip cp-more" onClick={() => setSceneSearchOpen(true)} type="button">
                  ＋{scenes.length - chipScenes.length}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="cp-body">
          <div className={'cp-listwrap' + (listEdge.top ? ' at-top' : '') + (listEdge.bottom ? ' at-bottom' : '')}>
            <div className="cp-fade cp-fade--top" aria-hidden="true"><span className="cp-fade-hint">▴</span></div>
            <div className="cp-list" onScroll={(event) => updateListEdge(event.currentTarget)} ref={listRef}>
              {shown.length === 0 ? (
                <p className="cp-empty">{loadFailed ? p.noMatch : cases.length === 0 ? p.empty : p.noMatch}</p>
              ) : (
                shown.map((testCase, index) => (
                  <button
                    className={'cp-row' + (index === active ? ' active' : '')}
                    data-index={index}
                    key={testCase.id}
                    onClick={() => setActive(index)}
                    onMouseEnter={() => setActive(index)}
                    type="button"
                  >
                    <span className={`vdot ${testCase.verificationStatus}`} />
                    <span className="cp-main">
                      <span className="cp-title">{testCase.step.length > 0 ? testCase.step : `TC ${index + 1}`}</span>
                      <span className="cp-sub">{statusLabel[testCase.verificationStatus]}</span>
                    </span>
                    <SceneChip scene={testCase.scene} />
                  </button>
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

        {sceneSearchOpen && (
          <div className="cp-catpop-overlay" onClick={() => { setSceneSearchOpen(false); setSceneQuery('') }}>
            <div className="cp-catpop" onClick={(event) => event.stopPropagation()}>
              <div className="cp-catpop-head">
                <span className="cp-catpop-icon" aria-hidden="true">⌕</span>
                <input
                  autoFocus
                  className="cp-catpop-input"
                  onChange={(event) => setSceneQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') { setSceneSearchOpen(false); setSceneQuery('') }
                    if (event.key === 'Enter' && sceneSearchResults[0] !== undefined) pickScene(sceneSearchResults[0])
                  }}
                  placeholder={p.sceneSearch}
                  value={sceneQuery}
                />
                <button className="cp-esc" onClick={() => { setSceneSearchOpen(false); setSceneQuery('') }} type="button">ESC</button>
              </div>
              <div
                className={'cp-catpop-scroll' + (sceneAtEnd ? ' at-end' : '')}
                onScroll={(event) => {
                  const el = event.currentTarget
                  setSceneAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
                }}
              >
                <div className="cp-catpop-list">
                  {sceneSearchResults.length === 0 ? (
                    <p className="cp-catpop-empty">{p.noMatch}</p>
                  ) : (
                    sceneSearchResults.map((name) => (
                      <button className={'cp-catpop-row' + (chipScenes.includes(name) ? ' shown' : '')} key={name} onClick={() => pickScene(name)} type="button">
                        <SceneChip scene={name} />
                        <span className="cp-catpop-count">{sceneCounts.get(name) ?? 0}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="cp-catpop-fade" aria-hidden="true">
                  <span className="cp-catpop-fade-hint">▾</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
