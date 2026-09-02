import { useCallback, useMemo, useRef } from 'react'
import { useI18n } from '../i18n/useI18n'
import type { DragHandlers } from './useKnowledgeDrag'
import { itemTitle, nodeShape, tagClass, truncate, type NodeShape } from './knowledgeLabels'
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
}: CanvasProps) {
  const { t } = useI18n()
  const showLabels = layout.nodes.length <= LABEL_NODE_LIMIT
  const svg = useRef<SVGSVGElement>(null)

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
      }`}
      onPointerMove={(event) => {
        if (drag.dragging === null) return
        const at = toUserSpace(event)
        if (at !== null) drag.onDragMove(at.x, at.y)
      }}
      // Both endings matter. `up` is the ordinary one; `cancel` is the browser
      // taking the gesture away (a scroll gesture, a lost window), and without it
      // the node stays welded to a pointer that is no longer sending events.
      onPointerCancel={drag.onDragEnd}
      onPointerUp={drag.onDragEnd}
      preserveAspectRatio="xMidYMid meet"
      ref={svg}
      viewBox={layout.viewBox}
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

      <g className="kg-edges">
        {layout.edges.map((placed) => (
          <EdgeMark
            dimmed={selection !== null && selection.kind === 'edge' && selection.id !== placed.id}
            key={placed.id}
            onSelect={() => onSelectEdge(placed.id)}
            placed={placed}
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
  dimmed,
  onSelect,
}: {
  placed: PlacedEdge
  selected: boolean
  dimmed: boolean
  onSelect: () => void
}) {
  const style = relationStyle(placed.edge.relation)
  const contradicts = style === 'CONTRADICTS'
  const classes = ['kg-edge', `kg-edge--${style}`]
  if (selected) classes.push('is-selected')
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
        <text className="kg-node-label" textAnchor="middle" y={label.y}>
          {label.text}
        </text>
      )}
    </g>
  )
}
