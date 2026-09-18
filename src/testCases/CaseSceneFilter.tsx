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
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pinned, setPinned] = useState<string[]>([])
  const [atEnd, setAtEnd] = useState(false)

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
      <div className="cp-filter-row">
        <span className="cp-filter-label">{labels.scene}</span>
        <div className="cp-chips">
          <button className={value === '' ? 'fchip on' : 'fchip'} onClick={() => onChange('')} type="button">
            {labels.all}
          </button>
          {chipScenes.map((name) => (
            <button
              className={value === name ? 'fchip on' : 'fchip'}
              key={name}
              onClick={() => onChange(value === name ? '' : name)}
              type="button"
            >
              {name}
            </button>
          ))}
          {scenes.length > chipScenes.length && (
            <button className="fchip cp-more" onClick={() => setSearchOpen(true)} type="button">
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
                placeholder={labels.search}
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
                  <p className="cp-catpop-empty">{labels.noMatch}</p>
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
