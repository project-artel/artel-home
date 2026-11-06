import { useMemo } from 'react'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import { degreesOf } from './knowledgeGrouping'
import { itemTitle, nodeShape, sourceLabel, tagClass, tagLabel, truncate } from './knowledgeLabels'
import type { KnowledgeEdge, KnowledgeNode } from './knowledgeTypes'

/** 개요의 짧은 목록 길이. 더 보려면 왼쪽 탐색기가 있다. */
const TOP_COUNT = 5

/**
 * 아무것도 고르지 않았을 때 오른쪽 칸(ARTEL-1190). 빈칸 대신 이 그래프가 무엇으로 이뤄졌는지 보인다: 종류 · 출처 분포,
 * 연결이 많은 항목, 최근에 생긴 항목. 목록의 이름은 누르면 그 항목을 고른다.
 */
export function KnowledgeOverview({
  nodes,
  edges,
  onSelectNode,
}: {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  onSelectNode: (nodeId: string) => void
}) {
  const { t } = useI18n()
  const copy = t.knowledge.overview

  const { tags, sources, connected, newest } = useMemo(() => {
    const count = (key: (node: KnowledgeNode) => string) => {
      const counts = new Map<string, number>()
      for (const node of nodes) counts.set(key(node), (counts.get(key(node)) ?? 0) + 1)
      return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    }
    const degree = degreesOf(nodes, edges)
    return {
      tags: count((node) => node.tag),
      sources: count((node) => node.source),
      connected: nodes
        .filter((node) => (degree.get(node.id) ?? 0) > 0)
        .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
        .slice(0, TOP_COUNT)
        .map((node) => ({ node, value: String(degree.get(node.id) ?? 0) })),
      newest: [...nodes]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, TOP_COUNT)
        .map((node) => ({ node, value: formatDate(node.createdAt) })),
    }
  }, [nodes, edges])

  const largest = Math.max(1, ...tags.map(([, n]) => n), ...sources.map(([, n]) => n))

  return (
    <div className="kg-overview">
      <header className="kg-side-head">
        <h2 className="kg-side-title">{copy.title}</h2>
      </header>
      <p className="kg-inspector-hint">{copy.hint}</p>

      <section className="kg-side-section">
        <h3>{copy.byTag}</h3>
        <ul className="kg-bars">
          {tags.map(([tag, n]) => (
            <li key={tag}>
              <span className="kg-bars-name">
                <span aria-hidden="true" className={`kg-chip-dot kg-tag-color--${tagClass(tag)}`} />
                {tagLabel(t, tag)}
              </span>
              <span aria-hidden="true" className="kg-bars-track">
                <span className={`kg-bars-fill kg-tag-color--${tagClass(tag)}`} style={{ width: `${(n / largest) * 100}%` }} />
              </span>
              <span className="kg-bars-value mono">{n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="kg-side-section">
        <h3>{copy.bySource}</h3>
        <ul className="kg-bars">
          {sources.map(([source, n]) => (
            <li key={source}>
              <span className="kg-bars-name">
                <span aria-hidden="true" className={`kg-row-mark kg-row-mark--${nodeShape(source)} kg-tag-color--MISC`} />
                {sourceLabel(t, source)}
              </span>
              <span aria-hidden="true" className="kg-bars-track">
                <span className="kg-bars-fill kg-tag-color--MISC" style={{ width: `${(n / largest) * 100}%` }} />
              </span>
              <span className="kg-bars-value mono">{n}</span>
            </li>
          ))}
        </ul>
      </section>

      {connected.length > 0 && <TopList onSelect={onSelectNode} rows={connected} title={copy.mostConnected} />}
      <TopList onSelect={onSelectNode} rows={newest} title={copy.newest} />
    </div>
  )
}

function TopList({
  title,
  rows,
  onSelect,
}: {
  title: string
  rows: { node: KnowledgeNode; value: string }[]
  onSelect: (nodeId: string) => void
}) {
  const { t } = useI18n()
  return (
    <section className="kg-side-section">
      <h3>{title}</h3>
      <ol className="kg-top">
        {rows.map(({ node, value }) => (
          <li key={node.id}>
            <button className="kg-top-name" onClick={() => onSelect(node.id)} title={itemTitle(t, node)} type="button">
              {truncate(itemTitle(t, node), 40)}
            </button>
            <span className="kg-top-value mono">{value}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
