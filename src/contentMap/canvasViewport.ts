/*
 * The geometry behind panning and zooming a `viewBox`-driven canvas.
 *
 * Everything with a decision in it lives here and is pure: parsing the
 * layout's `viewBox`, converting a client point into user space, and the two
 * transforms. `useCanvasViewport` holds the part that cannot be — React state,
 * a pointer capture, and a non-passive wheel listener.
 *
 * ## Why the letterbox cannot be skipped
 *
 * The canvases render with `preserveAspectRatio="xMidYMid meet"`, which fits
 * the whole viewBox inside the element and centres it. That leaves dead space
 * on two sides, so client pixels do not map to user units by
 * `elementWidth / viewBoxWidth`, and the scale is the same on both axes rather
 * than one per axis. Zooming toward the cursor without accounting for it
 * drifts, and the drift grows with how far from square the drawing is — which,
 * for a scene graph laid out in wide layers, is nearly always.
 */

/** One `viewBox`, as numbers. */
export type ViewRect = { x: number; y: number; w: number; h: number }

/** The rendered size of the `svg` element, in client pixels. */
export type ElementBox = { width: number; height: number }

/**
 * How far in and out a reader may go, as a multiple of the framed drawing.
 *
 * The floor is below 1 on purpose. The base rectangle already frames
 * everything, so a floor of exactly 1 would leave "zoom out" present and dead
 * at rest — a control that does nothing is worse than no control. The room to
 * pull back also lets a reader put the drawing in context after walking into
 * a container.
 */
export const MIN_SCALE = 0.4
export const MAX_SCALE = 12

/**
 * A malformed `viewBox` falls back to a unit square rather than throwing.
 *
 * The string comes from our own layout code, so a bad one is a bug — but a bug
 * that blanks the page is worse than one that frames the wrong rectangle,
 * because a blank page hides which of the two happened.
 */
export function parseViewBox(viewBox: string): ViewRect {
  const parts = viewBox.trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return { x: 0, y: 0, w: 100, h: 100 }
  }
  const [x, y, w, h] = parts
  return { x, y, w: w > 0 ? w : 100, h: h > 0 ? h : 100 }
}

export function formatViewBox(rect: ViewRect): string {
  return `${round(rect.x)} ${round(rect.y)} ${round(rect.w)} ${round(rect.h)}`
}

/**
 * User units per client pixel under `xMidYMid meet`.
 *
 * `meet` fits the whole rectangle inside the element, so the ratio is the
 * larger of the two — the axis that runs out of room first sets the scale for
 * both.
 */
export function userPerPixel(rect: ViewRect, box: ElementBox): number {
  if (box.width <= 0 || box.height <= 0) return 1
  return Math.max(rect.w / box.width, rect.h / box.height)
}

/** A point in the element's own pixels, as a point in user space. */
export function clientToUser(
  rect: ViewRect,
  box: ElementBox,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  const unit = userPerPixel(rect, box)
  // The drawing is centred, so half the unused space sits on each side.
  const insetX = (box.width - rect.w / unit) / 2
  const insetY = (box.height - rect.h / unit) / 2
  return { x: rect.x + (offsetX - insetX) * unit, y: rect.y + (offsetY - insetY) * unit }
}

/**
 * Zoom about a fixed point in user space, so whatever sits under the cursor
 * stays under it.
 *
 * The magnification is clamped against `base`, not against the current
 * rectangle, so repeated zooming cannot creep past the limits one notch at a
 * time.
 */
export function zoomAbout(
  base: ViewRect,
  rect: ViewRect,
  factor: number,
  atX: number,
  atY: number,
): ViewRect {
  const wanted = clamp((base.w / rect.w) * factor, MIN_SCALE, MAX_SCALE)
  const w = base.w / wanted
  const h = base.h / wanted
  return {
    x: atX - ((atX - rect.x) * w) / rect.w,
    y: atY - ((atY - rect.y) * h) / rect.h,
    w,
    h,
  }
}

/**
 * Move the rectangle by a pointer travel measured in client pixels.
 *
 * Converting through `userPerPixel` rather than through the zoom level keeps
 * the drawing exactly under the hand at every magnification — the drawing does
 * not lag or race the cursor.
 */
export function panBy(rect: ViewRect, box: ElementBox, dxPixels: number, dyPixels: number): ViewRect {
  const unit = userPerPixel(rect, box)
  return { ...rect, x: rect.x - dxPixels * unit, y: rect.y - dyPixels * unit }
}

export function sameRect(a: ViewRect, b: ViewRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
