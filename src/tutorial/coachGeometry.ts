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

export type TagSide = 'above' | 'below' | 'left' | 'right'

/**
 * 짚는 자리에 바로 붙는 작은 말풍선(꼬리표). 위 · 아래 · 오른쪽 · 왼쪽 순으로, 화면 안에 들고 설명 상자와 겹치지
 * 않는 쪽에 둔다. 모두 막히면 위에 둔다.
 */
export function placeTag(
  ring: Box,
  size: { width: number; height: number },
  viewport: Viewport,
  avoid: Box | null,
): { left: number; top: number; side: TagSide } {
  const gap = 10
  const centerX = clamp(ring.left + ring.width / 2 - size.width / 2, EDGE / 2, viewport.width - size.width - EDGE / 2)
  const centerY = clamp(ring.top + ring.height / 2 - size.height / 2, EDGE / 2, viewport.height - size.height - EDGE / 2)
  const candidates: { left: number; top: number; side: TagSide }[] = [
    { left: centerX, top: ring.top - gap - size.height, side: 'above' },
    { left: centerX, top: ring.top + ring.height + gap, side: 'below' },
    { left: ring.left + ring.width + gap, top: centerY, side: 'right' },
    { left: ring.left - gap - size.width, top: centerY, side: 'left' },
  ]
  const fits = (place: { left: number; top: number }) => {
    const box = { left: place.left, top: place.top, width: size.width, height: size.height }
    const inside = box.left >= EDGE / 2 && box.top >= EDGE / 2
      && box.left + box.width <= viewport.width - EDGE / 2 && box.top + box.height <= viewport.height - EDGE / 2
    return inside && (avoid === null || !overlaps(box, avoid))
  }
  return candidates.find(fits) ?? candidates[0]
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}
