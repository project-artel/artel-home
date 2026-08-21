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
      </defs>

      <g className="cm-edges">
        {layout.edges.map((placed) => (
          <TransitionMark
            dimmed={selectedNodeId !== null && !touchesSelection(placed, selectedNodeId)}
            key={placed.id}
            placed={placed}
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
}: {
  placed: PlacedEdge<SceneEdge>
  dimmed: boolean
}) {
  const { style, transition } = placed.edge
  const classes = ['cm-edge', `cm-edge--${style}`]
  if (dimmed) classes.push('is-dimmed')
  if (transition.verifiedAt !== null) classes.push('is-verified')

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
  const side = NODE_RADIUS * 1.7

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
      {label !== null && (
        <text className="cm-node-label" textAnchor="middle" y={label.y}>
          {label.text}
        </text>
      )}
    </g>
  )
}
