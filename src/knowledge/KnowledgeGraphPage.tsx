import { useMemo, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { KnowledgeGraphCanvas, type Selection } from './KnowledgeGraphCanvas'
import { KnowledgeInspector } from './KnowledgeInspector'
import { KnowledgeLegend } from './KnowledgeLegend'
import { LABEL_NODE_LIMIT } from './knowledgeLayout'
import type { KnowledgeGraph } from './knowledgeTypes'
import { useKnowledgeDrag } from './useKnowledgeDrag'
import { useKnowledgeGraph } from './useKnowledgeGraph'

/**
 * The project's knowledge base, drawn.
 *
 * Until this screen existed the only way to see what the QA agent had learned —
 * and what it had decided contradicts what — was to read the database. It
 * answers two questions: what is in there, and why is this related to that. The
 * second one lives entirely in an edge's `note`, so selecting a relation puts
 * that sentence in front of the reader.
 *
 * A rail section rather than a page of its own: the graph is one of the
 * questions asked about a project, and the rail is where those now live. Its
 * read stays here — the workspace loads what every section needs, and a graph
 * is needed by this one alone.
 */
export function KnowledgeSection() {
  const { t } = useI18n()
  const { projectId } = useWorkspace()
  const { graph, status, reload } = useKnowledgeGraph(projectId)

  return (
    <div className="kg-section">
      <p className="section-intro">{t.knowledge.page.subtitle}</p>

      <div className="kg-section-actions">
        <button
          className="button button--secondary"
          disabled={status === 'loading'}
          onClick={reload}
          type="button"
        >
          {t.knowledge.page.refresh}
        </button>
      </div>

      {status === 'loading' && (
        <section className="panel">
          <p aria-busy="true" className="panel-empty">
            {t.knowledge.states.loading}
          </p>
        </section>
      )}

      {status === 'error' && (
        <section className="panel">
          <div className="panel-message" role="alert">
            <p className="panel-message-copy">{t.knowledge.states.loadFailed}</p>
            <button className="button button--secondary" onClick={reload} type="button">
              {t.knowledge.states.retry}
            </button>
          </div>
        </section>
      )}

      {status === 'ready' && graph !== null && <KnowledgeGraphView graph={graph} projectId={projectId} />}
    </div>
  )
}

function KnowledgeGraphView({ graph, projectId }: { graph: KnowledgeGraph; projectId: string }) {
  const { t } = useI18n()
  const [selection, setSelection] = useState<Selection>(null)

  // The layout is the expensive part and depends on nothing but the response, so
  // selecting a node must not recompute it.
  // The drawing can be pushed around, so the layout comes from the drag hook
  // rather than straight from the pure pass: at rest it is exactly the
  // deterministic one, and while a node is held it is that layout re-drawn from
  // the live positions.
  const { layout, drag } = useKnowledgeDrag(graph)
  const nodesById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  )

  const truncatedBanner = graph.truncated ? (
    // Not an error and not a toast: the fact that this is a partial picture has
    // to stay on screen for as long as the picture does.
    <div className="kg-banner" role="status">
      <p className="kg-banner-title">{t.knowledge.truncated.title}</p>
      <p className="kg-banner-copy">{t.knowledge.truncated.copy(graph.nodeLimit)}</p>
    </div>
  ) : null

  // Nothing has been learned yet. Different from "learned, but nothing linked":
  // this one is answered by running QA or uploading a document, and the graph
  // area would be an empty box with nothing to say.
  if (graph.nodes.length === 0) {
    return (
      <section className="panel">
        {truncatedBanner}
        <div className="panel-message">
          <h2>{t.knowledge.empty.noItemsTitle}</h2>
          <p className="panel-message-copy">{t.knowledge.empty.noItemsCopy}</p>
        </div>
      </section>
    )
  }

  return (
    <>
      {truncatedBanner}

      <p className="kg-summary">
        <span>{t.knowledge.summary.items(graph.nodes.length)}</span>
        <span aria-hidden="true">·</span>
        <span>{t.knowledge.summary.relations(graph.edges.length)}</span>
        {layout.clusterCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{t.knowledge.summary.clusters(layout.clusterCount)}</span>
          </>
        )}
        {layout.isolatedCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{t.knowledge.summary.isolated(layout.isolatedCount)}</span>
          </>
        )}
      </p>

      <div className="kg-workspace">
        <section aria-label={t.knowledge.legend.graphLabel} className="panel kg-canvas-panel">
          {/* Items exist but nothing links them. Said here rather than by
              leaving the reader to conclude it from a field of loose dots. */}
          {graph.edges.length === 0 && (
            <div className="kg-notice" role="status">
              <p className="kg-notice-title">{t.knowledge.empty.noEdgesTitle}</p>
              <p className="kg-notice-copy">{t.knowledge.empty.noEdgesCopy(graph.nodes.length)}</p>
            </div>
          )}

          <div className="kg-canvas-frame">
            <KnowledgeGraphCanvas
              drag={drag}
              layout={layout}
              onSelectEdge={(id) => setSelection({ kind: 'edge', id })}
              onSelectNode={(id) => setSelection({ kind: 'node', id })}
              selection={selection}
            />
          </div>

          {graph.nodes.length > LABEL_NODE_LIMIT && (
            <p className="kg-canvas-note">{t.knowledge.legend.labelNote}</p>
          )}

          <KnowledgeLegend edges={graph.edges} nodes={graph.nodes} />
        </section>

        <aside className="panel kg-inspector-panel">
          <KnowledgeInspector
            layout={layout}
            nodesById={nodesById}
            onClear={() => setSelection(null)}
            onSelectEdge={(id) => setSelection({ kind: 'edge', id })}
            onSelectNode={(id) => setSelection({ kind: 'node', id })}
            projectId={projectId}
            selection={selection}
          />
        </aside>
      </div>
    </>
  )
}
