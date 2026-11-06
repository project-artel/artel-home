import { useId, useMemo, useState } from 'react'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import type { Selection } from './KnowledgeGraphCanvas'
import {
  anchoredSceneNames,
  sceneFilterValue,
  SCENE_FILTER_ALL,
  SCENE_FILTER_GAME_WIDE,
} from './knowledgeAnchors'
import { exploreKnowledge, type ExplorerGroup, type GroupMode, type SortMode } from './knowledgeGrouping'
import { itemTitle, nodeShape, tagClass, tagLabel, truncate } from './knowledgeLabels'
import type { KnowledgeEdge, KnowledgeNode } from './knowledgeTypes'

const GROUP_MODES: GroupMode[] = ['document', 'tag', 'scene']
const SORT_MODES: SortMode[] = ['degree', 'recent', 'name']

/**
 * 왼쪽 항목 탐색기(ARTEL-1190). 예전 인스펙터 아래 목록이 하던 일(전체 목록 · 씬 거르기 · 고르기)을 그대로 하고, 항목이
 * 늘어도 훑을 수 있게 묶음 · 찾기 · 종류 거르기 · 정렬을 더했다.
 *
 * 그림은 `aria-hidden` 이라 키보드 · 화면 낭독기로 항목을 고르는 길은 여기다. 줄마다 진짜 버튼이다.
 */
export function KnowledgeExplorer({
  nodes,
  edges,
  selection,
  onSelectNode,
}: {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  selection: Selection
  onSelectNode: (nodeId: string) => void
}) {
  const { t } = useI18n()
  const copy = t.knowledge.explorer
  const searchId = useId()
  const [mode, setMode] = useState<GroupMode>('document')
  const [sort, setSort] = useState<SortMode>('degree')
  const [text, setText] = useState('')
  const [tags, setTags] = useState<ReadonlySet<string>>(new Set())
  const [sceneFilter, setSceneFilter] = useState(SCENE_FILTER_ALL)
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [listNode, setListNode] = useState<HTMLUListElement | null>(null)

  const sceneNames = useMemo(() => anchoredSceneNames(nodes), [nodes])
  // 다시 읽으면서 고른 씬이 사라질 수 있다. 그때는 전체로 돌아가 select 가 빈칸이 되지 않게 한다.
  const knownFilters = [SCENE_FILTER_ALL, SCENE_FILTER_GAME_WIDE, ...sceneNames.map(sceneFilterValue)]
  const activeFilter = knownFilters.includes(sceneFilter) ? sceneFilter : SCENE_FILTER_ALL

  const result = useMemo(
    () => exploreKnowledge(nodes, edges, { mode, sort, tags, text, sceneFilter: activeFilter }, (node) => itemTitle(t, node)),
    [nodes, edges, mode, sort, tags, text, activeFilter, t],
  )
  const tagEntries = [...result.tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const selectedId = selection?.kind === 'node' ? selection.id : null

  function toggleTag(tag: string) {
    setTags((current) => {
      const next = new Set(current)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  function toggleGroup(key: string) {
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function groupName(group: ExplorerGroup): string {
    if (group.kind === 'tag') return tagLabel(t, group.name)
    if (group.kind === 'observed') return copy.observed
    if (group.kind === 'unfiled') return copy.unfiled
    if (group.kind === 'gameWide') return copy.gameWide
    return group.name
  }

  return (
    <section aria-labelledby="kg-explorer-title" className="kg-explorer">
      <h2 className="visually-hidden" id="kg-explorer-title">
        {copy.title}
      </h2>
      <label className="visually-hidden" htmlFor={searchId}>
        {copy.search}
      </label>
      <input
        className="field-input kg-explorer-search"
        id={searchId}
        onChange={(event) => setText(event.target.value)}
        placeholder={copy.searchPlaceholder}
        type="search"
        value={text}
      />

      <div aria-label={copy.groupBy} className="kg-segment" role="group">
        {GROUP_MODES.map((one) => (
          <button
            aria-pressed={mode === one}
            className={`kg-segment-option${mode === one ? ' is-on' : ''}`}
            key={one}
            onClick={() => setMode(one)}
            type="button"
          >
            {copy.groupModes[one]}
          </button>
        ))}
      </div>

      <div aria-label={copy.tagFilter} className="kg-chips" role="group">
        {tagEntries.map(([tag, count]) => (
          <button
            aria-pressed={tags.has(tag)}
            className={`kg-chip${tags.has(tag) ? ' is-on' : ''}`}
            key={tag}
            onClick={() => toggleTag(tag)}
            type="button"
          >
            <span aria-hidden="true" className={`kg-chip-dot kg-tag-color--${tagClass(tag)}`} />
            {tagLabel(t, tag)}
            <span className="mono">{count}</span>
          </button>
        ))}
        {tags.size > 0 && (
          <button className="kg-chip kg-chip--clear" onClick={() => setTags(new Set())} type="button">
            {copy.clearTags}
          </button>
        )}
      </div>

      <div className="kg-explorer-bar">
        <span className="kg-explorer-count">{copy.shown(result.shown, result.total)}</span>
        {/* 씬 거르기는 예전 목록의 기능 그대로다. 걸린 씬이 하나도 없으면 고를 것이 없어 보이지 않는다. */}
        {sceneNames.length > 0 && (
          <label className="kg-explorer-select">
            <span className="visually-hidden">{t.knowledge.list.sceneFilterLabel}</span>
            <select onChange={(event) => setSceneFilter(event.target.value)} value={activeFilter}>
              <option value={SCENE_FILTER_ALL}>{t.knowledge.list.sceneFilterAll}</option>
              <option value={SCENE_FILTER_GAME_WIDE}>{t.knowledge.list.sceneFilterGameWide}</option>
              {sceneNames.map((sceneName) => (
                <option key={sceneName} value={sceneFilterValue(sceneName)}>
                  {sceneName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="kg-explorer-select">
          <span className="visually-hidden">{copy.sort}</span>
          <select onChange={(event) => setSort(event.target.value as SortMode)} value={sort}>
            {SORT_MODES.map((one) => (
              <option key={one} value={one}>
                {copy.sortModes[one]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="kg-explorer-scroll">
        {result.groups.length === 0 ? (
          <p className="kg-inspector-hint">
            {activeFilter === SCENE_FILTER_GAME_WIDE && text.length === 0 && tags.size === 0
              ? t.knowledge.list.emptyGameWide
              : activeFilter !== SCENE_FILTER_ALL && text.length === 0 && tags.size === 0
                ? t.knowledge.list.emptyFiltered
                : copy.noMatch}
          </p>
        ) : (
          <ul className="kg-groups" ref={setListNode}>
            {result.groups.map((group) => {
              const name = groupName(group)
              const open = !folded.has(group.key)
              return (
                <li className="kg-group" key={group.key}>
                  <button
                    aria-expanded={open}
                    aria-label={open ? copy.collapse(name) : copy.expand(name)}
                    className="kg-group-head"
                    onClick={() => toggleGroup(group.key)}
                    type="button"
                  >
                    <span aria-hidden="true" className={`kg-group-chevron${open ? ' is-open' : ''}`}>
                      ▸
                    </span>
                    <span className="kg-group-name" title={name}>
                      {name}
                    </span>
                    {group.kind === 'document' && <span className="kg-group-sub">{copy.documentKind}</span>}
                    <span className="kg-group-count mono">{group.items.length}</span>
                  </button>
                  {open && (
                    <ul className="kg-group-rows">
                      {group.items.map(({ node, degree }) => {
                        const selected = node.id === selectedId
                        return (
                          <li key={node.id}>
                            <button
                              aria-current={selected ? 'true' : undefined}
                              className={`kg-row${selected ? ' is-selected' : ''}`}
                              onClick={() => onSelectNode(node.id)}
                              type="button"
                            >
                              <span
                                aria-hidden="true"
                                className={`kg-row-mark kg-row-mark--${nodeShape(node.source)} kg-tag-color--${tagClass(node.tag)}`}
                              />
                              <span className="kg-row-title" title={itemTitle(t, node)}>
                                {truncate(itemTitle(t, node), 64)}
                              </span>
                              <span aria-label={copy.relationCount(degree)} className="kg-row-degree mono">
                                {degree}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <EdgeScrollbar label={copy.title} scroller={listNode} side="right" />
      </div>
    </section>
  )
}
