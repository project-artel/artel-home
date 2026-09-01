import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  formatViewBox,
  panBy,
  parseViewBox,
  clientToUser,
  sameRect,
  zoomAbout,
  type ViewRect,
} from './canvasViewport'

/**
 * Pan and zoom for a `viewBox`-driven SVG canvas.
 *
 * The layouts in this directory are deterministic and produce a `viewBox` that
 * frames the whole drawing. That is the right default — two builds side by side
 * are then comparable — but it also means a scene holding twenty-nine screens
 * is drawn at whatever scale makes the *other* seven scenes fit, and the labels
 * inside it stop being readable. Panning and zooming lets a reader walk into
 * that container without the layout itself becoming interactive, and so without
 * the drawing losing the property that it looks the same on every visit.
 *
 * The geometry is in `canvasViewport.ts` and pure. What is here is what cannot
 * be: React state, a pointer capture, and a wheel listener registered by hand.
 *
 * ## The base viewBox stays the source of truth
 *
 * State here is a rectangle *derived* from the layout's `viewBox`, never a
 * replacement for it. When the layout changes — a different build, a refresh —
 * the derived rectangle is dropped and the drawing reframes itself. Carrying a
 * reader's pan across a data change would park them over empty space, and an
 * empty canvas reads as a load failure rather than as a stale viewport.
 */

/** One wheel notch. Multiplicative, so zooming feels the same at every depth. */
const WHEEL_STEP = 1.0015

/** One button press. Coarser than a wheel notch — it is one deliberate act. */
const BUTTON_STEP = 1.35

/**
 * How far the pointer may travel and still count as a click, in client pixels.
 *
 * Without it, selecting would need a perfectly still hand: the same gesture
 * both pans the canvas and picks the thing under it. Three pixels is about the
 * tremor of a click on a trackpad.
 */
const CLICK_SLOP = 3

export type CanvasViewport = {
  /** Give this to the `svg` in place of `layout.viewBox`. */
  viewBox: string
  /** Spread onto the `svg`. Carries panning and the click/drag split. */
  bind: {
    ref: (node: SVGSVGElement | null) => void
    onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void
    onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void
    onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void
    onClickCapture: (event: React.MouseEvent<SVGSVGElement>) => void
  }
  /** True while a pan is under way, so the canvas can show a grabbing cursor. */
  panning: boolean
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
  /** False at rest, so the reset control can say it has nothing to undo. */
  moved: boolean
  /** Magnification against the framed drawing, for the readout. */
  scale: number
}

export function useCanvasViewport(baseViewBox: string): CanvasViewport {
  const base = useMemo(() => parseViewBox(baseViewBox), [baseViewBox])

  // The rectangle is stored with the base it was derived from, so a stale one
  // is never read. Comparing on read rather than clearing from an effect means
  // there is no frame in which the drawing is framed by a rectangle belonging
  // to data it no longer shows.
  const [view, setView] = useState<{ base: ViewRect; rect: ViewRect } | null>(null)
  const rect = view !== null && sameRect(view.base, base) ? view.rect : base

  const svg = useRef<SVGSVGElement | null>(null)

  /**
   * The current rectangle, readable from a listener rather than from a closure.
   *
   * The wheel listener is registered once and the pointer handlers are
   * memoised, so both would otherwise close over whatever rectangle was
   * current when they were made. Syncing in an effect rather than during
   * render is what the rules of React require, and it is safe here because
   * every reader runs from a user event — which cannot arrive before the
   * render that caused it has committed.
   */
  const live = useRef(rect)
  useEffect(() => {
    live.current = rect
  }, [rect])

  const [panning, setPanning] = useState(false)
  const pan = useRef<{ id: number; clientX: number; clientY: number } | null>(null)
  /** Set once a drag passes the slop, and read by the click capture below. */
  const dragged = useRef(false)

  const apply = useCallback((next: ViewRect) => setView({ base, rect: next }), [base])

  const zoomAt = useCallback(
    (factor: number, atX: number, atY: number) => {
      apply(zoomAbout(base, live.current, factor, atX, atY))
    },
    [apply, base],
  )

  // Registered by hand because React's `onWheel` is passive: `preventDefault`
  // there is ignored, so every zoom would scroll the page as well.
  useEffect(() => {
    const node = svg.current
    if (node === null) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const box = node.getBoundingClientRect()
      const at = clientToUser(
        live.current,
        box,
        event.clientX - box.left,
        event.clientY - box.top,
      )
      zoomAt(WHEEL_STEP ** -event.deltaY, at.x, at.y)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    // Secondary buttons belong to the browser's own menu.
    if (event.button !== 0) return
    pan.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY }
    dragged.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const start = pan.current
      if (start === null || start.id !== event.pointerId) return
      const dx = event.clientX - start.clientX
      const dy = event.clientY - start.clientY
      if (!dragged.current && Math.hypot(dx, dy) < CLICK_SLOP) return
      dragged.current = true
      setPanning(true)

      const node = svg.current
      if (node === null) return
      apply(panBy(live.current, node.getBoundingClientRect(), dx, dy))
      pan.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY }
    },
    [apply],
  )

  const onPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (pan.current?.id !== event.pointerId) return
    pan.current = null
    setPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  /**
   * A pan that ends over a node must not also select it.
   *
   * The flag is cleared here rather than on pointer up because the click event
   * arrives after it. Clearing early would let every drag end in a selection
   * the reader did not ask for.
   */
  const onClickCapture = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (!dragged.current) return
    dragged.current = false
    event.stopPropagation()
    event.preventDefault()
  }, [])

  const zoomBy = useCallback(
    (factor: number) => {
      const current = live.current
      zoomAt(factor, current.x + current.w / 2, current.y + current.h / 2)
    },
    [zoomAt],
  )

  return {
    viewBox: formatViewBox(rect),
    bind: {
      ref: (node) => {
        svg.current = node
      },
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onClickCapture,
    },
    panning,
    zoomIn: () => zoomBy(BUTTON_STEP),
    zoomOut: () => zoomBy(1 / BUTTON_STEP),
    reset: () => setView(null),
    moved: !sameRect(rect, base),
    scale: base.w / rect.w,
  }
}
