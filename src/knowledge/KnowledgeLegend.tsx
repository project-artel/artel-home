import { useI18n } from '../i18n/useI18n'
import { nodeShape, relationLabel, relationShape, sourceLabel } from './knowledgeLabels'
import type { KnowledgeEdge, KnowledgeNode, RelationStyle } from './knowledgeTypes'
import { documentNodeIds, relationStyle } from './knowledgeTypes'

/**
 * What the marks mean.
 *
 * Only what is actually on screen is listed — a legend describing a relation
 * this project has never recorded teaches the reader to look for something that
 * is not there. Every row names the line pattern in words as well as drawing it,
 * so the legend still works when the colours are indistinguishable.
 */
export function KnowledgeLegend({
  edges,
  nodes,
}: {
  edges: KnowledgeEdge[]
  nodes: KnowledgeNode[]
}) {
  const { t } = useI18n()

  // One row per style, but the raw names are kept so an unrecognised relation
  // is listed as the server spelled it rather than as "unknown" three times.
  const byStyle = new Map<RelationStyle, Set<string>>()
  for (const edge of edges) {
    const style = relationStyle(edge.relation)
    const names = byStyle.get(style)
    if (names === undefined) byStyle.set(style, new Set([edge.relation]))
    else names.add(edge.relation)
  }

  const sources = [...new Set(nodes.map((node) => node.source))].sort()
  const hasDocumentNode = documentNodeIds(edges).size > 0

  return (
    <div className="kg-legend">
      {byStyle.size > 0 && (
        <section className="kg-legend-group">
          <h3>{t.knowledge.legend.relationTitle}</h3>
          <ul>
            {[...byStyle.entries()].map(([style, names]) => (
              <li key={style}>
                <svg aria-hidden="true" className="kg-legend-line" viewBox="0 0 44 12">
                  <path className={`kg-edge-line kg-edge--${style}`} d="M 2 6 L 42 6" />
                </svg>
                <span className="kg-legend-name">
                  {[...names]
                    .map((name) => relationLabel(t, name))
                    .sort()
                    .join(' · ')}
                </span>
                <span className="kg-legend-shape">{relationShape(t, style)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sources.length > 0 && (
        <section className="kg-legend-group">
          <h3>{t.knowledge.legend.sourceTitle}</h3>
          <ul>
            {sources.map((source) => {
              const shape = nodeShape(source)
              return (
                <li key={source}>
                  <svg aria-hidden="true" className="kg-legend-line" viewBox="0 0 44 12">
                    {shape === 'circle' && <circle className="kg-legend-mark" cx="22" cy="6" r="5" />}
                    {shape === 'square' && (
                      <rect className="kg-legend-mark" height="9" rx="1" width="9" x="17.5" y="1.5" />
                    )}
                    {shape === 'diamond' && (
                      <rect
                        className="kg-legend-mark"
                        height="8"
                        transform="rotate(45 22 6)"
                        width="8"
                        x="18"
                        y="2"
                      />
                    )}
                  </svg>
                  <span className="kg-legend-name">{sourceLabel(t, source)}</span>
                  <span className="kg-legend-shape">
                    {shape === 'circle'
                      ? t.knowledge.sourceShapes.QA
                      : shape === 'square'
                        ? t.knowledge.sourceShapes.DOCS
                        : t.knowledge.sourceShapes.OTHER}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {hasDocumentNode && (
        <section className="kg-legend-group">
          <h3>{t.knowledge.legend.nodeKindTitle}</h3>
          <ul>
            <li>
              <svg aria-hidden="true" className="kg-legend-line" viewBox="0 0 44 12">
                <rect className="kg-legend-mark-ring" height="11" rx="1" width="11" x="16.5" y="0.5" />
                <rect className="kg-legend-mark" height="7" rx="1" width="7" x="18.5" y="2.5" />
              </svg>
              <span className="kg-legend-name">{t.knowledge.legend.documentNodeName}</span>
              <span className="kg-legend-shape">{t.knowledge.legend.documentNodeShape}</span>
            </li>
          </ul>
        </section>
      )}
    </div>
  )
}
