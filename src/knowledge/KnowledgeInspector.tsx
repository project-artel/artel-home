import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import type { Selection } from './KnowledgeGraphCanvas'
import { itemTitle, relationLabel, sourceLabel, tagClass, tagLabel, truncate } from './knowledgeLabels'
import { incidentEdges, type GraphLayout } from './knowledgeLayout'
import { relationStyle, type KnowledgeNode } from './knowledgeTypes'

/**
 * What the selected thing is, and the list that makes the drawing readable.
 *
 * The list is not a convenience: the SVG is `aria-hidden` and pointer-only, so
 * this is where keyboard and screen-reader users select an item, and where they
 * follow a relation to the item at its other end.
 */
export function KnowledgeInspector({
  layout,
  nodesById,
  projectId,
  selection,
  onSelectNode,
  onSelectEdge,
  onClear,
}: {
  layout: GraphLayout
  nodesById: Map<string, KnowledgeNode>
  projectId: string
  selection: Selection
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edgeId: string) => void
  onClear: () => void
}) {
  const { t } = useI18n()
  const selectedNode = selection?.kind === 'node' ? nodesById.get(selection.id) ?? null : null
  const selectedEdge =
    selection?.kind === 'edge'
      ? layout.edges.find((placed) => placed.id === selection.id) ?? null
      : null

  return (
    <div className="kg-inspector">
      <section aria-labelledby="kg-inspector-title" className="kg-inspector-selection">
        <header className="kg-inspector-header">
          <h2 id="kg-inspector-title">{t.knowledge.inspector.title}</h2>
          {selection !== null && (
            <button className="button button--secondary button--compact" onClick={onClear} type="button">
              {t.knowledge.inspector.clear}
            </button>
          )}
        </header>

        {selectedNode !== null ? (
          <NodeDetail
            layout={layout}
            node={selectedNode}
            nodesById={nodesById}
            onSelectEdge={onSelectEdge}
            projectId={projectId}
          />
        ) : selectedEdge !== null ? (
          <EdgeDetail
            edge={selectedEdge.edge}
            nodesById={nodesById}
            onSelectNode={onSelectNode}
          />
        ) : (
          <p className="kg-inspector-hint">{t.knowledge.inspector.hint}</p>
        )}
      </section>

      <section aria-labelledby="kg-items-title" className="kg-item-list-section">
        <h2 className="kg-inspector-subtitle" id="kg-items-title">
          {t.knowledge.list.heading(layout.nodes.length)}
        </h2>
        <ul className="kg-item-list">
          {layout.nodes.map((placed) => {
            const selected = selection?.kind === 'node' && selection.id === placed.node.id
            return (
              <li key={placed.node.id}>
                <button
                  aria-current={selected ? 'true' : undefined}
                  className={`kg-item${selected ? ' is-selected' : ''}`}
                  onClick={() => onSelectNode(placed.node.id)}
                  type="button"
                >
                  <span className="kg-item-title">{truncate(itemTitle(t, placed.node), 64)}</span>
                  <span className="kg-item-meta">
                    <span className={`kg-tag kg-tag--${tagClass(placed.node.tag)}`}>
                      {tagLabel(t, placed.node.tag)}
                    </span>
                    <span>{sourceLabel(t, placed.node.source)}</span>
                    <span className="mono">#{placed.node.id}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function NodeDetail({
  node,
  layout,
  nodesById,
  onSelectEdge,
  projectId,
}: {
  node: KnowledgeNode
  layout: GraphLayout
  nodesById: Map<string, KnowledgeNode>
  onSelectEdge: (edgeId: string) => void
  projectId: string
}) {
  const { t } = useI18n()
  const incidence = incidentEdges(layout, node.id, nodesById)

  return (
    <div className="kg-detail">
      <p className="kg-detail-kind">{t.knowledge.inspector.itemHeading}</p>
      <p className="kg-detail-summary">
        {node.summary.trim().length > 0 ? (
          node.summary
        ) : (
          <span className="detail-empty">{t.knowledge.inspector.noSummary}</span>
        )}
      </p>

      <dl className="kg-detail-fields">
        <dt>{t.knowledge.inspector.tagLabel}</dt>
        <dd>
          <span className={`kg-tag kg-tag--${tagClass(node.tag)}`}>{tagLabel(t, node.tag)}</span>
        </dd>

        <dt>{t.knowledge.inspector.sourceLabel}</dt>
        <dd>{sourceLabel(t, node.source)}</dd>

        <dt>{t.knowledge.inspector.versionLabel}</dt>
        <dd className="mono">
          {node.version === null ? t.knowledge.inspector.unknownVersion : `v${node.version}`}
        </dd>

        <dt>{t.knowledge.inspector.createdByLabel}</dt>
        <dd>
          {/* Absent is a fact, not a gap: this item came out of a document, and
              there is no run to open. */}
          {node.createdByQaTryId === null ? (
            <span className="detail-empty">{t.knowledge.inspector.createdByDocument}</span>
          ) : (
            <Link
              className="kg-detail-link"
              to={`/projects/${encodeURIComponent(projectId)}/qa-tries/${encodeURIComponent(node.createdByQaTryId)}`}
            >
              {t.knowledge.inspector.openQaTry}
              <span className="mono"> #{node.createdByQaTryId}</span>
            </Link>
          )}
        </dd>

        <dt>{t.knowledge.inspector.createdAtLabel}</dt>
        <dd>{formatDateTime(node.createdAt)}</dd>
      </dl>

      <h3 className="kg-detail-subtitle">{t.knowledge.inspector.relationsHeading(incidence.length)}</h3>
      {incidence.length === 0 ? (
        <p className="kg-inspector-hint">{t.knowledge.inspector.noRelations}</p>
      ) : (
        <ul className="kg-relation-list">
          {incidence.map(({ placed, direction, other }) => (
            <li key={placed.id}>
              <button
                className={`kg-relation kg-relation--${relationStyle(placed.edge.relation)}`}
                onClick={() => onSelectEdge(placed.id)}
                type="button"
              >
                <span className="kg-relation-name">{relationLabel(t, placed.edge.relation)}</span>
                <span className="kg-relation-target">
                  {direction === 'self'
                    ? t.knowledge.inspector.directionSelf
                    : `${direction === 'out' ? t.knowledge.inspector.directionOut : t.knowledge.inspector.directionIn} ${truncate(itemTitle(t, other), 48)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EdgeDetail({
  edge,
  nodesById,
  onSelectNode,
}: {
  edge: { from: string; to: string; relation: string; note: string | null }
  nodesById: Map<string, KnowledgeNode>
  onSelectNode: (nodeId: string) => void
}) {
  const { t } = useI18n()
  const from = nodesById.get(edge.from) ?? null
  const to = nodesById.get(edge.to) ?? null
  const style = relationStyle(edge.relation)

  return (
    <div className="kg-detail">
      <p className="kg-detail-kind">{t.knowledge.inspector.edgeHeading}</p>
      <p className={`kg-detail-relation kg-relation--${style}`}>{relationLabel(t, edge.relation)}</p>
      {/* The server's own spelling, kept visible whenever it is not what the
          translated label says — otherwise an unrecognised relation looks like a
          client bug instead of a value this build has not caught up with. */}
      {style === 'UNKNOWN' && edge.relation.length > 0 && (
        <p className="kg-detail-raw">
          {t.knowledge.inspector.rawRelation} <code className="mono">{edge.relation}</code>
        </p>
      )}

      <dl className="kg-detail-fields">
        <dt>{t.knowledge.inspector.fromLabel}</dt>
        <dd>
          <EndpointButton node={from} nodeId={edge.from} onSelect={onSelectNode} />
        </dd>
        <dt>{t.knowledge.inspector.toLabel}</dt>
        <dd>
          <EndpointButton node={to} nodeId={edge.to} onSelect={onSelectNode} />
        </dd>
      </dl>

      <h3 className="kg-detail-subtitle">{t.knowledge.inspector.noteLabel}</h3>
      {/* The single most important sentence on this page: it is the only stated
          reason the relation exists at all. */}
      {edge.note !== null && edge.note.trim().length > 0 ? (
        <p className="kg-detail-note">{edge.note}</p>
      ) : (
        <p className="kg-inspector-hint">{t.knowledge.inspector.noNote}</p>
      )}
    </div>
  )
}

function EndpointButton({
  node,
  nodeId,
  onSelect,
}: {
  node: KnowledgeNode | null
  nodeId: string
  onSelect: (nodeId: string) => void
}) {
  const { t } = useI18n()
  if (node === null) return <span className="mono">#{nodeId}</span>
  return (
    <button className="kg-endpoint" onClick={() => onSelect(node.id)} type="button">
      {truncate(itemTitle(t, node), 48)}
    </button>
  )
}
