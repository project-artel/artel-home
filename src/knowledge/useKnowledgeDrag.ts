import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { layoutKnowledgeGraph, type GraphLayout } from './knowledgeLayout'
import {
  createSimulation,
  hold,
  positions,
  step,
  wake,
  type Simulation,
} from './knowledgeSimulation'
import type { KnowledgeGraph } from './knowledgeTypes'

/*
 * The drag, wired to the clock.
 *
 * Everything with a decision in it is elsewhere and pure — the deterministic
 * layout, the forces, the label placement. This is the part that cannot be:
 * holding a mutable simulation across renders, running a frame loop, and
 * stopping it. It is deliberately small for that reason.
 *
 * The loop only exists while there is energy to spend. No drag, no
 * `requestAnimationFrame` — the page at rest costs nothing, which is the whole
 * argument for relaxing a deterministic layout instead of simulating one.
 */

export type DragHandlers = {
  /** The node under the pointer, or null. Drawn held so the cursor has a target. */
  dragging: string | null
  onDragStart: (nodeId: string, x: number, y: number) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
}

export function useKnowledgeDrag(graph: KnowledgeGraph): {
  layout: GraphLayout
  drag: DragHandlers
} {
  // The seed. Deterministic, so the forces always start from the same place and
  // the drawing does not reshuffle itself on every visit — but it is a starting
  // point, not where things end up.
  const home = useMemo(() => layoutKnowledgeGraph(graph), [graph])

  const simulation = useRef<Simulation | null>(null)
  const frame = useRef<number | null>(null)
  const dragged = useRef<string | null>(null)
  /** The layout the live bodies were seeded from, so a stale one is detectable. */
  const builtFor = useRef<GraphLayout | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  // The override is stored with the layout it was computed against.
  //
  // A new graph moves every home and may drop the node under the pointer, so the
  // old positions become meaningless. Comparing here rather than clearing them
  // from an effect means the stale value is simply never read — no extra render,
  // and no window in which the drawing is laid out from coordinates that belong
  // to a graph it no longer shows.
  const [moved, setMoved] = useState<{
    home: GraphLayout
    at: Map<string, { x: number; y: number }>
  } | null>(null)
  const override = moved !== null && moved.home === home ? moved.at : null

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])

  useEffect(() => stop, [stop])


  /**
   * Run until the drawing is at rest, or until the pointer lets go of it.
   *
   * The loop function is local so it can schedule itself; a `useCallback` that
   * named itself would be reading its own binding before it exists.
   */
  const start = useCallback(
    (current: Simulation) => {
      if (frame.current !== null) return

      const run = () => {
        const running = step(current, dragged.current)
        setMoved({ home, at: positions(current) })

        if (running || dragged.current !== null) {
          frame.current = requestAnimationFrame(run)
          return
        }

        // Settled. The positions are kept — where the forces left things *is*
        // the picture now. Dropping them here would snap the drawing back to the
        // seed and undo the reader's drag, which is the one thing a graph you can
        // push around must not do.
        frame.current = null
      }

      frame.current = requestAnimationFrame(run)
    },
    [home],
  )

  // Relax once when the graph arrives, so what a reader first sees is already
  // the shape the forces agree on rather than the seed. Nothing is running
  // afterwards: the energy decays, the loop ends, and the page goes quiet.
  useEffect(() => {
    const current = createSimulation(home.nodes, home.edges)
    simulation.current = current
    builtFor.current = home
    wake(current)
    start(current)
  }, [home, start])

  const onDragStart = useCallback(
    (nodeId: string, x: number, y: number) => {
      // The relaxation effect owns the simulation and rebuilds it whenever the
      // graph changes, so by the time a pointer lands there is always one and it
      // always belongs to the graph on screen.
      const current = simulation.current
      if (current === null) return
      dragged.current = nodeId
      setDragging(nodeId)
      hold(current, nodeId, x, y)
      wake(current)
      start(current)
    },
    [start],
  )

  const onDragMove = useCallback(
    (x: number, y: number) => {
      const current = simulation.current
      const id = dragged.current
      if (current === null || id === null) return
      hold(current, id, x, y)
      // Re-waking on every move is what keeps a slow drag from running out of
      // energy mid-gesture and leaving the neighbours frozen.
      wake(current)
      start(current)
    },
    [start],
  )

  const onDragEnd = useCallback(() => {
    dragged.current = null
    setDragging(null)
    const current = simulation.current
    if (current !== null) {
      // Let go with energy left, so the graph eases back rather than snapping.
      wake(current)
      start(current)
    }
  }, [start])

  // Recomputing the layout each frame rebuilds every curve from the live points,
  // which is what keeps edges attached to a node the pointer is carrying. It is
  // more work than moving two coordinates, and it is affordable because the
  // response caps the node count and this only runs while the drawing is moving.
  const layout = useMemo(
    () => (override === null ? home : layoutKnowledgeGraph(graph, override)),
    [graph, home, override],
  )

  return { layout, drag: { dragging, onDragStart, onDragMove, onDragEnd } }
}
