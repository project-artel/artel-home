import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from './knowledgeTypes'

/*
 * Where every node and every edge goes. Pure geometry — no React, no DOM, no
 * clock — so the hard parts (self edges, parallel edges, reversed pairs, an
 * empty graph) are testable without rendering anything.
 *
 * ## Why this is deterministic and not force-directed
 *
 * A force simulation over a few hundred nodes needs an iteration budget and a
 * stopping rule just to stay off the frame budget, and after all that its output
 * is unstable: the same knowledge base draws differently on every visit, so
 * nothing a person learns about the shape survives a reload, and the layout
 * cannot be asserted in a test. Meanwhile the graph already has the structure
 * worth drawing — which items are connected at all, and how far each sits from
 * the busiest item in its cluster. That is what this computes, in one pass:
 *
 *   1. Union-find over the edges splits the graph into connected components.
 *      Components are what "what does this project know" actually looks like:
 *      a few clusters plus a tail of items nothing has been related to yet.
 *   2. Inside a component, BFS from its highest-degree node assigns a depth, and
 *      each depth becomes a ring around that node. Ring order follows the parent
 *      ring's angular order, which keeps most edges from crossing without any
 *      iteration.
 *   3. Components are shelf-packed largest first, and the isolated items — which
 *      would waste a whole shelf each — go into a grid of their own at the end.
 *
 * Same input, same picture, every time.
 */

/** Radius of a node's mark. Edges stop here so an arrowhead is never buried. */
export const NODE_RADIUS = 13

/** Distance between consecutive BFS rings. */
const RING_GAP = 104

/** Minimum arc length between two neighbours on the same ring. */
const MIN_ARC = 76

/** Whitespace between two packed components. */
const COMPONENT_GAP = 64

/** Cell size of the grid the unconnected items go into. */
const ISOLATED_CELL = 78

/** Padding around the whole drawing, inside the view box. */
const PADDING = 48

/** How far apart parallel edges between the same pair are fanned. */
const CURVE_STEP = 26

/** Radius of the first self edge's loop; each further one grows by this much. */
const SELF_LOOP_RADIUS = 20

/** Extra clearance at the arrow end so the head sits clear of the node. */
const ARROW_CLEARANCE = 5

/**
 * Above this many nodes every label is drawn but none of them can be read, so
 * they are dropped and the inspector's list becomes the way to read summaries.
 */
export const LABEL_NODE_LIMIT = 44

export type PlacedNode = {
  node: KnowledgeNode
  x: number
  y: number
  /** Index of the connected component, largest first. Isolated items get their own. */
  component: number
  /** Incident edges, self edges included. Drives the size of the mark. */
  degree: number
}

export type PlacedEdge = {
  /** Stable, unique within one layout — usable as a React key and a selection id. */
  id: string
  edge: KnowledgeEdge
  /** `d` for the visible stroke and for the wider transparent hit target. */
  path: string
  /** Where a relation glyph or label belongs: the midpoint of the drawn curve. */
  midX: number
  midY: number
  /** True when both endpoints are the same node, which is drawn as a loop. */
  selfEdge: boolean
}

export type GraphLayout = {
  nodes: PlacedNode[]
  edges: PlacedEdge[]
  /** `x y w h` covering everything, padded. `0 0 0 0` is never emitted. */
  viewBox: string
  width: number
  height: number
  /** Connected components with two or more members. */
  clusterCount: number
  /**
   * Items no relation touches at all. Counted by degree, not by component size:
   * an item that only points at itself is a component of one but is not
   * unlinked, and telling the user otherwise would hide the self relation.
   */
  isolatedCount: number
}

type Extent = { minX: number; minY: number; maxX: number; maxY: number }

/** Bounding box of a set of points, or null when there are none. */
function extentOf(points: readonly { x: number; y: number }[]): Extent | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Union-find over node indices. Small and iterative; the graphs here are small. */
function makeUnionFind(size: number) {
  const parent = Array.from({ length: size }, (_, index) => index)

  function find(index: number): number {
    let root = index
    while (parent[root] !== root) root = parent[root]
    // Path compression, so a long chain of relations does not make this quadratic.
    let walk = index
    while (parent[walk] !== root) {
      const next = parent[walk]
      parent[walk] = root
      walk = next
    }
    return root
  }

  function union(left: number, right: number): void {
    const a = find(left)
    const b = find(right)
    if (a !== b) parent[a] = b
  }

  return { find, union }
}

type Cluster = {
  /** Node indices, in input order. */
  members: number[]
  /** Position of each member relative to the cluster's own centre. */
  offsets: Map<number, { x: number; y: number }>
  /** Half-width of the square this cluster occupies. */
  radius: number
}

/**
 * Rings around the busiest node.
 *
 * The root is the highest-degree member, tie broken by input order, so it is the
 * same node on every visit. Ring `d` holds everything BFS reached in `d` hops,
 * spread evenly; the ring is widened when even spacing would put neighbours on
 * top of each other, which is what happens to a node with forty relations.
 */
function layoutCluster(members: number[], adjacency: number[][], degree: number[]): Cluster {
  const root = members.reduce((best, index) => (degree[index] > degree[best] ? index : best), members[0])

  const depth = new Map<number, number>([[root, 0]])
  const byDepth: number[][] = [[root]]
  let frontier = [root]

  while (frontier.length > 0) {
    const next: number[] = []
    for (const index of frontier) {
      // Sorted so the traversal — and therefore every angle below — does not
      // depend on the order the server happened to list edges in.
      for (const neighbour of [...adjacency[index]].sort((a, b) => a - b)) {
        if (depth.has(neighbour)) continue
        depth.set(neighbour, (depth.get(index) ?? 0) + 1)
        next.push(neighbour)
      }
    }
    if (next.length > 0) byDepth.push(next)
    frontier = next
  }

  const offsets = new Map<number, { x: number; y: number }>([[root, { x: 0, y: 0 }]])
  const angles = new Map<number, number>([[root, 0]])
  let radius = 0

  for (let ring = 1; ring < byDepth.length; ring += 1) {
    const count = byDepth[ring].length
    // Wide enough that neighbours on this ring keep MIN_ARC between them.
    const ringRadius = Math.max(RING_GAP * ring, (count * MIN_ARC) / (2 * Math.PI))
    radius = ringRadius

    // Ordering by the parent's angle is the whole crossing-avoidance strategy:
    // children come out in the same rotational order as the parents they hang
    // off, so consecutive spokes do not have to reach across the ring.
    const ordered = [...byDepth[ring]].sort((left, right) => {
      const leftAngle = parentAngle(left, adjacency, depth, angles)
      const rightAngle = parentAngle(right, adjacency, depth, angles)
      if (leftAngle !== rightAngle) return leftAngle - rightAngle
      return left - right
    })

    ordered.forEach((index, position) => {
      const angle = (2 * Math.PI * position) / count
      angles.set(index, angle)
      offsets.set(index, {
        x: Math.cos(angle) * ringRadius,
        y: Math.sin(angle) * ringRadius,
      })
    })
  }

  return { members, offsets, radius: radius + NODE_RADIUS }
}

/** The angle of the shallowest already-placed neighbour, or 0 when there is none. */
function parentAngle(
  index: number,
  adjacency: number[][],
  depth: Map<number, number>,
  angles: Map<number, number>,
): number {
  const own = depth.get(index) ?? 0
  let best: number | null = null
  for (const neighbour of adjacency[index]) {
    if ((depth.get(neighbour) ?? 0) !== own - 1) continue
    const angle = angles.get(neighbour)
    if (angle === undefined) continue
    if (best === null || angle < best) best = angle
  }
  return best ?? 0
}

type Box = { width: number; height: number; place: (x: number, y: number) => void }

/**
 * Shelf packing, largest box first.
 *
 * The row width targets a square-ish drawing so the whole graph fits one screen
 * without one very wide shelf forcing everything else to be tiny.
 */
function pack(boxes: Box[]): void {
  const totalArea = boxes.reduce((sum, box) => sum + box.width * box.height, 0)
  const widest = boxes.reduce((max, box) => Math.max(max, box.width), 0)
  const rowLimit = Math.max(widest, Math.sqrt(totalArea) * 1.35)

  let x = 0
  let y = 0
  let rowHeight = 0

  for (const box of boxes) {
    if (x > 0 && x + box.width > rowLimit) {
      x = 0
      y += rowHeight + COMPONENT_GAP
      rowHeight = 0
    }
    box.place(x, y)
    x += box.width + COMPONENT_GAP
    rowHeight = Math.max(rowHeight, box.height)
  }
}

function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  offset: number,
): { path: string; midX: number; midY: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  // Two distinct nodes cannot land on the same point given the layout above, but
  // a caller can hand this any coordinates, and a zero-length vector would make
  // every number below NaN and erase the edge from the DOM without a word.
  const ux = length === 0 ? 1 : dx / length
  const uy = length === 0 ? 0 : dy / length

  // Control point pushed off the straight line by `offset`, which is what fans
  // parallel edges apart. At offset 0 it sits on the line and the curve is
  // visually straight, so one shape covers both cases.
  const controlX = (from.x + to.x) / 2 - uy * offset
  const controlY = (from.y + to.y) / 2 + ux * offset

  const start = advance(from, controlX, controlY, NODE_RADIUS)
  const end = advance(to, controlX, controlY, NODE_RADIUS + ARROW_CLEARANCE)

  return {
    path: `M ${round(start.x)} ${round(start.y)} Q ${round(controlX)} ${round(controlY)} ${round(end.x)} ${round(end.y)}`,
    // Quadratic Bézier at t = 0.5.
    midX: round(0.25 * start.x + 0.5 * controlX + 0.25 * end.x),
    midY: round(0.25 * start.y + 0.5 * controlY + 0.25 * end.y),
  }
}

/** Steps `distance` from `point` toward the control point, to clear the node mark. */
function advance(
  point: { x: number; y: number },
  towardX: number,
  towardY: number,
  distance: number,
): { x: number; y: number } {
  const dx = towardX - point.x
  const dy = towardY - point.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return { x: point.x, y: point.y - distance }
  return { x: point.x + (dx / length) * distance, y: point.y + (dy / length) * distance }
}

/** A loop above the node, growing outward for each further self edge. */
function selfEdgePath(
  at: { x: number; y: number },
  index: number,
): { path: string; midX: number; midY: number } {
  const loop = SELF_LOOP_RADIUS + index * 9
  const startX = at.x - NODE_RADIUS * 0.55
  const endX = at.x + NODE_RADIUS * 0.55
  const y = at.y - NODE_RADIUS * 0.7
  return {
    path: `M ${round(startX)} ${round(y)} A ${loop} ${loop} 0 1 1 ${round(endX)} ${round(y)}`,
    midX: round(at.x),
    midY: round(y - loop * 1.7),
  }
}

/**
 * The whole drawing.
 *
 * Edges are grouped by *unordered* pair, so `A → B` and `B → A` land in the same
 * group and get fanned apart from each other. Grouping by ordered pair would
 * leave the two lying exactly on top of one another, and the user would see one
 * relation where there are two facing opposite ways.
 */
/**
 * Positions to use instead of the computed ones, as `node id -> point`.
 *
 * This is how dragging works without a second copy of the edge geometry. The
 * deterministic pass still decides where everything belongs; the override only
 * says where a node is *right now*, and every curve, arrowhead and self loop is
 * rebuilt from those points by the same code that drew them at rest. Without it
 * a dragged node would slide out from under its own edges.
 *
 * A node the map does not mention keeps its computed place, so a drag of one
 * node costs one entry.
 */
export type PositionOverride = ReadonlyMap<string, { x: number; y: number }>

export function layoutKnowledgeGraph(
  graph: KnowledgeGraph,
  override?: PositionOverride,
): GraphLayout {
  const indexById = new Map<string, number>()
  graph.nodes.forEach((node, index) => indexById.set(node.id, index))

  const adjacency: number[][] = graph.nodes.map(() => [])
  const degree = graph.nodes.map(() => 0)
  const unionFind = makeUnionFind(graph.nodes.length)

  for (const edge of graph.edges) {
    const from = indexById.get(edge.from)
    const to = indexById.get(edge.to)
    if (from === undefined || to === undefined) continue
    degree[from] += 1
    if (from !== to) {
      degree[to] += 1
      unionFind.union(from, to)
      if (!adjacency[from].includes(to)) adjacency[from].push(to)
      if (!adjacency[to].includes(from)) adjacency[to].push(from)
    }
  }

  const byRoot = new Map<number, number[]>()
  graph.nodes.forEach((_, index) => {
    const root = unionFind.find(index)
    const members = byRoot.get(root)
    if (members === undefined) byRoot.set(root, [index])
    else members.push(index)
  })

  const clusters: Cluster[] = []
  // Singletons — including a node whose only edge points at itself — are packed
  // into a grid instead of getting a shelf each, which they would otherwise
  // stretch the drawing sideways to fill.
  const singletons: number[] = []
  for (const members of byRoot.values()) {
    if (members.length === 1) singletons.push(members[0])
    else clusters.push(layoutCluster(members, adjacency, degree))
  }
  // Largest first so the shelf packer puts the shape people came to look at at
  // the top left, where reading starts.
  clusters.sort((left, right) => right.members.length - left.members.length || left.members[0] - right.members[0])
  singletons.sort((left, right) => left - right)

  const positions = new Map<number, { x: number; y: number }>()
  const boxes: Box[] = clusters.map((cluster) => ({
    width: cluster.radius * 2,
    height: cluster.radius * 2,
    place: (x, y) => {
      for (const member of cluster.members) {
        const offset = cluster.offsets.get(member) ?? { x: 0, y: 0 }
        positions.set(member, { x: x + cluster.radius + offset.x, y: y + cluster.radius + offset.y })
      }
    },
  }))

  if (singletons.length > 0) {
    // One box for all of them. Given a shelf each they would stretch the drawing
    // far wider than the clusters that carry the actual structure.
    const columns = Math.max(1, Math.ceil(Math.sqrt(singletons.length)))
    const rows = Math.ceil(singletons.length / columns)
    boxes.push({
      width: columns * ISOLATED_CELL,
      height: rows * ISOLATED_CELL,
      place: (x, y) => {
        singletons.forEach((member, position) => {
          positions.set(member, {
            x: x + (position % columns) * ISOLATED_CELL + ISOLATED_CELL / 2,
            y: y + Math.floor(position / columns) * ISOLATED_CELL + ISOLATED_CELL / 2,
          })
        })
      },
    })
  }

  pack(boxes)

  // The frame is measured before the override is applied, and never after.
  //
  // Everything below reads `positions`, the view box included, so letting a drag
  // reach it would resize the frame on every pointer move — the whole drawing
  // would slide under the cursor and the node would never catch up to it. The
  // frame belongs to the deterministic picture; the drag only moves things
  // inside it.
  const homeExtent = extentOf([...positions.values()])

  if (override !== undefined) {
    graph.nodes.forEach((node, index) => {
      const at = override.get(node.id)
      if (at !== undefined) positions.set(index, at)
    })
  }

  const componentOf = new Map<number, number>()
  clusters.forEach((cluster, order) => {
    for (const member of cluster.members) componentOf.set(member, order)
  })
  singletons.forEach((member, order) => componentOf.set(member, clusters.length + order))

  const nodes: PlacedNode[] = graph.nodes.map((node, index) => {
    const at = positions.get(index) ?? { x: 0, y: 0 }
    return {
      node,
      x: round(at.x),
      y: round(at.y),
      component: componentOf.get(index) ?? 0,
      degree: degree[index],
    }
  })

  // Group first, place second: an edge's curvature depends on how many other
  // edges share its pair, which is not knowable one edge at a time.
  const groups = new Map<string, number[]>()
  graph.edges.forEach((edge, index) => {
    const key =
      edge.from === edge.to
        ? `self ${edge.from}`
        : `pair ${[edge.from, edge.to].sort().join(' ')}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [index])
    else group.push(index)
  })

  const placedEdges: (PlacedEdge | null)[] = graph.edges.map(() => null)
  for (const group of groups.values()) {
    group.forEach((edgeIndex, position) => {
      const edge = graph.edges[edgeIndex]
      const from = indexById.get(edge.from)
      const to = indexById.get(edge.to)
      if (from === undefined || to === undefined) return

      const start = positions.get(from) ?? { x: 0, y: 0 }
      const selfEdge = from === to
      // Centred fan: one edge stays straight, two split either side, three keep
      // the middle one straight, and so on.
      const offset = (position - (group.length - 1) / 2) * CURVE_STEP
      // The offset is applied along the perpendicular of the drawn direction,
      // which flips when the edge runs the other way. Without pinning it to a
      // canonical direction, `A → B` at −1 and `B → A` at +1 resolve to the
      // *same* curve and the reversed pair disappears under its twin — the exact
      // case this fan exists to prevent.
      const orientation = edge.from > edge.to ? -1 : 1
      const geometry = selfEdge
        ? selfEdgePath(start, position)
        : edgePath(start, positions.get(to) ?? { x: 0, y: 0 }, offset * orientation)

      placedEdges[edgeIndex] = {
        id: `e${edgeIndex}`,
        edge,
        path: geometry.path,
        midX: geometry.midX,
        midY: geometry.midY,
        selfEdge,
      }
    })
  }
  const edges = placedEdges.filter((edge): edge is PlacedEdge => edge !== null)

  return { ...bounds(nodes, edges, homeExtent), nodes, edges, clusterCount: clusters.length, isolatedCount: degree.filter((count) => count === 0).length }
}

/**
 * The view box, padded.
 *
 * Self-edge loops and fanned curves reach outside the node positions, so the
 * padding is widened by the largest excursion rather than being a flat number —
 * otherwise a loop on a node at the top edge is clipped in half.
 */
function bounds(
  nodes: PlacedNode[],
  edges: PlacedEdge[],
  home: Extent | null,
): { viewBox: string; width: number; height: number } {
  if (nodes.length === 0) return { viewBox: '0 0 100 100', width: 100, height: 100 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  // Node extents come from where the deterministic pass put them, so a drag
  // cannot resize the frame. Edge extents below still use the drawn geometry:
  // a curve reaching past its ends must not be clipped, and that excursion is
  // small and bounded, unlike a node the pointer has carried across the canvas.
  if (home !== null) {
    minX = home.minX
    minY = home.minY
    maxX = home.maxX
    maxY = home.maxY
  } else {
    for (const node of nodes) {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x)
      maxY = Math.max(maxY, node.y)
    }
  }
  for (const edge of edges) {
    minX = Math.min(minX, edge.midX)
    minY = Math.min(minY, edge.midY)
    maxX = Math.max(maxX, edge.midX)
    maxY = Math.max(maxY, edge.midY)
  }

  const x = round(minX - PADDING)
  const y = round(minY - PADDING)
  const width = round(Math.max(maxX - minX + PADDING * 2, 1))
  const height = round(Math.max(maxY - minY + PADDING * 2, 1))

  return { viewBox: `${x} ${y} ${width} ${height}`, width, height }
}

/**
 * Every edge touching a node, with the node at the other end resolved.
 *
 * The inspector needs this to list a selected item's relations, and that list is
 * also the keyboard path to selecting an edge — the drawing itself is pointer
 * only and is announced through this list instead.
 */
export type Incidence = {
  placed: PlacedEdge
  direction: 'out' | 'in' | 'self'
  other: KnowledgeNode
}

export function incidentEdges(
  layout: GraphLayout,
  nodeId: string,
  nodesById: Map<string, KnowledgeNode>,
): Incidence[] {
  const incidence: Incidence[] = []
  for (const placed of layout.edges) {
    const { from, to } = placed.edge
    if (from !== nodeId && to !== nodeId) continue
    const otherId = from === nodeId ? to : from
    const other = nodesById.get(otherId)
    if (other === undefined) continue
    incidence.push({
      placed,
      direction: from === to ? 'self' : from === nodeId ? 'out' : 'in',
      other,
    })
  }
  return incidence
}
