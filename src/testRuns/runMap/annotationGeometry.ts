import type { RunMapAnnotation } from './runMapApi'

export type Box = { x: number; y: number; w: number; h: number }
/** 상자 손잡이 여덟(모서리 넷 · 변 넷)과 화살표 손잡이 셋(시작 · 끝 · 휘기). */
export type BoxHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type ArrowHandle = 'p1' | 'p2' | 'c'
export const BOX_HANDLES: BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** 크기를 바꾸지 않은 메모 · 글의 크기. CSS 의 기본 크기와 같다. */
export const NOTE_SIZE = { w: 180, h: 110 }
export const TEXT_SIZE = { w: 160, h: 28 }
const MIN_SIZE = 16

/** 휜 화살표의 한가운데(t = 0.5) 점. 조절점이 없으면 곧은 선의 가운데. */
export function arrowMid(a: Extract<RunMapAnnotation, { type: 'arrow' }>): { x: number; y: number } {
  if (a.cx === undefined || a.cy === undefined) return { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 }
  return { x: 0.25 * a.x1 + 0.5 * a.cx + 0.25 * a.x2, y: 0.25 * a.y1 + 0.5 * a.cy + 0.25 * a.y2 }
}

/** 한가운데 점을 [mid] 로 끌었을 때의 조절점. 곡선이 손잡이를 따라 지나가게 한다. */
export function controlFor(a: Extract<RunMapAnnotation, { type: 'arrow' }>, mid: { x: number; y: number }) {
  return { cx: 2 * mid.x - (a.x1 + a.x2) / 2, cy: 2 * mid.y - (a.y1 + a.y2) / 2 }
}

export function arrowPath(a: Extract<RunMapAnnotation, { type: 'arrow' }>): string {
  if (a.cx === undefined || a.cy === undefined) return `M ${a.x1} ${a.y1} L ${a.x2} ${a.y2}`
  return `M ${a.x1} ${a.y1} Q ${a.cx} ${a.cy} ${a.x2} ${a.y2}`
}

/** 주석이 차지하는 상자(캔버스 좌표). 선택 테두리 · 전체 보기 · 묶음 상자 안에 든 것 찾기에 쓴다. */
export function boxOf(a: RunMapAnnotation): Box {
  switch (a.type) {
    case 'note':
      return { x: a.x, y: a.y, w: a.w ?? NOTE_SIZE.w, h: a.h ?? NOTE_SIZE.h }
    case 'text':
      return { x: a.x, y: a.y, w: a.w ?? TEXT_SIZE.w, h: a.h ?? TEXT_SIZE.h }
    case 'rect':
    case 'ellipse':
    case 'section':
      return { x: a.x, y: a.y, w: a.w, h: a.h }
    case 'arrow': {
      const mid = arrowMid(a)
      return spanOf([[a.x1, a.y1], [a.x2, a.y2], [mid.x, mid.y]])
    }
    case 'pen':
      return spanOf(a.points)
  }
}

function spanOf(points: readonly (readonly [number, number])[]): Box {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** 손잡이 [handle] 을 (px, py) 로 끌었을 때의 새 상자. 반대쪽 변은 그 자리에 둔다. */
export function dragBox(start: Box, handle: BoxHandle, px: number, py: number): Box {
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h
  if (handle.includes('w')) left = Math.min(px, right - MIN_SIZE)
  if (handle.includes('e')) right = Math.max(px, left + MIN_SIZE)
  if (handle.includes('n')) top = Math.min(py, bottom - MIN_SIZE)
  if (handle.includes('s')) bottom = Math.max(py, top + MIN_SIZE)
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** [a] 를 상자 [from] 에서 [to] 로 늘리거나 줄인 것. 그림 · 화살표는 점을 같은 비율로 옮긴다. */
export function resized(a: RunMapAnnotation, from: Box, to: Box): RunMapAnnotation {
  const sx = from.w === 0 ? 1 : to.w / from.w
  const sy = from.h === 0 ? 1 : to.h / from.h
  const mx = (x: number) => to.x + (x - from.x) * sx
  const my = (y: number) => to.y + (y - from.y) * sy
  switch (a.type) {
    case 'note':
    case 'text':
    case 'rect':
    case 'ellipse':
    case 'section':
      return { ...a, x: to.x, y: to.y, w: to.w, h: to.h }
    case 'arrow':
      return {
        ...a,
        x1: mx(a.x1), y1: my(a.y1), x2: mx(a.x2), y2: my(a.y2),
        ...(a.cx !== undefined && a.cy !== undefined ? { cx: mx(a.cx), cy: my(a.cy) } : {}),
      }
    case 'pen':
      return { ...a, points: a.points.map(([x, y]) => [mx(x), my(y)] as [number, number]) }
  }
}

export function moved(a: RunMapAnnotation, dx: number, dy: number): RunMapAnnotation {
  if (a.type === 'arrow') {
    return {
      ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy,
      ...(a.cx !== undefined && a.cy !== undefined ? { cx: a.cx + dx, cy: a.cy + dy } : {}),
    }
  }
  if (a.type === 'pen') return { ...a, points: a.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) }
  return { ...a, x: a.x + dx, y: a.y + dy }
}

/** [inner] 가 [outer] 안에 통째로 들어 있는가. 묶음 상자를 옮길 때 함께 옮길 것을 고른다. */
export function contains(outer: Box, inner: Box): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

/** 안에 글을 쓸 수 있는 주석. */
export function hasText(a: RunMapAnnotation): a is Extract<RunMapAnnotation, { type: 'note' | 'text' | 'rect' | 'ellipse' | 'section' }> {
  return a.type === 'note' || a.type === 'text' || a.type === 'rect' || a.type === 'ellipse' || a.type === 'section'
}
