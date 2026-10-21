import { useMemo, useRef, useState } from 'react'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { useActionBinding, useFieldBinding } from '../projectAgent/bindings'
import { resolveEntry } from '../projectAgent/specs/lookup'
import { listedOptions, readOnlyListWrite } from '../projectAgent/specs/listedOptions'
import { KNOWLEDGE_LISTED_FIELD, KNOWLEDGE_OPEN_NODE_ACTION } from '../projectAgent/specs/knowledge'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { KnowledgeGraphCanvas, type Selection } from './KnowledgeGraphCanvas'
import { useCanvasViewport } from '../contentMap/useCanvasViewport'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import './knowledge.css'
import { KnowledgeExplorer } from './KnowledgeExplorer'
import { KnowledgeInspector } from './KnowledgeInspector'
import { KnowledgeLegend } from './KnowledgeLegend'
import { KnowledgeRelationTable } from './KnowledgeRelationTable'
import { itemTitle } from './knowledgeLabels'
import { LABEL_NODE_LIMIT } from './knowledgeLayout'
import type { KnowledgeGraph } from './knowledgeTypes'
import { useKnowledgeDrag } from './useKnowledgeDrag'
import { useKnowledgeGraph, type KnowledgeGraphStatus } from './useKnowledgeGraph'

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
      <div className="kg-section-actions">
        <InfoHint>{t.knowledge.page.subtitle}</InfoHint>
      </div>

      <KnowledgeGraphContent graph={graph} projectId={projectId} reload={reload} status={status} />
    </div>
  )
}

/**
 * Parts of the screen only the admin graph screen (`/admin/graph`) turns on.
 * The project route passes none of them and draws exactly what it drew before.
 */
export type KnowledgeGraphDiagnostics = {
  /** Formats the counts these parts add, in the console's locale. */
  formatCount: (value: number) => string
}

/**
 * The loading, error and ready states of one graph read, below whatever toolbar
 * the caller draws. The caller owns the read (`useKnowledgeGraph`) so its own
 * toolbar and the retry here reload the same request.
 */
export function KnowledgeGraphContent({
  graph,
  status,
  reload,
  projectId,
  diagnostics,
}: {
  graph: KnowledgeGraph | null
  status: KnowledgeGraphStatus
  reload: () => void
  projectId: string
  diagnostics?: KnowledgeGraphDiagnostics
}) {
  const { t } = useI18n()

  return (
    <>
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

      {status === 'ready' && graph !== null && (
        <KnowledgeGraphView diagnostics={diagnostics} graph={graph} projectId={projectId} />
      )}
    </>
  )
}

function KnowledgeGraphView({
  graph,
  projectId,
  diagnostics,
}: {
  graph: KnowledgeGraph
  projectId: string
  diagnostics?: KnowledgeGraphDiagnostics
}) {
  const { t } = useI18n()
  const [selection, setSelection] = useState<Selection>(null)

  // The layout is the expensive part and depends on nothing but the response, so
  // selecting a node must not recompute it.
  // The drawing can be pushed around, so the layout comes from the drag hook
  // rather than straight from the pure pass: at rest it is exactly the
  // deterministic one, and while a node is held it is that layout re-drawn from
  // the live positions.
  const { layout, drag } = useKnowledgeDrag(graph)
  // 확대 · 이동(ARTEL-1190). 레이아웃은 힘이 자리 잡는 동안과 끄는 동안 매 프레임 viewBox 가 바뀌므로, 읽는 사람이
  // 움직여 둔 시점은 그 사이에도 지킨다(`keepView`). 전체 보기를 누르면 레이아웃의 틀로 돌아간다.
  const viewport = useCanvasViewport(layout.viewBox, { keepView: true })
  const [legendOpen, setLegendOpen] = useState(false)
  const [inspectorNode, setInspectorNode] = useState<HTMLDivElement | null>(null)
  const nodesById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  )

  // agent 가 항목을 고르는 길. 그래프의 node 와 오른쪽 목록의 줄이 부르는 것과 같은 `setSelection`
  // 을 부른다.
  const canvasFrame = useRef<HTMLDivElement>(null)
  useFieldBinding(KNOWLEDGE_LISTED_FIELD, {
    target: () => canvasFrame.current,
    read: () => graph.nodes.length,
    options: () => listedOptions(graph.nodes, (node) => ({ value: node.id, label: `${itemTitle(t, node)} [${node.tag}]` })),
    write: readOnlyListWrite(KNOWLEDGE_LISTED_FIELD.name, 'use knowledge.openNode.'),
  })
  useActionBinding(KNOWLEDGE_OPEN_NODE_ACTION, {
    target: () => canvasFrame.current,
    blocked: () => (graph.nodes.length === 0 ? t.knowledge.empty.noItemsTitle : null),
    run: async (args) => {
      const node = resolveEntry(
        'knowledge item',
        args.node,
        graph.nodes.map((one) => ({ entry: one, keys: [one.id], title: itemTitle(t, one) })),
      )
      setSelection({ kind: 'node', id: node.id })
      return { id: node.id, tag: node.tag, source: node.source, summary: node.summary }
    },
  })

  const truncatedBanner = graph.truncated ? (
    // Not an error and not a toast: the fact that this is a partial picture has
    // to stay on screen for as long as the picture does.
    <div className="kg-banner" role="status">
      <p className="kg-banner-title">{t.knowledge.truncated.title}</p>
      <p className="kg-banner-copy">{t.knowledge.truncated.copy(graph.nodeLimit)}</p>
    </div>
  ) : null

  // The parser removes an edge whose endpoint is not in the response before the
  // layout sees it. Only the admin screen says how many, as a diagnostic.
  const droppedEdgesNotice =
    diagnostics !== undefined && graph.droppedEdges > 0 ? (
      <div className="kg-notice kg-notice--spaced" role="status">
        <p className="kg-notice-copy">
          {t.adminGraph.droppedEdges(diagnostics.formatCount(graph.droppedEdges))}
        </p>
      </div>
    ) : null

  // Nothing has been learned yet. Different from "learned, but nothing linked":
  // this one is answered by running QA or uploading a document, and the graph
  // area would be an empty box with nothing to say.
  if (graph.nodes.length === 0) {
    return (
      <section className="panel">
        {truncatedBanner}
        {droppedEdgesNotice}
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
      {droppedEdgesNotice}

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

      {/* 고르면 오른쪽 상세 칸이 넓어진다(ARTEL-1190). 개요는 좁은 칸으로 충분하고, 상세는 읽을 글이 많다. */}
      <div className={`kg-workspace${selection === null ? '' : ' has-selection'}`}>
        <aside className="panel kg-explorer-panel">
          <KnowledgeExplorer
            edges={graph.edges}
            nodes={graph.nodes}
            onSelectNode={(id) => setSelection({ kind: 'node', id })}
            selection={selection}
          />
        </aside>

        <section aria-label={t.knowledge.legend.graphLabel} className="panel kg-canvas-panel">
          {/* Items exist but nothing links them. Said here rather than by
              leaving the reader to conclude it from a field of loose dots. */}
          {graph.edges.length === 0 && (
            <div className="kg-notice kg-canvas-overlay kg-canvas-overlay--top" role="status">
              <p className="kg-notice-title">{t.knowledge.empty.noEdgesTitle}</p>
              <p className="kg-notice-copy">{t.knowledge.empty.noEdgesCopy(graph.nodes.length)}</p>
            </div>
          )}

          <div className="kg-canvas-frame" ref={canvasFrame}>
            <KnowledgeGraphCanvas
              drag={drag}
              isolatedLabel={t.knowledge.canvas.isolated}
              layout={layout}
              onSelectEdge={(id) => setSelection({ kind: 'edge', id })}
              onSelectNode={(id) => setSelection({ kind: 'node', id })}
              selection={selection}
              viewport={viewport}
            />
          </div>

          <div className="kg-canvas-tools">
            <span className="kg-canvas-scale mono">{t.knowledge.canvas.scale(viewport.scale.toFixed(1))}</span>
            <button
              aria-label={t.knowledge.canvas.zoomOut}
              className="button button--secondary button--compact kg-tool-square"
              onClick={viewport.zoomOut}
              title={t.knowledge.canvas.zoomOut}
              type="button"
            >
              −
            </button>
            <button
              aria-label={t.knowledge.canvas.zoomIn}
              className="button button--secondary button--compact kg-tool-square"
              onClick={viewport.zoomIn}
              title={t.knowledge.canvas.zoomIn}
              type="button"
            >
              +
            </button>
            <button
              className="button button--secondary button--compact"
              disabled={!viewport.moved}
              onClick={viewport.reset}
              type="button"
            >
              {t.knowledge.canvas.fit}
            </button>
          </div>

          <div className="kg-canvas-foot">
            {graph.nodes.length > LABEL_NODE_LIMIT && (
              <p className="kg-canvas-note">{t.knowledge.legend.labelNote}</p>
            )}
            {/* 범례는 접어 둔다(ARTEL-1190). 늘 펼쳐 두면 그래프 높이를 먹는다. 상세를 보는 중에도 열 수 있다. */}
            <button
              aria-expanded={legendOpen}
              className="button button--secondary button--compact"
              onClick={() => setLegendOpen((open) => !open)}
              type="button"
            >
              {t.knowledge.overview.legend}
            </button>
          </div>
          {legendOpen && (
            <div className="kg-legend-popover">
              <KnowledgeLegend edges={graph.edges} formatCount={diagnostics?.formatCount} nodes={graph.nodes} />
            </div>
          )}
        </section>

        <aside className="panel kg-inspector-panel">
          <div className="kg-inspector-scroll" ref={setInspectorNode}>
            <KnowledgeInspector
              layout={layout}
              nodesById={nodesById}
              onClear={() => setSelection(null)}
              onSelectEdge={(id) => setSelection({ kind: 'edge', id })}
              onSelectNode={(id) => setSelection({ kind: 'node', id })}
              projectId={projectId}
              selection={selection}
            />
          </div>
          <EdgeScrollbar label={t.knowledge.inspector.title} scroller={inspectorNode} side="right" />
        </aside>
      </div>

      {diagnostics !== undefined && layout.edges.length > 0 && (
        <KnowledgeRelationTable
          edges={layout.edges}
          nodesById={nodesById}
          onSelectEdge={(id) => setSelection({ kind: 'edge', id })}
          selection={selection}
        />
      )}
    </>
  )
}
