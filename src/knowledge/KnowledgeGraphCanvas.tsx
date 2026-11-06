import { useCallback, useMemo, useRef } from 'react'
import { useI18n } from '../i18n/useI18n'
import type { CanvasViewport } from '../contentMap/useCanvasViewport'
import type { DragHandlers } from './useKnowledgeDrag'
import { displayWidth, itemTitle, nodeShape, tagClass, truncate, type NodeShape } from './knowledgeLabels'
import { placeLabels, type LabelPlacement } from './knowledgeLabelPlacement'
import {
  LABEL_NODE_LIMIT,
  NODE_RADIUS,
  type GraphLayout,
  type PlacedEdge,
  type PlacedNode,
} from './knowledgeLayout'
import { documentNodeIds, KNOWN_RELATIONS, relationStyle, type RelationStyle } from './knowledgeTypes'

/**
 * The drawing.
 *
 * It is deliberately pointer-only and `aria-hidden`: two hundred focusable
 * shapes would be two hundred tab stops before the rest of the page, and a
 * screen reader has nothing useful to say about a `<path>`. The inspector's item
 * list and each item's relation list are the equivalent that DESIGN.md asks for
 * next to a visual annotation, and everything selectable here is selectable
 * there.
 */

export type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | null

type CanvasProps = {
  layout: GraphLayout
  selection: Selection
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edgeId: string) => void
  drag: DragHandlers
  /** 확대 · 이동(ARTEL-1190). 바탕을 끌면 옮기고, 노드를 끌면 예전처럼 그 노드를 옮긴다. */
  viewport: CanvasViewport
  /** 연결 없는 항목 묶음의 이름(ARTEL-1190). 수를 받아 문구를 만든다. */
  isolatedLabel: (count: number) => string
}

/** 연결 없는 항목 묶음 테두리가 노드에서 떨어진 거리, user unit. 이름표 한 줄이 들어갈 만큼이다. */
const ISOLATED_FRAME_PADDING = 30

/** 이름표 바탕이 글자보다 넓은 만큼, user unit. */
const LABEL_PAD = 4

/**
 * 이름표 바탕의 폭을 잴 때 한 칸의 폭, user unit. 배치(`LABEL_UNIT_WIDTH`)는 겹치지 않게 넉넉히 잡지만 바탕은 글자에
 * 붙어야 이웃과 닿지 않는다. 한글 한 자가 두 칸이라 10px 글꼴에서 칸 하나가 약 5다.
 */
const PLATE_UNIT_WIDTH = 5.1

function plateWidth(text: string): number {
  return displayWidth(text) * PLATE_UNIT_WIDTH + LABEL_PAD * 2
}

/** Relation styles that need an arrow definition, plus the fallback bucket. */
const ARROW_STYLES: RelationStyle[] = [...KNOWN_RELATIONS, 'UNKNOWN']

/**
 * Label budget, in Latin-character units — so about eleven Hangul syllables.
 *
 * Deliberately short. The ring gap is around a hundred user units and a label is
 * centred on its node, so anything much wider than this reaches its neighbour
 * before `placeLabels` has any room to work with, and the result is a graph that
 * drops most of its labels rather than one that shortens them.
 */
const LABEL_WIDTH = 22

/** Drawn width of one Latin character at the `.kg-node-label` size, in user units. */
const LABEL_UNIT_WIDTH = 6

/** Drawn height of one label line, in user units. */
const LABEL_LINE_HEIGHT = 13

export function KnowledgeGraphCanvas({
  layout,
  selection,
  onSelectNode,
  onSelectEdge,
  drag,
  viewport,
  isolatedLabel,
}: CanvasProps) {
  const { t } = useI18n()
  const showLabels = layout.nodes.length <= LABEL_NODE_LIMIT
  const svg = useRef<SVGSVGElement | null>(null)

  /**
   * Pointer position in the drawing's own units.
   *
   * The view box is scaled to fit, so client pixels and user units are not the
   * same thing and a node dragged with raw client deltas would slide away from
   * the cursor at any zoom but one.
   */
  const toUserSpace = useCallback((event: { clientX: number; clientY: number }) => {
    const element = svg.current
    const matrix = element?.getScreenCTM()
    if (element === null || matrix === null || matrix === undefined) return null
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y }
  }, [])

  // Which nodes the current selection touches. Used to keep the rest of the
  // drawing present but quiet, rather than hiding it — the surroundings are part
  // of what makes a selected relation mean anything.
  //
  // Memoised because the label placement below depends on it, and a fresh Set on
  // every render would relay every label on every render.
  const related = useMemo(() => {
    const touched = new Set<string>()
    if (selection?.kind === 'node') {
      touched.add(selection.id)
      for (const placed of layout.edges) {
        if (placed.edge.from === selection.id) touched.add(placed.edge.to)
        if (placed.edge.to === selection.id) touched.add(placed.edge.from)
      }
    } else if (selection?.kind === 'edge') {
      const placed = layout.edges.find((candidate) => candidate.id === selection.id)
      if (placed !== undefined) {
        touched.add(placed.edge.from)
        touched.add(placed.edge.to)
      }
    }
    return touched
  }, [layout.edges, selection])

  // See `documentNodeIds` in `knowledgeTypes.ts`: a document node is not a
  // field value, it is whatever a `PART_OF` edge points at.
  const documentIds = useMemo(
    () => documentNodeIds(layout.edges.map((placed) => placed.edge)),
    [layout.edges],
  )

  // 관계가 하나도 없는 항목들. 레이아웃은 이것들을 끝에 격자로 모아 두므로, 그 둘레에 테두리와 이름을 씌워 "아직 아무것과도
  // 이어지지 않은 것" 이라고 말한다(ARTEL-1190). 전부 연결 없음이면 그림 전체가 그 묶음이라 씌우지 않는다.
  const isolatedFrame = useMemo(() => {
    const touched = new Set<string>()
    for (const placed of layout.edges) {
      touched.add(placed.edge.from)
      touched.add(placed.edge.to)
    }
    const loose = layout.nodes.filter((placed) => !touched.has(placed.node.id))
    if (loose.length === 0 || loose.length === layout.nodes.length) return null
    // 노드만이 아니라 그 이름표까지 들어가야 한다. 이름표는 노드 가운데에 걸리므로 반폭씩 양옆으로 나온다.
    const halfLabel = showLabels
      ? Math.max(...loose.map((placed) => plateWidth(truncate(itemTitle(t, placed.node), LABEL_WIDTH)) / 2))
      : NODE_RADIUS
    const title = isolatedLabel(loose.length)
    const left = Math.min(...loose.map((placed) => placed.x)) - Math.max(halfLabel, NODE_RADIUS) - 10
    const right = Math.max(...loose.map((placed) => placed.x)) + Math.max(halfLabel, NODE_RADIUS) + 10
    const top = Math.min(...loose.map((placed) => placed.y)) - ISOLATED_FRAME_PADDING - LABEL_LINE_HEIGHT
    const bottom = Math.max(...loose.map((placed) => placed.y)) + ISOLATED_FRAME_PADDING + LABEL_LINE_HEIGHT
    return {
      count: loose.length,
      title,
      x: left,
      y: top,
      width: Math.max(right - left, plateWidth(title) + 16),
      height: bottom - top,
    }
  }, [isolatedLabel, layout.edges, layout.nodes, showLabels, t])

  // Labels are laid out, not just shortened. Shortening alone still lets two
  // sentences land on the same spot — see `placeLabels`. The selection and its
  // neighbours are forced through so that clicking a node always names it and
  // the ones it relates to.
  const labels = useMemo(
    () =>
      showLabels
        ? placeLabels(layout.nodes, (placed) => truncate(itemTitle(t, placed.node), LABEL_WIDTH), {
            unitWidth: LABEL_UNIT_WIDTH,
            lineHeight: LABEL_LINE_HEIGHT,
            widthLimit: LABEL_WIDTH,
            keep: related,
          })
        : new Map<string, LabelPlacement>(),
    [layout.nodes, related, showLabels, t],
  )

  return (
    <svg
      aria-hidden="true"
      className={`kg-canvas${selection === null ? '' : ' kg-canvas--focused'}${
        drag.dragging === null ? '' : ' kg-canvas--dragging'
      }${viewport.panning ? ' is-panning' : ''}`}
      onClickCapture={viewport.bind.onClickCapture}
      // 노드 위에서 누르면 노드가 먼저 받아 끌기를 시작하고 여기까지 오지 않는다(NodeMark). 바탕에서 누른 것만 옮기기다.
      onPointerDown={viewport.bind.onPointerDown}
      onPointerMove={(event) => {
        if (drag.dragging === null) {
          viewport.bind.onPointerMove(event)
          return
        }
        const at = toUserSpace(event)
        if (at !== null) drag.onDragMove(at.x, at.y)
      }}
      // Both endings matter. `up` is the ordinary one; `cancel` is the browser
      // taking the gesture away (a scroll gesture, a lost window), and without it
      // the node stays welded to a pointer that is no longer sending events.
      onPointerCancel={(event) => {
        drag.onDragEnd()
        viewport.bind.onPointerUp(event)
      }}
      onPointerUp={(event) => {
        drag.onDragEnd()
        viewport.bind.onPointerUp(event)
      }}
      preserveAspectRatio="xMidYMid meet"
      ref={(node) => {
        svg.current = node
        viewport.bind.ref(node)
      }}
      viewBox={viewport.viewBox}
    >
      <defs>
        {ARROW_STYLES.map((style) => (
          <marker
            className={`kg-arrow kg-arrow--${style}`}
            id={`kg-arrow-${style}`}
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

      {isolatedFrame !== null && (
        <g className="kg-isolated-frame">
          <rect
            height={isolatedFrame.height}
            rx="8"
            width={isolatedFrame.width}
            x={isolatedFrame.x}
            y={isolatedFrame.y}
          />
          <text x={isolatedFrame.x + 10} y={isolatedFrame.y + LABEL_LINE_HEIGHT + 5}>
            {isolatedFrame.title}
          </text>
        </g>
      )}

      <g className="kg-edges">
        {layout.edges.map((placed) => (
          <EdgeMark
            // 항목을 고르면 그 항목에 닿은 선만 또렷하고 나머지는 흐리다(ARTEL-1190). 관계를 고르면 그 선만.
            dimmed={
              selection !== null &&
              (selection.kind === 'edge'
                ? selection.id !== placed.id
                : placed.edge.from !== selection.id && placed.edge.to !== selection.id)
            }
            key={placed.id}
            onSelect={() => onSelectEdge(placed.id)}
            placed={placed}
            related={selection?.kind === 'node' && (placed.edge.from === selection.id || placed.edge.to === selection.id)}
            selected={selection?.kind === 'edge' && selection.id === placed.id}
          />
        ))}
      </g>

      <g className="kg-nodes">
        {layout.nodes.map((placed) => (
          <NodeMark
            dimmed={selection !== null && !related.has(placed.node.id)}
            held={drag.dragging === placed.node.id}
            isDocument={documentIds.has(placed.node.id)}
            key={placed.node.id}
            label={labels.get(placed.node.id) ?? null}
            onDragStart={(event) => {
              const at = toUserSpace(event)
              if (at === null) return
              // The capture is what lets the pointer leave the SVG mid-drag and
              // still be followed; without it the node stops at the edge.
              event.currentTarget.setPointerCapture(event.pointerId)
              // 바탕 옮기기가 같은 누름을 받지 않게 한다.
              event.stopPropagation()
              drag.onDragStart(placed.node.id, at.x, at.y)
            }}
            onSelect={() => onSelectNode(placed.node.id)}
            placed={placed}
            selected={selection?.kind === 'node' && selection.id === placed.node.id}
          />
        ))}
      </g>
    </svg>
  )
}

function EdgeMark({
  placed,
  selected,
  related,
  dimmed,
  onSelect,
}: {
  placed: PlacedEdge
  selected: boolean
  /** 고른 항목에 닿은 선. */
  related: boolean
  dimmed: boolean
  onSelect: () => void
}) {
  const style = relationStyle(placed.edge.relation)
  const contradicts = style === 'CONTRADICTS'
  const classes = ['kg-edge', `kg-edge--${style}`]
  if (selected) classes.push('is-selected')
  if (related) classes.push('is-related')
  if (dimmed) classes.push('is-dimmed')

  return (
    <g className={classes.join(' ')}>
      {/* A 1–2px stroke is far too thin to click. The invisible copy underneath
          is the hit target and never carries a marker or a dash pattern. */}
      <path className="kg-edge-hit" d={placed.path} onClick={onSelect} />
      <path
        className="kg-edge-line"
        d={placed.path}
        markerEnd={`url(#kg-arrow-${style})`}
        // A contradiction is not a direction of travel: whichever end the agent
        // happened to write first, the two items disagree with each other. Two
        // heads say that; one would invent an ordering the data does not have.
        markerStart={contradicts ? `url(#kg-arrow-${style})` : undefined}
      />
      {contradicts && (
        // The shape that carries the meaning. Colour repeats it; this is what a
        // user who cannot separate the reds still sees.
        <g className="kg-edge-glyph" transform={`translate(${placed.midX} ${placed.midY})`}>
          <circle className="kg-edge-glyph-disc" r="8" />
          <path className="kg-edge-glyph-mark" d="M -3.6 -3.6 L 3.6 3.6 M 3.6 -3.6 L -3.6 3.6" />
        </g>
      )}
    </g>
  )
}

/** How far outside the ordinary mark a document node's ring sits. */
const DOCUMENT_RING_PADDING = 6

/**
 * One shape, drawn at a given full width (diameter for a circle, side for a
 * square or diamond). Pulled out of `NodeMark` so a document node's ring can
 * reuse the exact same shape as its mark — a bigger, outlined version of
 * itself — instead of the drawing needing a fourth glyph the legend would have
 * to teach separately.
 */
function shapeGlyph(shape: NodeShape, size: number, className: string) {
  if (shape === 'circle') return <circle className={className} r={size / 2} />
  if (shape === 'square') {
    return <rect className={className} height={size} rx="2" width={size} x={-size / 2} y={-size / 2} />
  }
  return (
    <rect className={className} height={size} transform="rotate(45)" width={size} x={-size / 2} y={-size / 2} />
  )
}

function NodeMark({
  placed,
  selected,
  dimmed,
  held,
  isDocument,
  label,
  onSelect,
  onDragStart,
}: {
  placed: PlacedNode
  selected: boolean
  dimmed: boolean
  held: boolean
  /** Whether some `PART_OF` edge points at this node — see `documentNodeIds`. */
  isDocument: boolean
  label: LabelPlacement | null
  onSelect: () => void
  onDragStart: (event: React.PointerEvent<SVGGElement>) => void
}) {
  const shape = nodeShape(placed.node.source)
  const classes = ['kg-node', `kg-node--tag-${tagClass(placed.node.tag)}`, `kg-node--${shape}`]
  if (isDocument) classes.push('kg-node--document')
  if (selected) classes.push('is-selected')
  if (dimmed) classes.push('is-dimmed')
  if (held) classes.push('is-held')

  const markSize = shape === 'circle' ? NODE_RADIUS * 2 : NODE_RADIUS * 1.7

  return (
    <g
      className={classes.join(' ')}
      // Click still selects. A drag is a pointer gesture and a click is what the
      // browser reports when that gesture went nowhere, so the two coexist
      // without a distance threshold of our own.
      onClick={onSelect}
      onPointerDown={onDragStart}
      transform={`translate(${placed.x} ${placed.y})`}
    >
      {isDocument && shapeGlyph(shape, markSize + DOCUMENT_RING_PADDING * 2, 'kg-node-document-ring')}
      {shapeGlyph(shape, markSize, 'kg-node-mark')}
      {label !== null && (
        // The offset comes from the placement pass, not from here: a label that
        // could not fit below its node is drawn above it instead.
        <g className="kg-node-label-group">
          {/* 이름표 바탕(ARTEL-1190). 선이 이름표 밑으로 지나가도 글자가 가려지지 않는다. 폭은 배치가 쓰는 것과 같은 추정이다. */}
          <rect
            className="kg-node-label-plate"
            height={LABEL_LINE_HEIGHT + 4}
            rx={(LABEL_LINE_HEIGHT + 4) / 2}
            width={plateWidth(label.text)}
            x={-plateWidth(label.text) / 2}
            y={label.y - LABEL_LINE_HEIGHT + 1}
          />
          <text className="kg-node-label" textAnchor="middle" y={label.y}>
            {label.text}
          </text>
        </g>
      )}
    </g>
  )
}
