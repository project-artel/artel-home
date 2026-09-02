import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import { qaRunPath } from '../qa/qaTypes'
import type { Selection } from './KnowledgeGraphCanvas'
import {
  anchoredSceneNames,
  matchesSceneFilter,
  sceneFilterValue,
  SCENE_FILTER_ALL,
  SCENE_FILTER_GAME_WIDE,
} from './knowledgeAnchors'
import {
  itemTitle,
  relationLabel,
  relationLabelForDirection,
  sourceLabel,
  tagClass,
  tagLabel,
  truncate,
} from './knowledgeLabels'
import { incidentEdges, type GraphLayout } from './knowledgeLayout'
import { documentNodeIds, relationStyle, type KnowledgeNode } from './knowledgeTypes'
import { useKnowledgeItemBody, type KnowledgeItemBodyEntry } from './useKnowledgeItemBody'

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
  const [sceneFilter, setSceneFilter] = useState(SCENE_FILTER_ALL)
  const selectedNode = selection?.kind === 'node' ? nodesById.get(selection.id) ?? null : null
  const selectedEdge =
    selection?.kind === 'edge'
      ? layout.edges.find((placed) => placed.id === selection.id) ?? null
      : null

  // 선택된 node 가 바뀔 때마다 그 항목의 본문을 단건 조회한다(ARTEL-754). hook 은 selection 이
  // node 가 아닐 때 `null` 을 받아 아무 것도 하지 않는다.
  const { entry: bodyEntry, retry: retryBody } = useKnowledgeItemBody(
    projectId,
    selection?.kind === 'node' ? selection.id : null,
  )

  const sceneNames = useMemo(
    () => anchoredSceneNames(layout.nodes.map((placed) => placed.node)),
    [layout.nodes],
  )
  // A reload can retire the scene that was selected. Falling back keeps the
  // `<select>` showing what the list is actually doing instead of a blank box
  // over an unnarrowed list.
  const knownFilters = [
    SCENE_FILTER_ALL,
    SCENE_FILTER_GAME_WIDE,
    ...sceneNames.map(sceneFilterValue),
  ]
  const activeFilter = knownFilters.includes(sceneFilter) ? sceneFilter : SCENE_FILTER_ALL
  const visibleNodes = layout.nodes.filter((placed) =>
    matchesSceneFilter(placed.node, activeFilter),
  )

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
            bodyEntry={bodyEntry}
            layout={layout}
            node={selectedNode}
            nodesById={nodesById}
            onRetryBody={retryBody}
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
          {activeFilter === SCENE_FILTER_ALL
            ? t.knowledge.list.heading(visibleNodes.length)
            : t.knowledge.list.headingFiltered(visibleNodes.length)}
        </h2>

        {/* No anchor anywhere means nothing to narrow by, and a select offering
            only "everything" would be a control that never does anything. */}
        {sceneNames.length > 0 && (
          <label className="kg-list-filter">
            <span>{t.knowledge.list.sceneFilterLabel}</span>
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

        {visibleNodes.length === 0 && (
          <p className="kg-inspector-hint">
            {activeFilter === SCENE_FILTER_GAME_WIDE
              ? t.knowledge.list.emptyGameWide
              : t.knowledge.list.emptyFiltered}
          </p>
        )}

        <ul className="kg-item-list">
          {visibleNodes.map((placed) => {
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
  bodyEntry,
  onRetryBody,
  onSelectEdge,
  projectId,
}: {
  node: KnowledgeNode
  layout: GraphLayout
  nodesById: Map<string, KnowledgeNode>
  bodyEntry: KnowledgeItemBodyEntry | null
  onRetryBody: () => void
  onSelectEdge: (edgeId: string) => void
  projectId: string
}) {
  const { t } = useI18n()
  const incidence = incidentEdges(layout, node.id, nodesById)
  // 문서 node 는 필드 값이 아니라 구조로 가려진다 — `documentNodeIds` 의 doc comment 참고.
  // `KnowledgeGraphCanvas.tsx` 가 같은 식으로 같은 것을 계산한다.
  const documentIds = useMemo(
    () => documentNodeIds(layout.edges.map((placed) => placed.edge)),
    [layout.edges],
  )
  const isDocumentNode = documentIds.has(node.id)

  return (
    <div className="kg-detail">
      <p className="kg-detail-kind">
        {isDocumentNode ? t.knowledge.legend.documentNodeName : t.knowledge.inspector.itemHeading}
      </p>
      <p className="kg-detail-summary">
        {node.summary.trim().length > 0 ? (
          node.summary
        ) : (
          <span className="detail-empty">{t.knowledge.inspector.noSummary}</span>
        )}
      </p>

      <h3 className="kg-detail-subtitle">{t.knowledge.inspector.bodyLabel}</h3>
      <KnowledgeItemBody entry={bodyEntry} onRetry={onRetryBody} />

      <dl className="kg-detail-fields">
        <dt>{t.knowledge.inspector.tagLabel}</dt>
        <dd>
          <span className={`kg-tag kg-tag--${tagClass(node.tag)}`}>{tagLabel(t, node.tag)}</span>
        </dd>

        <dt>{t.knowledge.inspector.sourceLabel}</dt>
        <dd>{sourceLabel(t, node.source)}</dd>

        <dt>{t.knowledge.inspector.anchorsLabel}</dt>
        <dd>
          <AnchorList anchors={node.anchors} />
        </dd>

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
          ) : node.createdByQaRunId === null ? (
            // The try exists but its run id has not arrived yet (ARTEL-722 not
            // shipped, or a try that predates it) — a muted row, not a dead link.
            <span className="detail-empty">
              {t.knowledge.inspector.noRunYet}
              <span className="mono"> #{node.createdByQaTryId}</span>
            </span>
          ) : (
            <Link
              className="kg-detail-link"
              to={qaRunPath(projectId, node.createdByQaRunId, node.createdByQaTryId)}
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
                <span className="kg-relation-name">
                  {relationLabelForDirection(t, placed.edge.relation, direction)}
                </span>
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

/**
 * The selected item's body — loading, failed, empty, or the text itself.
 *
 * Line breaks are load-bearing, not cosmetic: an item extracted from a
 * document carries several `genre: …` style lines joined by `\n`, and
 * collapsing them onto one line is exactly what this component exists to
 * avoid (ARTEL-754). `.kg-detail-body` keeps `white-space: pre-wrap` for that
 * reason; nothing here transforms `description` itself.
 */
function KnowledgeItemBody({
  entry,
  onRetry,
}: {
  entry: KnowledgeItemBodyEntry | null
  onRetry: () => void
}) {
  const { t } = useI18n()

  if (entry === null || entry.status === 'loading') {
    return (
      <p aria-busy="true" className="kg-inspector-hint">
        {t.knowledge.inspector.bodyLoading}
      </p>
    )
  }

  if (entry.status === 'error') {
    return (
      <div className="kg-detail-body-error" role="alert">
        <p className="kg-inspector-hint">{t.knowledge.inspector.bodyFailed}</p>
        <button className="button button--secondary button--compact" onClick={onRetry} type="button">
          {t.knowledge.states.retry}
        </button>
      </div>
    )
  }

  const description = entry.description
  if (description.trim().length === 0) {
    return <p className="kg-inspector-hint">{t.knowledge.inspector.bodyEmpty}</p>
  }

  return <p className="kg-detail-body">{description}</p>
}

/**
 * Where the selected item holds.
 *
 * 앵커가 없는 항목은 게임 전체에서 참인 사실이고, 그것이 보통이다. 그래서 빈칸도 "없음"도
 * 쓰지 않는다 — 둘 다 "불러오지 못했다"와 구분되지 않고, 그 구분이 이 기능의 전부다.
 *
 * 색으로 가르지 않는다(`DESIGN.md`). 묶인 앵커는 채운 마름모, 게임 전체는 빈 마름모이며
 * 두 경우 모두 문장이 같은 말을 반복한다. 마름모는 `aria-hidden` 이다 — 읽어 주는 쪽에는
 * 문장만 남는다.
 */
function AnchorList({ anchors }: { anchors: KnowledgeNode['anchors'] }) {
  const { t } = useI18n()

  if (anchors.length === 0) {
    return (
      <p className="kg-anchor kg-anchor--game-wide">
        <span aria-hidden="true" className="kg-anchor-mark">
          ◇
        </span>
        <span className="kg-anchor-where">{t.knowledge.inspector.gameWide}</span>
      </p>
    )
  }

  return (
    <ul className="kg-anchor-list">
      {anchors.map((anchor) => (
        <li className="kg-anchor kg-anchor--scoped" key={`${anchor.sceneName} ${anchor.screenId ?? ''}`}>
          <span aria-hidden="true" className="kg-anchor-mark">
            ◆
          </span>
          {/* 씬과 화면을 한 덩이로 묶는다. 풀어 두면 화면 문구가 줄바꿈될 때 마름모
              아래로 떨어져, 어느 씬의 화면인지 읽히지 않는다. */}
          <span className="kg-anchor-where">
            <span className="kg-anchor-scene mono">{anchor.sceneName}</span>{' '}
            <span className="kg-anchor-screen">
              {anchor.screenId === null
                ? t.knowledge.inspector.anchorScreenUnset
                : t.knowledge.inspector.anchorScreen(anchor.screenId)}
            </span>
          </span>
        </li>
      ))}
    </ul>
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
