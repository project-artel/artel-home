import { NODE_RADIUS, type PlacedEdge, type PlacedNode } from './knowledgeLayout'

/*
 * Letting a reader push the drawing around.
 *
 * The layout this relaxes is deterministic on purpose (see `knowledgeLayout`),
 * and that is worth keeping: the same knowledge base draws the same picture
 * every visit, so what a person learns about its shape survives a reload. A
 * simulation that ran from a random start on every mount would throw that away
 * for nothing.
 *
 * So the relaxation is not the layout — it is what happens *to* the layout while
 * someone is dragging it. Three consequences follow, and each of them is a rule
 * below:
 *
 *   - The deterministic pass is the **seed**, not the answer. Starting from it
 *     rather than from random points is what keeps the drawing from rearranging
 *     itself into something unrecognisable on every visit.
 *   - Where things end up is decided by the forces: relations pull, everything
 *     repels, and a weak pull to the middle keeps unrelated components on the
 *     canvas. A node the reader drops stays where they dropped it — moving
 *     something is meant to change the shape, not to be undone.
 *   - The energy decays and the loop stops. A graph that keeps ticking forever
 *     is a graph that keeps burning a core while nobody is looking at it.
 *
 * Pure functions and an explicit state object: no React, no clock, no rAF, so
 * the forces can be asserted directly.
 */

/** Below this the drawing is at rest and the caller should stop stepping it. */
export const REST_ALPHA = 0.02

/** What one interaction injects. 1 is "fully awake". */
export const WAKE_ALPHA = 0.9

/** Fraction of the remaining energy carried into the next tick. */
const ALPHA_DECAY = 0.94

/** Fraction of velocity kept between ticks. Below 1 or nothing ever settles. */
const FRICTION = 0.78

/** How hard an edge pulls its two ends toward the distance the layout gave them. */
const LINK_STRENGTH = 0.06

/**
 * How hard everything drifts toward the middle of the drawing.
 *
 * This replaces a pull back to the layout's own placement. That pull made a
 * released node slide back to where it started, which is not what a graph like
 * this should feel like — a reader who moves something expects it to stay moved,
 * and to have changed the shape by moving it. What is still needed is something
 * to stop a component with no relation to the rest from wandering off the
 * canvas, and a weak centring force is that and nothing more.
 */
const CENTRE_STRENGTH = 0.0035

/** How hard two nodes push apart once they are closer than [MIN_SEPARATION]. */
const REPEL_STRENGTH = 0.5

/** Centre-to-centre distance two node marks must keep. */
const MIN_SEPARATION = NODE_RADIUS * 3.4

export type Body = {
  /** Where it is now. */
  x: number
  y: number
  vx: number
  vy: number
  /** Where the deterministic layout put it, and where it drifts back to. */
  homeX: number
  homeY: number
}

export type Simulation = {
  bodies: Map<string, Body>
  /** Fixed point the weak centring force pulls toward. */
  centre: { centreX: number; centreY: number }
  /** Rest lengths, taken from the layout so the relaxed picture keeps its scale. */
  links: { from: string; to: string; rest: number }[]
  alpha: number
}

export function createSimulation(
  nodes: readonly PlacedNode[],
  edges: readonly PlacedEdge[],
): Simulation {
  const bodies = new Map<string, Body>()
  for (const placed of nodes) {
    bodies.set(placed.node.id, {
      x: placed.x,
      y: placed.y,
      vx: 0,
      vy: 0,
      homeX: placed.x,
      homeY: placed.y,
    })
  }

  const links: Simulation['links'] = []
  for (const placed of edges) {
    const from = bodies.get(placed.edge.from)
    const to = bodies.get(placed.edge.to)
    // A self edge has no length to preserve and would divide by zero below.
    if (from === undefined || to === undefined || placed.edge.from === placed.edge.to) continue
    links.push({
      from: placed.edge.from,
      to: placed.edge.to,
      rest: Math.hypot(from.homeX - to.homeX, from.homeY - to.homeY),
    })
  }

  let sumX = 0
  let sumY = 0
  for (const body of bodies.values()) {
    sumX += body.homeX
    sumY += body.homeY
  }
  const count = Math.max(bodies.size, 1)

  return {
    bodies,
    links,
    centre: { centreX: sumX / count, centreY: sumY / count },
    alpha: 0,
  }
}

/**
 * Advance one tick.
 *
 * @param pinned the node the pointer is holding. It is moved, never pushed —
 *   forces would fight the pointer and the node would lag behind the cursor.
 * @returns whether the caller should keep stepping.
 */
export function step(simulation: Simulation, pinned: string | null): boolean {
  if (simulation.alpha < REST_ALPHA) return false

  const { bodies, links, alpha } = simulation

  for (const link of links) {
    const from = bodies.get(link.from)
    const to = bodies.get(link.to)
    if (from === undefined || to === undefined) continue

    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.hypot(dx, dy) || 0.001
    const pull = ((distance - link.rest) / distance) * LINK_STRENGTH * alpha
    const shiftX = dx * pull
    const shiftY = dy * pull

    // Each end takes half, so a link neither drags the whole graph one way nor
    // doubles its own force by acting twice.
    from.vx += shiftX / 2
    from.vy += shiftY / 2
    to.vx -= shiftX / 2
    to.vy -= shiftY / 2
  }

  // Pairwise, which is O(n²). The response caps at a few hundred nodes and this
  // only runs while someone is dragging, so a quadtree would be machinery for a
  // cost nobody pays. If the cap ever rises, this is the line that breaks first.
  const all = [...bodies.values()]
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i]
      const b = all[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.hypot(dx, dy)
      if (distance >= MIN_SEPARATION) continue

      // Two nodes exactly on top of each other have no direction to separate
      // along. Nudging on x is arbitrary but deterministic, which beats random.
      const nx = distance === 0 ? 1 : dx / distance
      const ny = distance === 0 ? 0 : dy / distance
      const push = (MIN_SEPARATION - distance) * REPEL_STRENGTH * alpha
      a.vx -= nx * push
      a.vy -= ny * push
      b.vx += nx * push
      b.vy += ny * push
    }
  }

  // The centre the drawing gathers around: where the seed placed everything,
  // averaged. Taken from the homes rather than the live positions so dragging a
  // node does not drag the centre along behind it.
  const { centreX, centreY } = simulation.centre

  for (const [id, body] of bodies) {
    if (id === pinned) {
      // Held by the pointer: no drift, and no stored momentum to fling it when
      // the pointer lets go.
      body.vx = 0
      body.vy = 0
      continue
    }

    body.vx += (centreX - body.x) * CENTRE_STRENGTH * alpha
    body.vy += (centreY - body.y) * CENTRE_STRENGTH * alpha

    body.vx *= FRICTION
    body.vy *= FRICTION
    body.x += body.vx
    body.y += body.vy
  }

  simulation.alpha *= ALPHA_DECAY
  return simulation.alpha >= REST_ALPHA
}

/** Wake the drawing. Called on every pointer move so a drag never runs dry. */
export function wake(simulation: Simulation): void {
  simulation.alpha = WAKE_ALPHA
}

/** Put the pointer's node exactly where the pointer is. */
export function hold(simulation: Simulation, id: string, x: number, y: number): void {
  const body = simulation.bodies.get(id)
  if (body === undefined) return
  body.x = x
  body.y = y
  body.vx = 0
  body.vy = 0
}

/** Positions to draw, as `id -> {x, y}`. */
export function positions(simulation: Simulation): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  for (const [id, body] of simulation.bodies) out.set(id, { x: body.x, y: body.y })
  return out
}
