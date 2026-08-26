import { useMemo, type CSSProperties } from 'react'
import { useI18n } from '../i18n/useI18n'
import { truncate } from '../knowledge/knowledgeLabels'
import { placeLabels, type LabelPlacement } from '../knowledge/knowledgeLabelPlacement'
import {
  LABEL_NODE_LIMIT,
  NODE_RADIUS,
  type PlacedEdge,
  type PlacedNode,
} from '../knowledge/knowledgeLayout'
import { conditionSummary } from './conditionSummary'
import { KNOWN_EDGE_SOURCES, type EdgeSourceStyle } from './contentMapTypes'
import { sceneHue } from '../testCases/sceneHue'
import type { SceneEdge, SceneGraphLayout, SceneNode } from './sceneGraphLayout'
import { sceneShape, sceneTitle } from './sceneLabels'

/**
 * 그림.
 *
 * 일부러 포인터 전용이고 `aria-hidden` 이다. 씬 수십 개가 전부 포커스를
 * 받으면 페이지의 나머지에 닿기 전에 탭을 수십 번 눌러야 하고, 스크린
 * 리더가 `<path>` 에 대해 할 말은 없다. DESIGN.md 가 시각 주석에 요구하는
 * 대등한 대체물은 옆의 씬 목록이고, 여기서 고를 수 있는 것은 전부 거기서도
 * 고를 수 있다.
 *
 * 전이 출처는 **선 모양**이 말한다. 색은 그것을 반복할 뿐이다 — 색만으로
 * 상태를 전하지 않는다는 규칙이 그래프에도 그대로 적용된다.
 */

type CanvasProps = {
  layout: SceneGraphLayout
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
}

/** 화살표 정의가 필요한 출처들과, 나머지를 모으는 갈래. */
const ARROW_STYLES: EdgeSourceStyle[] = [...KNOWN_EDGE_SOURCES, 'unknown']

/** 라벨 예산, 라틴 문자 폭 기준. 한글로는 열한 자쯤이다. */
const LABEL_WIDTH = 22

/** `.cm-node-label` 크기에서 라틴 한 글자의 그려지는 폭(사용자 단위). */
const LABEL_UNIT_WIDTH = 6

/** 라벨 한 줄의 그려지는 높이(사용자 단위). */
const LABEL_LINE_HEIGHT = 13

/** 사각·마름모 노드의 한 변. `SceneMark` 의 `side` 와 같은 값이어야 클립이 맞는다. */
const THUMB_SIDE = NODE_RADIUS * 1.7

/**
 * 조건 라벨을 전부 펼쳐 두는 전이 수의 상한.
 *
 * 넘으면 선 위의 글자들이 서로 겹쳐 어느 것이 어느 선의 조건인지 못 읽는다. 그때는 고른 것과 포인터가 얹힌 것만 보인다 —
 * 감추는 것이 아니라 묻는 순서를 바꾸는 것이고, 인스펙터에는 언제나 전부 있다.
 */
const CONDITION_LABEL_EDGE_LIMIT = 12

/** 조건 한 줄의 폭 예산, 라틴 문자 기준. */
const CONDITION_WIDTH = 28

export function SceneGraphCanvas({ layout, selectedNodeId, onSelectNode }: CanvasProps) {
  const { t } = useI18n()
  const showLabels = layout.nodes.length <= LABEL_NODE_LIMIT

  // 선택이 닿는 노드들. 나머지를 감추지 않고 조용하게만 두는 이유는, 주변이
  // 있어야 선택한 전이가 무엇을 뜻하는지 읽히기 때문이다.
  const related = useMemo(() => {
    const touched = new Set<string>()
    if (selectedNodeId === null) return touched
    touched.add(selectedNodeId)
    for (const placed of layout.edges) {
      if (placed.edge.from === selectedNodeId) touched.add(placed.edge.to)
      if (placed.edge.to === selectedNodeId) touched.add(placed.edge.from)
    }
    return touched
  }, [layout.edges, selectedNodeId])

  // 라벨은 줄이기만 해서는 안 되고 배치까지 해야 한다. 줄이기만 하면 두 이름이
  // 같은 자리에 떨어져 둘 다 못 읽게 된다 — `placeLabels` 참고.
  const labels = useMemo(
    () =>
      showLabels
        ? placeLabels(
            layout.nodes,
            (placed) => truncate(sceneTitle(t, placed.node), LABEL_WIDTH),
            {
              unitWidth: LABEL_UNIT_WIDTH,
              lineHeight: LABEL_LINE_HEIGHT,
              widthLimit: LABEL_WIDTH,
              keep: related,
            },
          )
        : new Map<string, LabelPlacement>(),
    [layout.nodes, related, showLabels, t],
  )

  return (
    <svg
      aria-hidden="true"
      className="cm-canvas"
      preserveAspectRatio="xMidYMid meet"
      viewBox={layout.viewBox}
    >
      <defs>
        {ARROW_STYLES.map((style) => (
          <marker
            className={`cm-arrow cm-arrow--${style}`}
            id={`cm-arrow-${style}`}
            key={style}
            markerHeight="7"
            markerWidth="7"
            orient="auto-start-reverse"
            refX="6"
            refY="3.5"
            viewBox="0 0 7 7"
          >
            <path d="M 0 0 L 7 3.5 L 0 7 z" />
          </marker>
        ))}

        {/*
          노드 모양마다 클립 하나. 이미지를 모양 밖으로 넘치게 두면 이웃 노드를
          덮어 그래프가 읽히지 않는다. `objectBoundingBox` 를 쓰지 않는 이유는
          마름모가 회전 변환으로 그려져 경계 상자가 실제 모양과 다르기 때문이다.
        */}
        <clipPath clipPathUnits="userSpaceOnUse" id="cm-clip-circle">
          <circle r={NODE_RADIUS} />
        </clipPath>
        <clipPath clipPathUnits="userSpaceOnUse" id="cm-clip-square">
          <rect height={THUMB_SIDE} rx="2" width={THUMB_SIDE} x={-THUMB_SIDE / 2} y={-THUMB_SIDE / 2} />
        </clipPath>
        <clipPath clipPathUnits="userSpaceOnUse" id="cm-clip-diamond">
          <rect
            height={THUMB_SIDE}
            transform="rotate(45)"
            width={THUMB_SIDE}
            x={-THUMB_SIDE / 2}
            y={-THUMB_SIDE / 2}
          />
        </clipPath>
      </defs>

      <g className="cm-edges">
        {layout.edges.map((placed) => (
          <TransitionMark
            alwaysLabelled={layout.edges.length <= CONDITION_LABEL_EDGE_LIMIT}
            dimmed={selectedNodeId !== null && !touchesSelection(placed, selectedNodeId)}
            key={placed.id}
            placed={placed}
            selected={selectedNodeId !== null && touchesSelection(placed, selectedNodeId)}
          />
        ))}
      </g>

      <g className="cm-nodes">
        {layout.nodes.map((placed) => (
          <SceneMark
            dimmed={selectedNodeId !== null && !related.has(placed.node.id)}
            key={placed.node.id}
            label={labels.get(placed.node.id) ?? null}
            onSelect={() => onSelectNode(placed.node.id)}
            placed={placed}
            selected={selectedNodeId === placed.node.id}
          />
        ))}
      </g>
    </svg>
  )
}

function touchesSelection(placed: PlacedEdge<SceneEdge>, nodeId: string): boolean {
  return placed.edge.from === nodeId || placed.edge.to === nodeId
}

/**
 * 전이 하나.
 *
 * 런타임으로 확인된 전이에는 선 위에 작은 표식을 얹는다. 확인 여부는
 * 이 화면이 세는 값(`verification`)이기도 해서, 그림에서도 셀 수 있어야
 * 요약 줄과 그림이 서로를 설명한다.
 */
function TransitionMark({
  placed,
  dimmed,
  selected,
  alwaysLabelled,
}: {
  placed: PlacedEdge<SceneEdge>
  dimmed: boolean
  selected: boolean
  alwaysLabelled: boolean
}) {
  const { t } = useI18n()
  const { style, transition } = placed.edge
  const classes = ['cm-edge', `cm-edge--${style}`]
  if (dimmed) classes.push('is-dimmed')
  if (transition.verifiedAt !== null) classes.push('is-verified')

  // 조건이 없는 전이는 라벨 자체가 없다. 빈 자리를 그리면 "조건 없음"과 "조건을 못 읽음"이 같은 모양이 된다 —
  // 그 둘을 가르는 것은 인스펙터의 문장이고, 그림은 아예 말하지 않는 쪽을 고른다.
  const condition = transition.given === null ? null : conditionSummary(t, transition.given)

  // 늘 보이지 않을 때는 CSS 가 hover 로 되살린다. React 상태로 hover 를 들면 포인터가 지나갈 때마다 그래프 전체가
  // 다시 그려지고, 씬 수백 개에서 그 비용이 곧바로 보인다.
  const labelClasses = ['cm-edge-label']
  if (!alwaysLabelled && !selected) labelClasses.push('is-quiet')

  return (
    <g className={classes.join(' ')}>
      <path className="cm-edge-line" d={placed.path} markerEnd={`url(#cm-arrow-${style})`} />
      {transition.verifiedAt !== null && (
        // 모양이 뜻을 나른다. 색은 그것을 되풀이할 뿐이다.
        <g className="cm-edge-glyph" transform={`translate(${placed.midX} ${placed.midY})`}>
          <circle className="cm-edge-glyph-disc" r="6.5" />
          <path className="cm-edge-glyph-mark" d="M -3 0 L -0.8 2.4 L 3 -2.4" />
        </g>
      )}
      {condition !== null && (
        <text
          className={labelClasses.join(' ')}
          textAnchor="middle"
          x={placed.midX}
          y={placed.midY - 9}
        >
          {truncate(condition, CONDITION_WIDTH)}
        </text>
      )}
    </g>
  )
}

function SceneMark({
  placed,
  selected,
  dimmed,
  label,
  onSelect,
}: {
  placed: PlacedNode<SceneNode>
  selected: boolean
  dimmed: boolean
  label: LabelPlacement | null
  onSelect: () => void
}) {
  const shape = sceneShape(placed.node)
  const classes = ['cm-node', `cm-node--${shape}`]
  if (selected) classes.push('is-selected')
  if (dimmed) classes.push('is-dimmed')

  // 색상값이 아니라 색상**각**만 인라인이다. 명도와 채도는 CSS 가 테마별로
  // 정하므로 TSX 에 원시 16진수가 들어가지 않는다. 같은 씬 이름은 라이브러리와
  // 플로우에서 쓰던 것과 같은 색을 얻어, 목록과 그림이 눈으로 이어진다.
  const style = { '--cat-hue': String(sceneHue(placed.node.name)) } as CSSProperties
  const side = THUMB_SIDE
  // 대표 이미지는 모양을 **채울** 뿐 모양을 대신하지 않는다. 밟은 씬과 안 밟은
  // 씬을 가르는 것은 여전히 모양이고, 이미지가 있는 씬만 동그라미가 되어 버리면
  // 범례가 거짓말을 한다.
  const thumbnail = placed.node.scene?.thumbnail ?? null
  const image = thumbnail?.state === 'available' ? thumbnail : null
  const box = shape === 'circle' ? NODE_RADIUS * 2 : side

  return (
    <g className={classes.join(' ')} onClick={onSelect} style={style} transform={`translate(${placed.x} ${placed.y})`}>
      {shape === 'circle' && <circle className="cm-node-mark" r={NODE_RADIUS} />}
      {shape === 'square' && (
        <rect className="cm-node-mark" height={side} rx="2" width={side} x={-side / 2} y={-side / 2} />
      )}
      {shape === 'diamond' && (
        <rect
          className="cm-node-mark"
          height={side}
          transform="rotate(45)"
          width={side}
          x={-side / 2}
          y={-side / 2}
        />
      )}
      {image !== null && (
        // `slice` 로 비율을 지킨다. 늘리면 화면이 실제와 다른 모양으로 보이고,
        // 그 그림을 보고 쓴 테스트 케이스는 없는 레이아웃을 가정한다.
        <image
          className="cm-node-thumb"
          clipPath={`url(#cm-clip-${shape})`}
          height={box}
          href={image.url}
          preserveAspectRatio="xMidYMid slice"
          width={box}
          x={-box / 2}
          y={-box / 2}
        />
      )}
      {label !== null && (
        <text className="cm-node-label" textAnchor="middle" y={label.y}>
          {label.text}
        </text>
      )}
    </g>
  )
}
