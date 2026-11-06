import { useMemo, useState } from 'react'
import { SceneChip } from './SceneChip'
import type { TestCase } from './testCaseTypes'

/**
 * The scene filter: a chip row, and a search popup for the scenes that did not fit.
 *
 * A `<select>` would be shorter to write, but scenes are the coarse axis people actually
 * filter on and a dropdown hides how many cases sit behind each name. Chips show the
 * common scenes at a glance; the `＋N` popup carries the tail with counts, so a project
 * with thirty scenes stays usable without the chip row growing without end.
 *
 * Shared by the ⌘K palette and the dashboard library — same filter, same gesture, one
 * implementation. Labels come in as props because the two screens read from different
 * i18n namespaces, and moving them would be a change to translation structure that this
 * has no reason to make.
 */

/** How many scene chips show before the rest collapse behind a "＋N" search. */
const MAX_SCENE_CHIPS = 7

export type SceneFilterLabels = {
  scene: string
  all: string
  search: string
  noMatch: string
}

export function CaseSceneFilter({
  cases,
  labels,
  onChange,
  value,
}: {
  cases: TestCase[]
  labels: SceneFilterLabels
  onChange: (scene: string) => void
  value: string
}) {
  // Distinct scenes, most-frequent first — the scalable filter source.
  const counts = useMemo(() => {
    const tally = new Map<string, number>()
    for (const testCase of cases) {
      const key = testCase.scene.trim()
      if (key.length > 0) tally.set(key, (tally.get(key) ?? 0) + 1)
    }
    return tally
  }, [cases])

  const scenes = useMemo(
    () => [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    [counts],
  )

  return (
    <SceneChipPicker
      allLabel={labels.all}
      chipsClassName="cp-chips"
      counts={counts}
      label={labels.scene}
      labelClassName="cp-filter-label"
      noMatch={labels.noMatch}
      onChange={onChange}
      ranked={scenes}
      rowClassName="cp-filter-row"
      searchPlaceholder={labels.search}
      value={value}
    />
  )
}

/**
 * 씬 칩 줄과 "＋N" 검색 팝업(ARTEL-1313 에서 화면 필터에서 떼어 냄). 많이 쓰는 순 [ranked] 의 앞 일곱 개만 칩으로 보이고,
 * 나머지는 팝업에서 찾는다. 팝업에서 고른 씬은 칩 줄 앞에 붙는다. 화면 필터와 케이스 편집 창의 화면 · 도착 화면 칸이 같이 쓴다 —
 * 씬이 수십 개인 프로젝트에서 칩을 다 깔면 칸이 수십 줄로 늘어난다.
 *
 * @property allLabel 주면 맨 앞에 "전체" 칩을 둔다(필터). 편집 칸은 주지 않는다.
 * @property counts 팝업에서 이름 옆에 보이는 수.
 */
export function SceneChipPicker({
  allLabel,
  chipsClassName,
  counts,
  disabled = false,
  label,
  labelClassName,
  noMatch,
  onChange,
  ranked,
  rowClassName,
  searchPlaceholder,
  value,
}: {
  allLabel?: string
  chipsClassName?: string
  counts: ReadonlyMap<string, number>
  disabled?: boolean
  label: string
  labelClassName: string
  noMatch: string
  onChange: (scene: string) => void
  ranked: readonly string[]
  rowClassName: string
  searchPlaceholder: string
  value: string
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pinned, setPinned] = useState<string[]>([])
  const [atEnd, setAtEnd] = useState(false)
  const scenes = ranked
  // The chip row: pinned (recently searched) first, then frequency order, capped.
  const chipScenes = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    // 지금 고른 씬은 늘 칩 줄에 있다 — 앞 일곱 개 밖이면 무엇이 골라졌는지 안 보인다.
    if (value !== '' && scenes.includes(value)) { seen.add(value); out.push(value) }
    for (const name of pinned) {
      if (scenes.includes(name) && !seen.has(name)) { seen.add(name); out.push(name) }
    }
    for (const name of scenes) {
      if (out.length >= MAX_SCENE_CHIPS) break
      if (!seen.has(name)) { seen.add(name); out.push(name) }
    }
    return out.slice(0, MAX_SCENE_CHIPS)
  }, [pinned, scenes, value])

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = scenes.filter((name) => needle === '' || name.toLowerCase().includes(needle))
    // Scenes already on the chip row sink to the bottom — the popup exists for the others.
    return [...matched].sort((a, b) => Number(chipScenes.includes(a)) - Number(chipScenes.includes(b)))
  }, [scenes, query, chipScenes])

  function close() {
    setSearchOpen(false)
    setQuery('')
  }

  // Picking from the popup pins the scene, so the next visit finds it on the chip row.
  function pick(name: string) {
    setPinned((previous) => [name, ...previous.filter((one) => one !== name)])
    onChange(name)
    close()
  }

  if (scenes.length === 0) return null

  return (
    <>
      <div className={rowClassName}>
        <span className={labelClassName}>{label}</span>
        <div className={chipsClassName}>
          {allLabel !== undefined && (
            <button className={value === '' ? 'fchip on' : 'fchip'} disabled={disabled} onClick={() => onChange('')} type="button">
              {allLabel}
            </button>
          )}
          {chipScenes.map((name) => (
            <button
              className={value === name ? 'fchip on' : 'fchip'}
              disabled={disabled}
              key={name}
              onClick={() => onChange(value === name ? '' : name)}
              type="button"
            >
              {name}
            </button>
          ))}
          {scenes.length > chipScenes.length && (
            <button className="fchip cp-more" disabled={disabled} onClick={() => setSearchOpen(true)} type="button">
              ＋{scenes.length - chipScenes.length}
            </button>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="cp-catpop-overlay" onClick={close}>
          <div className="cp-catpop" onClick={(event) => event.stopPropagation()}>
            <div className="cp-catpop-head">
              <span className="cp-catpop-icon" aria-hidden="true">⌕</span>
              <input
                autoFocus
                className="cp-catpop-input"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') close()
                  if (event.key === 'Enter' && searchResults[0] !== undefined) pick(searchResults[0])
                }}
                placeholder={searchPlaceholder}
                value={query}
              />
              <button className="cp-esc" onClick={close} type="button">ESC</button>
            </div>
            <div
              className={'cp-catpop-scroll' + (atEnd ? ' at-end' : '')}
              onScroll={(event) => {
                const element = event.currentTarget
                setAtEnd(element.scrollTop + element.clientHeight >= element.scrollHeight - 2)
              }}
            >
              <div className="cp-catpop-list">
                {searchResults.length === 0 ? (
                  <p className="cp-catpop-empty">{noMatch}</p>
                ) : (
                  searchResults.map((name) => (
                    <button
                      className={'cp-catpop-row' + (chipScenes.includes(name) ? ' shown' : '')}
                      key={name}
                      onClick={() => pick(name)}
                      type="button"
                    >
                      <SceneChip scene={name} />
                      <span className="cp-catpop-count">{counts.get(name) ?? 0}</span>
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
    </>
  )
}
