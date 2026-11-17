/**
 * 시작 튜토리얼 안내의 자리 계산(ARTEL-1461). 화면 위 픽셀 단위다.
 */

export type Box = { left: number; top: number; width: number; height: number }
export type Viewport = { width: number; height: number }
export type Side = 'right' | 'left' | 'below' | 'above' | 'none'

export const RING_PAD = 6
const GAP = 14
const EDGE = 12
/** 말풍선 화살표가 말풍선 모서리에 너무 붙지 않게 둔다. */
const ARROW_INSET = 18

/** 고리는 대상보다 조금 넓게 두르고 화면 밖으로 나가지 않게 한다. */
export function ringOf(target: Box, viewport: Viewport): Box {
  const left = Math.max(EDGE / 3, target.left - RING_PAD)
  const top = Math.max(EDGE / 3, target.top - RING_PAD)
  const right = Math.min(viewport.width - EDGE / 3, target.left + target.width + RING_PAD)
  const bottom = Math.min(viewport.height - EDGE / 3, target.top + target.height + RING_PAD)
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/**
 * 설명 말풍선을 짚는 자리 바로 옆에 둔다. 오른쪽 · 왼쪽 · 아래 · 위 순으로 자리가 남는 쪽을 고르고, 짚는 자리와는
 * 겹치지 않는다. 화살표는 짚는 자리의 가운데를 가리킨다.
 *
 * 네 쪽 모두 모자라면(화면만큼 큰 자리) 화면 오른쪽 아래에 둔다. 그런 자리는 읽기만 하는 자리라 조금 가려도 누를 것이
 * 가려지지 않는다.
 */
export function placeCallout(
  ring: Box,
  size: { width: number; height: number },
  viewport: Viewport,
): { left: number; top: number; side: Side; arrow: number } {
  const centerX = ring.left + ring.width / 2
  const centerY = ring.top + ring.height / 2
  const besideTop = clamp(centerY - size.height / 2, EDGE, viewport.height - size.height - EDGE)
  const stackedLeft = clamp(centerX - size.width / 2, EDGE, viewport.width - size.width - EDGE)
  const arrowY = clamp(centerY - besideTop, ARROW_INSET, size.height - ARROW_INSET)
  const arrowX = clamp(centerX - stackedLeft, ARROW_INSET, size.width - ARROW_INSET)

  const right = ring.left + ring.width + GAP
  if (right + size.width <= viewport.width - EDGE) return { left: right, top: besideTop, side: 'right', arrow: arrowY }
  const left = ring.left - GAP - size.width
  if (left >= EDGE) return { left, top: besideTop, side: 'left', arrow: arrowY }
  const below = ring.top + ring.height + GAP
  if (below + size.height <= viewport.height - EDGE) return { left: stackedLeft, top: below, side: 'below', arrow: arrowX }
  const above = ring.top - GAP - size.height
  if (above >= EDGE) return { left: stackedLeft, top: above, side: 'above', arrow: arrowX }
  return { left: viewport.width - size.width - EDGE, top: viewport.height - size.height - EDGE, side: 'none', arrow: 0 }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}
