import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import type { Messages } from '../i18n/messages'
import { truncate } from '../knowledge/knowledgeLabels'
import { formatDateTime } from '../projects/formatters'
import { SceneChip } from '../testCases/SceneChip'
import { KNOWN_CAPABILITY_STATUSES, edgeSourceStyle } from './contentMapTypes'
import type { SceneThumbnail } from './contentMapTypes'
import type { SceneIncidence, SceneNode } from './sceneGraphLayout'
import { sceneKind, sceneTitle } from './sceneLabels'
import { ConditionTree, SceneStepList } from './SceneStepList'

/**
 * 그림의 대등한 대체물.
 *
 * 편의 기능이 아니다. SVG 는 `aria-hidden` 이고 포인터 전용이라, 키보드와
 * 스크린 리더 사용자가 씬을 고르고 그 씬에 닿는 전이를 따라가는 경로가
 * 여기밖에 없다. 그림에서 볼 수 있는 사실 — 어떤 씬이 있는지, 어디로
 * 이어지는지, 그 전이가 어디서 왔고 확인됐는지 — 이 전부 여기 글로 있다.
 */
export function SceneGraphInspector({
  nodes,
  incidence,
  selectedNodeId,
  onSelectNode,
  onClear,
}: {
  nodes: readonly SceneNode[]
  incidence: ReadonlyMap<string, SceneIncidence[]>
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  onClear: () => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.list
  const selected = nodes.find((node) => node.id === selectedNodeId) ?? null

  return (
    <div className="cm-inspector">
      <section aria-labelledby="cm-inspector-title" className="cm-inspector-selection">
        <header className="cm-inspector-header">
          <h2 id="cm-inspector-title">{copy.detailTitle}</h2>
          {selected !== null && (
            <button className="button button--secondary button--compact" onClick={onClear} type="button">
              {copy.clear}
            </button>
          )}
        </header>

        {selected === null ? (
          <p className="cm-inspector-hint">{copy.selectHint}</p>
        ) : (
          <SceneDetail
            incidence={incidence.get(selected.id) ?? []}
            node={selected}
            onSelectNode={onSelectNode}
          />
        )}
      </section>

      <section aria-labelledby="cm-scenes-title" className="cm-scene-list-section">
        <h2 className="cm-inspector-subtitle" id="cm-scenes-title">
          {copy.heading(nodes.length)}
        </h2>
        <ul className="cm-scene-list">
          {nodes.map((node) => {
            const isSelected = node.id === selectedNodeId
            const transitions = incidence.get(node.id) ?? []
            return (
              <li key={node.id}>
                <button
                  aria-current={isSelected ? 'true' : undefined}
                  className={`cm-scene${isSelected ? ' is-selected' : ''}`}
                  onClick={() => onSelectNode(node.id)}
                  type="button"
                >
                  <span className="cm-scene-title">
                    <SceneChip scene={node.name.trim()} />
                    <span>{truncate(sceneTitle(t, node), 48)}</span>
                  </span>
                  <span className="cm-scene-meta">
                    <span className={`cm-kind cm-kind--${sceneKind(node)}`}>
                      {t.contentMap.graph.sceneKinds[sceneKind(node)]}
                    </span>
                    {node.scene !== null && (
                      <span>{t.contentMap.summary.capabilities(node.scene.capabilities.total)}</span>
                    )}
                    <span>{t.contentMap.summary.transitions(transitions.length)}</span>
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

function SceneDetail({
  node,
  incidence,
  onSelectNode,
}: {
  node: SceneNode
  incidence: readonly SceneIncidence[]
  onSelectNode: (nodeId: string) => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.list
  const kind = sceneKind(node)
  // 한 번만 좁혀 두고 아래에서 계속 쓴다. `node.scene` 을 매번 다시 읽으면
  // 콜백 안에서 좁힘이 풀려 non-null 단언을 뿌리게 된다.
  const { scene } = node

  return (
    <div className="cm-detail">
      <p className="cm-detail-name">{sceneTitle(t, node)}</p>
      <p className={`cm-kind cm-kind--${kind}`}>{t.contentMap.graph.sceneKinds[kind]}</p>

      {scene === null ? (
        // 있는 사실이지 빈칸이 아니다. 왜 여기 있는지 말해 두지 않으면
        // 사용자는 화면이 뭔가 놓쳤다고 읽는다.
        <p className="cm-detail-note">
          {node.missingFromResponse ? copy.unmappedCopy : copy.nameOnly}
        </p>
      ) : (
        <dl className="cm-detail-fields">
          <dt>{copy.sceneIdLabel}</dt>
          <dd className="mono">{scene.id}</dd>
        </dl>
      )}

      {scene !== null && (
        <>
          <h3 className="cm-detail-subtitle">{copy.thumbnailHeading}</h3>
          <SceneThumbnailView thumbnail={scene.thumbnail} title={sceneTitle(t, node)} />

          <h3 className="cm-detail-subtitle">{copy.capabilitiesHeading}</h3>
          {scene.capabilities.total === 0 ? (
            <p className="cm-inspector-hint">{copy.noCapabilities}</p>
          ) : (
            <ul className="cm-capability-list">
              {KNOWN_CAPABILITY_STATUSES.filter(
                (status) => scene.capabilities[status] > 0,
              ).map((status) => (
                <li key={status}>
                  <span className={`cm-status-dot cm-status-dot--${status}`} aria-hidden="true" />
                  <span>{t.contentMap.summary.statuses[status]}</span>
                  <span className="mono cm-capability-count">{scene.capabilities[status]}</span>
                </li>
              ))}
            </ul>
          )}

          {/* 개수 바로 다음에 온다. "능력 6개"를 읽은 다음 묻게 되는 것이
              "그래서 무엇을 할 수 있나"이고, 그 답이 여기 있다. */}
          <SceneStepList scene={scene} />
        </>
      )}

      <h3 className="cm-detail-subtitle">{copy.transitionsHeading(incidence.length)}</h3>
      {incidence.length === 0 ? (
        <p className="cm-inspector-hint">{copy.noTransitions}</p>
      ) : (
        <ul className="cm-transition-list">
          {incidence.map((entry, index) => (
            <TransitionRow entry={entry} key={`${entry.edge.from}-${entry.edge.to}-${index}`} onSelectNode={onSelectNode} t={t} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 선택한 씬의 큰 미리보기.
 *
 * 그림 쪽 노드는 손톱만 해서 "어느 화면인지" 이상은 못 읽는다. 여기가 실제로
 * 화면을 보는 자리다.
 *
 * 세 가지 없음을 세 문장으로 가른다. 신고 자체가 없는 것, 스캔이 못 찍은 것,
 * 그리고 주소가 만료돼 불러오지 못한 것. 마지막은 서버가 모르는 사실이라
 * `onError` 로만 알 수 있고, 그때 깨진 이미지 아이콘을 그대로 두면 사용자는
 * 스캔이 실패했다고 잘못 읽는다.
 */
function SceneThumbnailView({
  thumbnail,
  title,
}: {
  thumbnail: SceneThumbnail | null
  title: string
}) {
  const { t } = useI18n()
  const copy = t.contentMap.list
  const [broken, setBroken] = useState(false)

  if (thumbnail === null) return <p className="cm-inspector-hint">{copy.thumbnailNone}</p>
  if (thumbnail.state === 'unavailable') {
    return <p className="cm-inspector-hint">{copy.thumbnailUnavailable(thumbnail.reason)}</p>
  }
  if (broken) return <p className="cm-inspector-hint">{copy.thumbnailBroken}</p>

  return (
    <figure className="cm-thumb">
      <img alt={title} className="cm-thumb-image" onError={() => setBroken(true)} src={thumbnail.url} />
      {thumbnail.width !== null && thumbnail.height !== null && (
        <figcaption className="cm-thumb-size mono">
          {copy.thumbnailSize(thumbnail.width, thumbnail.height)}
        </figcaption>
      )}
    </figure>
  )
}

function TransitionRow({
  entry,
  onSelectNode,
  t,
}: {
  entry: SceneIncidence
  onSelectNode: (nodeId: string) => void
  t: Messages
}) {
  const copy = t.contentMap.list
  const { transition } = entry.edge
  const style = edgeSourceStyle(transition.source)
  // 서버가 쓴 철자를 그대로 쓴다. 모르는 값을 아는 이름으로 바꿔 부르면
  // 화면이 서버가 저장한 것에 대해 거짓말을 하게 된다.
  const sourceName =
    style === 'unknown'
      ? transition.source.length > 0
        ? transition.source
        : t.contentMap.graph.sources.unknown
      : t.contentMap.graph.sources[style]

  return (
    <li>
      <button
        className={`cm-transition cm-transition--${style}`}
        onClick={() => onSelectNode(entry.other.id)}
        type="button"
      >
        <span className="cm-transition-target">
          {entry.direction === 'self'
            ? copy.directionSelf
            : `${entry.direction === 'out' ? copy.directionOut : copy.directionIn} ${truncate(sceneTitle(t, entry.other), 36)}`}
        </span>
        <span className="cm-transition-meta">
          <span>{sourceName}</span>
          <span aria-hidden="true">·</span>
          <span>
            {transition.verifiedAt === null
              ? copy.notVerified
              : copy.verifiedAt(formatDateTime(transition.verifiedAt))}
          </span>
          <span aria-hidden="true">·</span>
          <span className="mono">
            {transition.capabilityId === null
              ? copy.noCapabilityLink
              : copy.capabilityLabel(transition.capabilityId)}
          </span>
        </span>
      </button>
      {/* 그림은 조건을 한 줄로 접고, 그래프가 크면 아예 감춘다. 여기가 접지 않은 것을
          늘 두는 자리다 — 키보드와 스크린 리더로는 이쪽밖에 없기도 하다. */}
      {transition.given !== null && (
        <div className="cm-transition-condition">
          <ConditionTree node={transition.given} />
        </div>
      )}
    </li>
  )
}
