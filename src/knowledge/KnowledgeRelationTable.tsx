import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import type { Selection } from './KnowledgeGraphCanvas'
import { itemTitle, relationLabel, truncate } from './knowledgeLabels'
import type { PlacedEdge } from './knowledgeLayout'
import type { KnowledgeNode } from './knowledgeTypes'

/** Width budget for an item title in a table cell. The full title is in the inspector. */
const ITEM_TITLE_WIDTH = 32

/**
 * 관계 목록.
 *
 * 그림의 대체 표현이다(DESIGN.md: 시각 주석에는 접근 가능한 목록 대안을 둔다). SVG의 곡선을
 * 마우스로 집지 못하는 사람도 여기서 같은 간선을 고르고, 같은 `note`를 읽는다.
 *
 * 관계 종류를 색이 아니라 글자로 적는 자리이기도 하다 — 그래프에서 선 모양을 구분하지 못해도
 * 이 표에는 `CONTRADICTS`가 그대로 쓰여 있다.
 *
 * Moved from admin-page's `RelationList`. Only the admin graph screen shows it;
 * the project route reaches the same relations one item at a time through the
 * inspector.
 */
export function KnowledgeRelationTable({
  edges,
  nodesById,
  selection,
  onSelectEdge,
}: {
  edges: readonly PlacedEdge[]
  nodesById: ReadonlyMap<string, KnowledgeNode>
  selection: Selection
  onSelectEdge: (edgeId: string) => void
}) {
  const { t } = useI18n()
  const strings = t.adminGraph.relations

  const titleOf = (id: string) => {
    const node = nodesById.get(id)
    return truncate(node === undefined ? strings.unknownItem(id) : itemTitle(t, node), ITEM_TITLE_WIDTH)
  }

  return (
    <section aria-labelledby="kg-relations-title" className="kg-relations">
      <div className="section__head">
        <h2 className="section__title" id="kg-relations-title">
          {strings.title}
          <InfoHint>{strings.note}</InfoHint>
        </h2>
      </div>

      <div className="table-scroll table-scroll--tall">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{strings.columns.relation}</th>
              <th scope="col">{strings.columns.from}</th>
              <th scope="col">{strings.columns.to}</th>
              <th scope="col">{strings.columns.note}</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((placed) => {
              const { edge } = placed
              const selected = selection?.kind === 'edge' && selection.id === placed.id
              return (
                <tr className={selected ? 'is-selected' : undefined} key={placed.id}>
                  <td>
                    <button
                      aria-pressed={selected}
                      className="link-button"
                      onClick={() => onSelectEdge(placed.id)}
                      type="button"
                    >
                      <span className="mono">{edge.relation}</span> {relationLabel(t, edge.relation)}
                    </button>
                  </td>
                  <td>{titleOf(edge.from)}</td>
                  <td>{edge.from === edge.to ? strings.itself : titleOf(edge.to)}</td>
                  {/* 메모는 표에서 유일하게 줄바꿈을 허용하는 칸이다. 잘라 버리면 근거가 사라진다. */}
                  <td className="relation__note">
                    {edge.note === null || edge.note === '' ? (
                      <span className="muted">{strings.noNote}</span>
                    ) : (
                      edge.note
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
