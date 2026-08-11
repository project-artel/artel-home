import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { NotFoundPage } from '../NotFoundPage'
import { isDecimalId } from '../qa/qaApi'
import { KnowledgeGraphCanvas, type Selection } from './KnowledgeGraphCanvas'
import { KnowledgeInspector } from './KnowledgeInspector'
import { KnowledgeLegend } from './KnowledgeLegend'
import { LABEL_NODE_LIMIT, layoutKnowledgeGraph } from './knowledgeLayout'
import type { KnowledgeGraph } from './knowledgeTypes'
import { useKnowledgeGraph } from './useKnowledgeGraph'

export function KnowledgeGraphRoute() {
  const { projectId } = useParams()
  if (!isDecimalId(projectId)) return <NotFoundPage />
  return <KnowledgeGraphPage key={projectId} projectId={projectId} />
}

/**
 * The project's knowledge base, drawn.
 *
 * Until this page existed the only way to see what the QA agent had learned —
 * and what it had decided contradicts what — was to read the database. The
 * screen answers two questions: what is in there, and why is this related to
 * that. The second one lives entirely in an edge's `note`, so selecting a
 * relation puts that sentence in front of the reader.
 */
function KnowledgeGraphPage({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const { graph, status, reload } = useKnowledgeGraph(projectId)

  return (
    <section className="page kg-page" aria-labelledby="knowledge-title">
      <header className="page-header">
        <div>
          <Link className="back-link" to={`/projects/${encodeURIComponent(projectId)}`}>
            {t.knowledge.page.backToProject}
          </Link>
          <h1 id="knowledge-title">{t.knowledge.page.title}</h1>
          <p className="page-subtitle">{t.knowledge.page.subtitle}</p>
        </div>
        <div className="page-header-actions">
          <button
            className="button button--secondary"
            disabled={status === 'loading'}
            onClick={reload}
            type="button"
          >
            {t.knowledge.page.refresh}
          </button>
        </div>
      </header>

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
    </section>
  )
}

function KnowledgeGraphView({ graph, projectId }: { graph: KnowledgeGraph; projectId: string }) {
  const { t } = useI18n()
  const [selection, setSelection] = useState<Selection>(null)

  // The layout is the expensive part and depends on nothing but the response, so
  // selecting a node must not recompute it.
  const layout = useMemo(() => layoutKnowledgeGraph(graph), [graph])
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
