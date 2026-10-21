import { useId, useMemo, useState } from 'react'
import { Dialog } from '../../../design-system/primitives/Dialog'
import { EdgeScrollbar } from '../../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../../i18n/useI18n'
import { SceneChip } from '../../../testCases/SceneChip'
import type { RemainingSplit } from './dashboardModel'
import { countScenes, defaultPicked, filterPickItems, PICK_GROUPS, type PickGroupFilter, type PickItem } from './freeRunCases'

/**
 * Free 실행에 넣을 TC 를 고르는 dialog(ARTEL-1164). 왼쪽은 이전 빌드 결과 · 화면으로 좁히고, 오른쪽에서 고른다.
 * 처음엔 먼저 볼 것(이전에 판정이 있던 TC)이 골라져 있다. 만들기를 누르면 [onCreate] 가 고른 순서가 아니라 목록 순서로 받는다.
 */
export function FreeRunPicker({
  build,
  comparedTo,
  items,
  remaining,
  onClose,
  onCreate,
}: {
  build: string
  /** 비교한 이전 빌드 이름. 없으면 이전 빌드 결과 묶음을 감춘다. */
  comparedTo: string | null
  items: readonly PickItem[]
  remaining: RemainingSplit
  onClose: () => void
  onCreate: (caseIds: string[]) => Promise<void>
}) {
  const { t } = useI18n()
  const m = t.dashboard.picker
  const titleId = useId()
  const searchId = useId()
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => defaultPicked(remaining))
  const [group, setGroup] = useState<PickGroupFilter>('all')
  const [scene, setScene] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [filtersNode, setFiltersNode] = useState<HTMLElement | null>(null)
  const [listNode, setListNode] = useState<HTMLUListElement | null>(null)

  const scenes = useMemo(() => countScenes(items, { group, query }, picked), [items, group, query, picked])
  // 고른 화면이 다른 묶음 · 찾기에서 사라졌으면 그 화면은 풀린 것으로 본다 — 0건 목록에 갇히지 않게.
  const activeScene = scene !== null && scenes.some((entry) => entry.scene === scene) ? scene : null
  const shown = useMemo(
    () => filterPickItems(items, { group, scene: activeScene, query }, picked),
    [items, group, activeScene, query, picked],
  )
  const shownAllPicked = shown.length > 0 && shown.every((item) => picked.has(item.testCase.id))

  const groups: { key: PickGroupFilter; label: string; count: number }[] = [
    { key: 'all', label: m.all, count: items.length },
    ...(comparedTo === null ? PICK_GROUPS.filter((key) => key === 'firstTime') : PICK_GROUPS).map((key) => ({
      key,
      label: m.groups[key],
      count: remaining[key].length,
    })),
    { key: 'picked', label: m.picked, count: picked.size },
  ]

  function toggle(caseId: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(caseId)) next.add(caseId)
      return next
    })
  }

  function toggleShown() {
    setPicked((current) => {
      const next = new Set(current)
      for (const item of shown) {
        if (shownAllPicked) next.delete(item.testCase.id)
        else next.add(item.testCase.id)
      }
      return next
    })
  }

  async function create() {
    setPending(true)
    setFailed(false)
    try {
      await onCreate(items.filter((item) => picked.has(item.testCase.id)).map((item) => item.testCase.id))
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={pending ? () => {} : onClose} title={m.title}>
      <div className="frp">
        <p className="dialog-copy">{m.copy(build)}</p>
        <div className="frp-body">
          <div className="frp-side">
            <nav aria-label={m.filters} className="frp-filters" ref={setFiltersNode}>
              <p className="frp-heading">{comparedTo === null ? m.groupsHeadingNoPrevious : m.groupsHeading(comparedTo)}</p>
              {groups.map((entry) => (
                <button
                  aria-pressed={group === entry.key}
                  className={`frp-filter${group === entry.key ? ' is-current' : ''}`}
                  key={entry.key}
                  onClick={() => setGroup(entry.key)}
                  type="button"
                >
                  {entry.key !== 'all' && entry.key !== 'picked' && (
                    <span aria-hidden="true" className={`db-swatch db-tone-${TONE[entry.key]}`} />
                  )}
                  <span className="frp-filter-label">{entry.label}</span>
                  <span className="frp-count">{entry.count}</span>
                </button>
              ))}
              <p className="frp-heading">{m.scenesHeading}</p>
              <button
                aria-pressed={activeScene === null}
                className={`frp-filter${activeScene === null ? ' is-current' : ''}`}
                onClick={() => setScene(null)}
                type="button"
              >
                <span className="frp-filter-label">{m.allScenes}</span>
                <span className="frp-count">{scenes.reduce((sum, entry) => sum + entry.count, 0)}</span>
              </button>
              {scenes.map((entry) => (
                <button
                  aria-pressed={activeScene === entry.scene}
                  className={`frp-filter${activeScene === entry.scene ? ' is-current' : ''}`}
                  key={entry.scene}
                  onClick={() => setScene(entry.scene)}
                  title={entry.scene || m.noScene}
                  type="button"
                >
                  <span className="frp-filter-label">{entry.scene || m.noScene}</span>
                  <span className="frp-count">{entry.count}</span>
                </button>
              ))}
            </nav>
            <EdgeScrollbar label={m.filters} scroller={filtersNode} side="right" />
          </div>

          <div className="frp-main">
            <div className="frp-search">
              <label className="visually-hidden" htmlFor={searchId}>
                {m.search}
              </label>
              <input
                className="field-input"
                id={searchId}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={m.searchPlaceholder}
                type="search"
                value={query}
              />
            </div>
            <div className="frp-bar">
              <label className="frp-all">
                <input checked={shownAllPicked} disabled={shown.length === 0} onChange={toggleShown} type="checkbox" />
                {shownAllPicked ? m.unpickShown(shown.length) : m.pickShown(shown.length)}
              </label>
              {picked.size > 0 && (
                <button className="button button--secondary button--compact frp-clear" onClick={() => setPicked(new Set())} type="button">
                  {m.clear}
                </button>
              )}
            </div>
            {shown.length === 0 ? (
              <p className="frp-empty">{group === 'picked' && picked.size === 0 ? m.nonePicked : m.noMatch}</p>
            ) : (
              <ul aria-label={m.title} className="frp-list cp-scope" ref={setListNode}>
                {shown.map((item) => (
                  <li key={item.testCase.id}>
                    <label className={`frp-row${picked.has(item.testCase.id) ? ' is-picked' : ''}`}>
                      <input checked={picked.has(item.testCase.id)} onChange={() => toggle(item.testCase.id)} type="checkbox" />
                      <span className="frp-text">
                        <span className="frp-step" title={item.testCase.step}>
                          {item.testCase.step || `#${item.testCase.id}`}
                        </span>
                        {item.testCase.expectedValue.length > 0 && (
                          <span className="frp-expected" title={item.testCase.expectedValue}>
                            {item.testCase.expectedValue}
                          </span>
                        )}
                      </span>
                      {comparedTo !== null && <span className={`frp-before frp-before--${TONE[item.group]}`}>{m.before[item.group]}</span>}
                      <SceneChip scene={item.testCase.scene} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <EdgeScrollbar label={m.title} scroller={shown.length === 0 ? null : listNode} side="right" />
          </div>
        </div>

        {failed && (
          <p className="inline-error" role="alert">
            {t.dashboard.remaining.failed}
          </p>
        )}
        <div className="dialog-actions frp-actions">
          <span className="frp-summary">{m.summary(picked.size, items.length)}</span>
          <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">
            {t.projects.shared.cancel}
          </button>
          <button className="button button--primary" disabled={pending || picked.size === 0} onClick={() => void create()} type="button">
            {pending ? t.dashboard.remaining.making : m.create(picked.size)}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

/** 대시보드 카드의 막대와 같은 색. */
const TONE = {
  wasFailing: 'warning',
  wasPassing: 'reasoning',
  firstTime: 'muted',
} as const
