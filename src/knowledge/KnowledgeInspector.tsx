import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import { qaRunPath } from '../qa/qaTypes'
import type { Selection } from './KnowledgeGraphCanvas'
import { KnowledgeOverview } from './KnowledgeOverview'
import {
  itemTitle,
  nodeShape,
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
 * What the selected thing is. With nothing selected, an overview of the graph instead of an empty panel (ARTEL-1190).
 *
 * The full list moved to `KnowledgeExplorer` on the left. That list is still not a convenience: the SVG is
 * `aria-hidden` and pointer-only, so the list is where keyboard and screen-reader users select an item, and the
 * relation table here is where they follow a relation to the item at its other end.
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

  // 선택된 node 가 바뀔 때마다 그 항목의 본문을 단건 조회한다(ARTEL-754). hook 은 selection 이
  // node 가 아닐 때 `null` 을 받아 아무 것도 하지 않는다.
  const { entry: bodyEntry, retry: retryBody } = useKnowledgeItemBody(
    projectId,
    selection?.kind === 'node' ? selection.id : null,
  )

  // 아무것도 고르지 않았으면 빈칸 대신 이 그래프의 개요를 보인다(ARTEL-1190). 전체 목록과 씬 거르기는 왼쪽 탐색기로 옮겼다.
  if (selectedNode === null && selectedEdge === null) {
    return (
      <KnowledgeOverview
        edges={layout.edges.map((placed) => placed.edge)}
        nodes={layout.nodes.map((placed) => placed.node)}
        onSelectNode={onSelectNode}
      />
    )
  }

  return (
    <section aria-labelledby="kg-inspector-title" className="kg-inspector">
      <header className="kg-side-head">
        {selectedNode !== null && (
          <span
            aria-hidden="true"
            className={`kg-row-mark kg-row-mark--${nodeShape(selectedNode.source)} kg-tag-color--${tagClass(selectedNode.tag)}`}
          />
        )}
        <h2 className="kg-side-title" id="kg-inspector-title">
          {selectedNode !== null ? itemTitle(t, selectedNode) : t.knowledge.inspector.edgeHeading}
        </h2>
        <button
          aria-label={t.knowledge.inspector.clear}
          className="button button--secondary button--compact kg-side-close"
          onClick={onClear}
          title={t.knowledge.inspector.clear}
          type="button"
        >
          ×
        </button>
      </header>

      {selectedNode !== null ? (
        <NodeDetail
          bodyEntry={bodyEntry}
          layout={layout}
          node={selectedNode}
          nodesById={nodesById}
          onRetryBody={retryBody}
          onSelectEdge={onSelectEdge}
          onSelectNode={onSelectNode}
          projectId={projectId}
        />
      ) : selectedEdge !== null ? (
        <EdgeDetail edge={selectedEdge.edge} nodesById={nodesById} onSelectNode={onSelectNode} />
      ) : null}
    </section>
  )
}

function NodeDetail({
  node,
  layout,
  nodesById,
  bodyEntry,
  onRetryBody,
  onSelectEdge,
  onSelectNode,
  projectId,
}: {
  node: KnowledgeNode
  layout: GraphLayout
  nodesById: Map<string, KnowledgeNode>
  bodyEntry: KnowledgeItemBodyEntry | null
  onRetryBody: () => void
  onSelectEdge: (edgeId: string) => void
  onSelectNode: (nodeId: string) => void
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
      {/* 한눈에 보는 사실을 2칸 표로(ARTEL-1190). 칸과 문구는 예전 목록 그대로다. */}
      <dl className="kg-facts">
        <div>
          <dt>{t.knowledge.inspector.tagLabel}</dt>
          <dd>
            <span className={`kg-tag kg-tag--${tagClass(node.tag)}`}>{tagLabel(t, node.tag)}</span>
            {isDocumentNode && <span className="kg-facts-note">{t.knowledge.legend.documentNodeName}</span>}
          </dd>
        </div>
        <div>
          <dt>{t.knowledge.inspector.sourceLabel}</dt>
          <dd>{sourceLabel(t, node.source)}</dd>
        </div>
        <div>
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
        </div>
        <div>
          <dt>{t.knowledge.inspector.createdAtLabel}</dt>
          <dd>{formatDateTime(node.createdAt)}</dd>
        </div>
        <div className="kg-facts-wide">
          <dt>{t.knowledge.inspector.versionLabel}</dt>
          <dd className="mono">
            {node.version === null ? t.knowledge.inspector.unknownVersion : `v${node.version}`} · #{node.id}
          </dd>
        </div>
        <div className="kg-facts-wide">
          <dt>{t.knowledge.inspector.anchorsLabel}</dt>
          <dd>
            <AnchorList anchors={node.anchors} />
          </dd>
        </div>
      </dl>

      <section className="kg-side-section">
        <h3>{t.knowledge.detail.summary}</h3>
        <p className="kg-detail-summary">
          {node.summary.trim().length > 0 ? (
            node.summary
          ) : (
            <span className="detail-empty">{t.knowledge.inspector.noSummary}</span>
          )}
        </p>
      </section>

      <section className="kg-side-section">
        <h3>{t.knowledge.inspector.bodyLabel}</h3>
        <KnowledgeItemBody entry={bodyEntry} onRetry={onRetryBody} />
      </section>

      <section className="kg-side-section">
        <h3>{t.knowledge.inspector.relationsHeading(incidence.length)}</h3>
        {incidence.length === 0 ? (
          <p className="kg-inspector-hint">{t.knowledge.inspector.noRelations}</p>
        ) : (
          // 관계를 칸으로 나눈 표(ARTEL-1190): 방향 · 관계 · 상대. 줄의 관계 칸을 누르면 그 관계를, 상대를 누르면 그 항목을
          // 고른다. 메모는 그 줄 아래 한 줄로 둔다.
          <table className="kg-relations">
            <thead>
              <tr>
                <th scope="col">{t.knowledge.detail.direction}</th>
                <th scope="col">{t.knowledge.detail.relation}</th>
                <th scope="col">{t.knowledge.detail.other}</th>
              </tr>
            </thead>
            {incidence.map(({ placed, direction, other }) => (
              <tbody className={`kg-relation-row kg-relation-row--${relationStyle(placed.edge.relation)}`} key={placed.id}>
                <tr>
                  <td className="kg-relation-dir">
                    {direction === 'self'
                      ? t.knowledge.inspector.directionSelf
                      : direction === 'out'
                        ? t.knowledge.inspector.directionOut
                        : t.knowledge.inspector.directionIn}
                  </td>
                  <td>
                    <button className="kg-relation-name" onClick={() => onSelectEdge(placed.id)} type="button">
                      {relationLabelForDirection(t, placed.edge.relation, direction)}
                    </button>
                  </td>
                  <td>
                    {direction === 'self' ? (
                      <span className="detail-empty">{t.knowledge.inspector.directionSelf}</span>
                    ) : (
                      <button className="kg-endpoint" onClick={() => onSelectNode(other.id)} type="button">
                        {truncate(itemTitle(t, other), 40)}
                      </button>
                    )}
                  </td>
                </tr>
                {placed.edge.note !== null && placed.edge.note.trim().length > 0 && (
                  <tr className="kg-relation-note">
                    <td colSpan={3}>{placed.edge.note}</td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        )}
      </section>
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

  // `genre: …` 꼴 줄은 이름표와 내용으로 나눠 보인다(ARTEL-1190). 그 꼴이 아닌 줄은 손대지 않고, 줄바꿈은 그대로 산다.
  const lines = description.split('\n')
  if (!lines.some((line) => BODY_FIELD.test(line))) return <p className="kg-detail-body">{description}</p>
  return (
    <div className="kg-detail-body kg-detail-body--fields">
      {lines.map((line, index) => {
        const field = BODY_FIELD.exec(line)
        if (field === null) return line.trim().length === 0 ? null : <p key={index}>{line}</p>
        return (
          <div className="kg-body-field" key={index}>
            <p className="kg-body-key mono">{field[1]}</p>
            <p>{field[2]}</p>
          </div>
        )
      })}
    </div>
  )
}

/** 본문의 `이름: 내용` 줄. 이름은 영문 · 숫자 · 밑줄로 된 짧은 낱말일 때만이다 — 문장 속 쌍점을 잘못 자르지 않는다. */
const BODY_FIELD = /^([A-Za-z][A-Za-z0-9_]{0,30}):\s*(.*)$/

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
