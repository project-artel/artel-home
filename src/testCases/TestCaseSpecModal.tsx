import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { CategoryChip } from './CategoryChip'
import { listTestCases } from './testCaseApi'
import { VERIFICATION_STATUSES, type TestCase, type VerificationStatus } from './testCaseTypes'

type Filter = 'ALL' | VerificationStatus

/** How many category chips show before the rest collapse behind a "＋N" search. */
const MAX_CATEGORY_CHIPS = 7

/**
 * Read-only ⌘K browser of every TestCase in the project (ARTEL-289 #4). Reuses the
 * pre-Step-model command palette design (씬별 대분류 chips + verification-status
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
  const [category, setCategory] = useState<string>('')
  const [pinned, setPinned] = useState<string[]>([])
  const [catSearchOpen, setCatSearchOpen] = useState(false)
  const [catQuery, setCatQuery] = useState('')
  const [catAtEnd, setCatAtEnd] = useState(false)
  const [listEdge, setListEdge] = useState({ top: true, bottom: false })
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const controller = new AbortController()
    listTestCases(projectId, {}, controller.signal)
      .then(setCases)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadFailed(true)
      })
    return () => controller.abort()
  }, [projectId])

  // Distinct categories (scenes), most-frequent first — the scalable filter source.
  const catCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const testCase of cases) {
      const key = testCase.category.trim()
      if (key.length > 0) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [cases])
  const categories = useMemo(
    () => [...catCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    [catCounts],
  )

  // The chip row: pinned (recently searched) first, then frequency order, capped.
  const chipCats = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const name of pinned) {
      if (categories.includes(name) && !seen.has(name)) { seen.add(name); out.push(name) }
    }
    for (const name of categories) {
      if (out.length >= MAX_CATEGORY_CHIPS) break
      if (!seen.has(name)) { seen.add(name); out.push(name) }
    }
    return out.slice(0, MAX_CATEGORY_CHIPS)
  }, [pinned, categories])

  function pickCategory(name: string) {
    setPinned((prev) => [name, ...prev.filter((n) => n !== name)])
    setCategory(name)
    setCatSearchOpen(false)
    setCatQuery('')
  }

  const catSearchResults = useMemo(() => {
    const cq = catQuery.trim().toLowerCase()
    const matched = categories.filter((name) => cq === '' || name.toLowerCase().includes(cq))
    return [...matched].sort((a, b) => Number(chipCats.includes(a)) - Number(chipCats.includes(b)))
  }, [categories, catQuery, chipCats])

  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      cases.filter(
        (testCase) =>
          (status === 'ALL' || testCase.verificationStatus === status) &&
          (category === '' || testCase.category === category) &&
          (q === '' ||
            testCase.title.toLowerCase().includes(q) ||
            testCase.category.toLowerCase().includes(q) ||
            (testCase.precondition ?? '').toLowerCase().includes(q) ||
            testCase.expected.toLowerCase().includes(q)),
      ),
    [cases, status, category, q],
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

        {categories.length > 0 && (
          <div className="cp-filter-row">
            <span className="cp-filter-label">{p.categoryLabel}</span>
            <div className="cp-chips">
              <button className={category === '' ? 'fchip on' : 'fchip'} onClick={() => setCategory('')} type="button">{p.categoryAll}</button>
              {chipCats.map((name) => (
                <button className={category === name ? 'fchip on' : 'fchip'} key={name} onClick={() => setCategory(category === name ? '' : name)} type="button">{name}</button>
              ))}
              {categories.length > chipCats.length && (
                <button className="fchip cp-more" onClick={() => setCatSearchOpen(true)} type="button">
                  ＋{categories.length - chipCats.length}
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
                      <span className="cp-title">{testCase.title.length > 0 ? testCase.title : `TC ${index + 1}`}</span>
                      <span className="cp-sub">{statusLabel[testCase.verificationStatus]}</span>
                    </span>
                    <CategoryChip category={testCase.category} />
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
                      <span className="cp-info-title">{info.title.length > 0 ? info.title : `TC ${active + 1}`}</span>
                    </div>
                    <div className="cp-info-tags">
                      <CategoryChip category={info.category} />
                      <span className={`vpill ${info.verificationStatus}`}><span className={`vdot ${info.verificationStatus}`} />{statusLabel[info.verificationStatus]}</span>
                    </div>
                    <dl className="cp-info-fields">
                      <dt>{p.infoPre}</dt>
                      <dd>{info.precondition !== null && info.precondition.length > 0 ? info.precondition : <span className="cp-info-none">—</span>}</dd>
                      <dt>{p.infoExp}</dt>
                      <dd>{info.expected.length > 0 ? info.expected : <span className="cp-info-none">—</span>}</dd>
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

        {catSearchOpen && (
          <div className="cp-catpop-overlay" onClick={() => { setCatSearchOpen(false); setCatQuery('') }}>
            <div className="cp-catpop" onClick={(event) => event.stopPropagation()}>
              <div className="cp-catpop-head">
                <span className="cp-catpop-icon" aria-hidden="true">⌕</span>
                <input
                  autoFocus
                  className="cp-catpop-input"
                  onChange={(event) => setCatQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') { setCatSearchOpen(false); setCatQuery('') }
                    if (event.key === 'Enter' && catSearchResults[0] !== undefined) pickCategory(catSearchResults[0])
                  }}
                  placeholder={p.categorySearch}
                  value={catQuery}
                />
                <button className="cp-esc" onClick={() => { setCatSearchOpen(false); setCatQuery('') }} type="button">ESC</button>
              </div>
              <div
                className={'cp-catpop-scroll' + (catAtEnd ? ' at-end' : '')}
                onScroll={(event) => {
                  const el = event.currentTarget
                  setCatAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
                }}
              >
                <div className="cp-catpop-list">
                  {catSearchResults.length === 0 ? (
                    <p className="cp-catpop-empty">{p.noMatch}</p>
                  ) : (
                    catSearchResults.map((name) => (
                      <button className={'cp-catpop-row' + (chipCats.includes(name) ? ' shown' : '')} key={name} onClick={() => pickCategory(name)} type="button">
                        <CategoryChip category={name} />
                        <span className="cp-catpop-count">{catCounts.get(name) ?? 0}</span>
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
