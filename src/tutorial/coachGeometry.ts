/**
 * 시작 튜토리얼 안내의 자리 계산(ARTEL-1461). 화면 위 픽셀 단위다.
 */

export type Box = { left: number; top: number; width: number; height: number }
export type Viewport = { width: number; height: number }

export const RING_PAD = 6
const TAG_GAP = 10
const EDGE = 8

/** 고리는 대상보다 조금 넓게 두르고 화면 밖으로 나가지 않게 한다. */
export function ringOf(target: Box, viewport: Viewport): Box {
  const left = Math.max(EDGE / 2, target.left - RING_PAD)
  const top = Math.max(EDGE / 2, target.top - RING_PAD)
  const right = Math.min(viewport.width - EDGE / 2, target.left + target.width + RING_PAD)
  const bottom = Math.min(viewport.height - EDGE / 2, target.top + target.height + RING_PAD)
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/**
 * 안내 줄을 위에 붙일지 아래에 붙일지. 짚는 자리를 가리지 않는 쪽을 고른다 — 아래에 두면 가리는 경우만 위로 올리고,
 * 둘 다 가리면(화면만큼 큰 자리) 덜 가리는 쪽이다.
 */
export function dockFor(target: Box | null, viewport: Viewport, hudHeight: number): 'top' | 'bottom' {
  if (target === null) return 'bottom'
  const bottomEdge = viewport.height - hudHeight - EDGE
  if (target.top + target.height <= bottomEdge) return 'bottom'
  if (target.top >= hudHeight + EDGE) return 'top'
  const hiddenIfBottom = target.top + target.height - bottomEdge
  const hiddenIfTop = hudHeight + EDGE - target.top
  return hiddenIfTop < hiddenIfBottom ? 'top' : 'bottom'
}

/**
 * 꼬리표는 고리 위에 두고, 위가 모자라면 아래, 그것도 모자라면 오른쪽 · 왼쪽 순으로 옮긴다. 안내 줄이 차지한 자리와
 * 화면 밖으로는 나가지 않는다.
 */
export function placeTag(
  ring: Box,
  tag: { width: number; height: number },
  viewport: Viewport,
  hud: { dock: 'top' | 'bottom'; height: number },
): { left: number; top: number } {
  const minTop = hud.dock === 'top' ? hud.height + EDGE : EDGE
  const maxBottom = hud.dock === 'bottom' ? viewport.height - hud.height - EDGE : viewport.height - EDGE
  const centered = clamp(ring.left + ring.width / 2 - tag.width / 2, EDGE, viewport.width - tag.width - EDGE)
  if (ring.top - TAG_GAP - tag.height >= minTop) return { left: centered, top: ring.top - TAG_GAP - tag.height }
  if (ring.top + ring.height + TAG_GAP + tag.height <= maxBottom) return { left: centered, top: ring.top + ring.height + TAG_GAP }
  const middle = clamp(ring.top + ring.height / 2 - tag.height / 2, minTop, maxBottom - tag.height)
  if (ring.left + ring.width + TAG_GAP + tag.width <= viewport.width - EDGE) return { left: ring.left + ring.width + TAG_GAP, top: middle }
  return { left: Math.max(EDGE, ring.left - TAG_GAP - tag.width), top: middle }
}

/** 고리 밖을 덮는 네 장. 그 사이(고리 안)는 비워 실제 화면을 누를 수 있게 둔다. */
export function veilPieces(ring: Box, viewport: Viewport): Box[] {
  const right = ring.left + ring.width
  const bottom = ring.top + ring.height
  return [
    { left: 0, top: 0, width: viewport.width, height: ring.top },
    { left: 0, top: bottom, width: viewport.width, height: Math.max(0, viewport.height - bottom) },
    { left: 0, top: ring.top, width: ring.left, height: ring.height },
    { left: right, top: ring.top, width: Math.max(0, viewport.width - right), height: ring.height },
  ]
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}
