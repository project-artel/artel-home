import { displayWidth } from './knowledgeLabels'
import { NODE_RADIUS, type LayoutNode, type PlacedNode } from './knowledgeLayout'

/*
 * Which node labels actually get drawn.
 *
 * Shortening a label is not enough on its own. The layout places neighbours a
 * ring gap apart — around a hundred units — and a label that fits its own budget
 * still lands on top of the one next to it, which is what made the top row of
 * the graph unreadable: three sentences printed over each other.
 *
 * So the labels are laid out too, greedily, and the ones that cannot fit are
 * dropped rather than drawn on top of something. A dropped label is not lost —
 * the node is still there to click, and the inspector holds the full text. A
 * label drawn over another label loses both.
 *
 * The order is fixed (priority, then degree, then id), so the same graph drops
 * the same labels every time. That matters here for the same reason the layout
 * itself is deterministic: a picture that rearranges on every visit teaches
 * nobody anything.
 */

/** Half-leading above and below the text box, so two rows never touch exactly. */
const LINE_PADDING = 3

/** Distance from the node centre to the label baseline, below and above. */
const BELOW_OFFSET = NODE_RADIUS + 15
const ABOVE_OFFSET = -(NODE_RADIUS + 8)

export type LabelPlacement = {
  /** Text as drawn, already shortened to [LabelOptions.widthLimit]. */
  text: string
  /** Baseline offset from the node centre. Negative means the label sits above. */
  y: number
}

export type LabelOptions = {
  /** Drawn width of one Latin character at the label's font size, in user units. */
  unitWidth: number
  /** Drawn height of one line, in user units. */
  lineHeight: number
  /** Width budget handed to `truncate`, in Latin-character units. */
  widthLimit: number
  /**
   * Nodes whose label must be drawn even if it collides — the selection and its
   * neighbours. Their boxes still block later labels, so nothing lands on them.
   */
  keep: ReadonlySet<string>
}

type Box = { left: number; right: number; top: number; bottom: number }

/**
 * @param label the already-shortened text for a node, or the empty string to skip it.
 */
export function placeLabels<N extends LayoutNode>(
  nodes: readonly PlacedNode<N>[],
  label: (node: PlacedNode<N>) => string,
  options: LabelOptions,
): Map<string, LabelPlacement> {
  const placements = new Map<string, LabelPlacement>()
  const taken: Box[] = []

  for (const placed of [...nodes].sort(byPriority<N>(options.keep))) {
    const text = label(placed)
    if (text.length === 0) continue

    const width = displayWidth(text) * options.unitWidth
    const forced = options.keep.has(placed.node.id)

    // Below first — that is where a label reads as belonging to its node. Above
    // is the fallback, and it is tried before giving up because in a ring layout
    // the crowding is almost always on one side.
    const candidates = [BELOW_OFFSET, ABOVE_OFFSET]
    let chosen: { y: number; box: Box } | null = null

    for (const y of candidates) {
      const box = boxAt(placed.x, placed.y + y, width, options.lineHeight)
      if (!taken.some((other) => overlaps(other, box))) {
        chosen = { y, box }
        break
      }
    }

    if (chosen === null) {
      if (!forced) continue
      // A forced label is drawn where it belongs and its box is still reserved,
      // so the labels considered after it move out of its way instead of piling
      // on. It may overlap something already placed; that is the cost of always
      // showing the selection, and it is bounded to one label.
      chosen = {
        y: BELOW_OFFSET,
        box: boxAt(placed.x, placed.y + BELOW_OFFSET, width, options.lineHeight),
      }
    }

    taken.push(chosen.box)
    placements.set(placed.node.id, { text, y: chosen.y })
  }

  return placements
}

/**
 * Kept labels first, then the busiest nodes.
 *
 * Degree is the tie-break that matters: a node several edges run into is the one
 * a reader orients by, so it should keep its name when space runs out. The id
 * comparison at the end is only there to make the order total.
 */
function byPriority<N extends LayoutNode>(keep: ReadonlySet<string>) {
  return (left: PlacedNode<N>, right: PlacedNode<N>): number => {
    const leftKept = keep.has(left.node.id)
    const rightKept = keep.has(right.node.id)
    if (leftKept !== rightKept) return leftKept ? -1 : 1
    if (left.degree !== right.degree) return right.degree - left.degree
    return left.node.id.localeCompare(right.node.id)
  }
}

function boxAt(centreX: number, baselineY: number, width: number, lineHeight: number): Box {
  const half = width / 2
  return {
    left: centreX - half,
    right: centreX + half,
    // The baseline sits near the bottom of the glyphs, so the box reaches up.
    top: baselineY - lineHeight + LINE_PADDING,
    bottom: baselineY + LINE_PADDING,
  }
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}
