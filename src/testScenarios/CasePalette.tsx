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
  inScenario,
  onAdd,
  onRemove,
  onClose,
}: {
  projectId: string
  reloadKey: number
  inScenario: Set<string>
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
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

        <div className="cp-filters">
          {(['ALL', ...VERIFICATION_STATUSES] as Filter[]).map((f) => (
            <button className={status === f ? 'fchip on' : 'fchip'} key={f} onClick={() => setStatus(f)} type="button">
              {f === 'ALL' ? p.statusAll : statusLabel[f]}
            </button>
          ))}
          <select className="cp-cat" onChange={(event) => setCategory(event.target.value)} value={category}>
            <option value="">{p.categoryAll}</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div className="cp-list" ref={listRef}>
          {shown.length === 0 ? (
            <p className="cp-empty">{cases.length === 0 ? p.empty : p.noMatch}</p>
          ) : (
            shown.map((testCase, index) => {
              const inside = inScenario.has(testCase.id)
              return (
                <button
                  className={'cp-row' + (index === active ? ' active' : '')}
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
                  {inside && <span className="cp-check" aria-hidden="true">✓</span>}
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
