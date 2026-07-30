import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { CategoryChip } from '../testCases/CategoryChip'
import { listTestCases } from '../testCases/testCaseApi'
import {
  VERIFICATION_STATUSES,
  type TestCase,
  type VerificationStatus,
} from '../testCases/testCaseTypes'

type Filter = 'ALL' | VerificationStatus

/** How many category chips show before the rest collapse behind a "＋N" toggle. */
const MAX_CATEGORY_CHIPS = 3

/**
 * A ⌘K command palette for the case library. Opened over the studio, it finds a
 * project's reusable cases by search + category + status and toggles them into
 * the scenario with the keyboard (↑↓ to move, Enter to add/remove, Esc to close).
 *
 * It replaces the always-open bottom library: with long scenarios the library
 * used to sit far below the fold, so it is summoned as an overlay instead —
 * independent of scroll position, and never pushing the flow down.
 *
 * Category is a free-text field that can grow without bound, so it is filtered
 * through a native `<select>` populated with the distinct values (most frequent
 * first) rather than a wall of chips.
 */
export function CasePalette({
  projectId,
  reloadKey,
  order,
  onAdd,
  onRemove,
  onClose,
}: {
  projectId: string
  reloadKey: number
  /** The scenario's current case ids, in order — drives the position badge. */
  order: string[]
  onAdd: (testCase: TestCase) => void
  onRemove: (caseId: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const p = t.scenarios.palette
  const statusLabel = t.scenarios.composition.status

  const [cases, setCases] = useState<TestCase[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Filter>('ALL')
  const [category, setCategory] = useState<string>('')
  // Categories pulled to the front of the chip row by picking them from the
  // "＋" search — most-recent first, so a searched-for category leads the row.
  const [pinned, setPinned] = useState<string[]>([])
  const [catSearchOpen, setCatSearchOpen] = useState(false)
  const [catQuery, setCatQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // caseId → 1-based position in the scenario (undefined when not added).
  const positionById = useMemo(() => {
    const map = new Map<string, number>()
    order.forEach((id, index) => map.set(id, index + 1))
    return map
  }, [order])
  const inScenario = useMemo(() => new Set(order), [order])

  useEffect(() => {
    inputRef.current?.focus()
    const controller = new AbortController()
    listTestCases(projectId, {}, controller.signal).then(setCases).catch(() => undefined)
    return () => controller.abort()
  }, [projectId, reloadKey])

  // Distinct categories, most-frequent first — the scalable filter source.
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const testCase of cases) {
      const key = testCase.category.trim()
      if (key.length > 0) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [cases])

  // The chip row: pinned (most-recently searched) first, then frequency order,
  // capped at MAX_CATEGORY_CHIPS. Picking from "＋" search pins to the front and
  // pushes the last-shown chip out, so the count stays fixed.
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
    return categories.filter((name) => !chipCats.includes(name) && (cq === '' || name.toLowerCase().includes(cq)))
  }, [categories, chipCats, catQuery])

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
            testCase.id.includes(q)),
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

  function toggle(testCase: TestCase) {
    if (inScenario.has(testCase.id)) onRemove(testCase.id)
    else onAdd(testCase)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return }
    if (event.key === 'Enter') {
      event.preventDefault()
      const testCase = shown[active]
      if (testCase !== undefined) toggle(testCase)
    }
  }

  const appliedCount = cases.filter((testCase) => inScenario.has(testCase.id)).length

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
                <div className="cp-catmore">
                  <button className="fchip cp-more" onClick={() => setCatSearchOpen((v) => !v)} type="button">
                    ＋{categories.length - chipCats.length}
                  </button>
                  {catSearchOpen && (
                    <div className="cp-catpop">
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
                      <div className="cp-catpop-list">
                        {catSearchResults.length === 0 ? (
                          <p className="cp-catpop-empty">{p.noMatch}</p>
                        ) : (
                          catSearchResults.map((name) => (
                            <button className="cp-catpop-row" key={name} onClick={() => pickCategory(name)} type="button">{name}</button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="cp-list" ref={listRef}>
          {shown.length === 0 ? (
            <p className="cp-empty">{cases.length === 0 ? p.empty : p.noMatch}</p>
          ) : (
            shown.map((testCase, index) => {
              const inside = inScenario.has(testCase.id)
              return (
                <button
                  className={'cp-row' + (index === active ? ' active' : '') + (inside ? ' in' : '')}
                  data-index={index}
                  key={testCase.id}
                  onClick={() => toggle(testCase)}
                  onMouseEnter={() => setActive(index)}
                  type="button"
                >
                  <span className={`vdot ${testCase.verificationStatus}`} />
                  <span className="cp-main">
                    <span className="cp-title">{testCase.title.length > 0 ? testCase.title : testCase.id}</span>
                    <span className="cp-sub"><span className="mono">{testCase.id}</span> · {statusLabel[testCase.verificationStatus]}</span>
                  </span>
                  <CategoryChip category={testCase.category} />
                  {inside && (
                    <span className="cp-pos" title={p.posTitle}>{positionById.get(testCase.id)}</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="cp-foot">
          <span>↑↓ {p.hintNav} · ↵ {p.hintToggle} · esc {p.hintClose}</span>
          <span>{shown.length} / {cases.length} · {p.applied(appliedCount)}</span>
        </div>
      </div>
    </div>
  )
}
