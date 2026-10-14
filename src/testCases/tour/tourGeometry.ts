/*
 * 튜토리얼(ARTEL-1033)의 자리 계산. 렌더와 떨어진 순수 함수라 브라우저 없이 테스트한다.
 */

export type Rect = { left: number; top: number; width: number; height: number }
export type Size = { width: number; height: number }
export type Side = 'right' | 'left' | 'bottom' | 'top' | 'center'

/** 강조 박스가 대상보다 이만큼 넓다. 테두리가 대상의 글자에 붙지 않게 한다. */
export const HOLE_PADDING = 6
/** 말풍선과 강조 박스 사이. 화살표가 이 안에 선다. */
const GAP = 14
/** 화면 가장자리에서 말풍선이 떨어질 거리. */
const EDGE = 12

/** 대상 박스를 [HOLE_PADDING] 만큼 넓히고 화면 안으로 자른다. */
export function holeOf(target: Rect, viewport: Size): Rect {
  const left = Math.max(0, target.left - HOLE_PADDING)
  const top = Math.max(0, target.top - HOLE_PADDING)
  const right = Math.min(viewport.width, target.left + target.width + HOLE_PADDING)
  const bottom = Math.min(viewport.height, target.top + target.height + HOLE_PADDING)
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/**
 * 흐린 막에 대상 자리만 뚫는 `clip-path`. 바깥 사각형과 안쪽 사각형을 evenodd 로 겹쳐 안쪽을 비운다. 뚫린 자리는
 * 누르기도 그대로 지나가므로 대상을 직접 눌러 볼 수 있다.
 */
export function holeClipPath(hole: Rect | null): string {
  if (hole === null) return 'none'
  const x1 = `${hole.left}px`
  const y1 = `${hole.top}px`
  const x2 = `${hole.left + hole.width}px`
  const y2 = `${hole.top + hole.height}px`
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x1} ${y1}, ${x2} ${y1}, ${x2} ${y2}, ${x1} ${y2}, ${x1} ${y1})`
}

/**
 * 말풍선 자리. 대상의 오른쪽 → 왼쪽 → 아래 → 위 순으로 들어가는 쪽에 두고, 어디에도 안 들어가면 대상 위에 겹쳐
 * 화면 안에 둔다. 대상이 없으면 화면 가운데다. [arrow] 는 말풍선 안에서 화살표가 설 자리(px)다.
 */
export function placeBubble(
  hole: Rect | null,
  bubble: Size,
  viewport: Size,
): { left: number; top: number; side: Side; arrow: number } {
  if (hole === null) {
    return {
      left: Math.max(EDGE, (viewport.width - bubble.width) / 2),
      top: Math.max(EDGE, (viewport.height - bubble.height) / 2),
      side: 'center',
      arrow: 0,
    }
  }
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), viewport.width - bubble.width - EDGE)
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), viewport.height - bubble.height - EDGE)
  const midX = hole.left + hole.width / 2
  const midY = hole.top + hole.height / 2
  const fits = {
    right: hole.left + hole.width + GAP + bubble.width + EDGE <= viewport.width,
    left: hole.left - GAP - bubble.width - EDGE >= 0,
    bottom: hole.top + hole.height + GAP + bubble.height + EDGE <= viewport.height,
    top: hole.top - GAP - bubble.height - EDGE >= 0,
  }
  const beside = () => {
    const side: Side = fits.right ? 'right' : 'left'
    const top = clampY(midY - bubble.height / 2)
    const left = side === 'right' ? hole.left + hole.width + GAP : hole.left - GAP - bubble.width
    return { left, top, side, arrow: clampArrow(midY - top, bubble.height) }
  }
  const aboveOrBelow = () => {
    const side: Side = fits.bottom ? 'bottom' : 'top'
    const left = clampX(midX - bubble.width / 2)
    const top = side === 'bottom' ? hole.top + hole.height + GAP : hole.top - GAP - bubble.height
    return { left, top, side, arrow: clampArrow(midX - left, bubble.width) }
  }
  // 가로로 넓은 대상(검색 칸 · 표)은 위아래가 먼저다. 옆에 두면 말풍선이 대상과 먼 곳(다른 창 위)에 선다.
  const wide = hole.width > viewport.width / 2
  if (wide && (fits.bottom || fits.top)) return aboveOrBelow()
  if (fits.right || fits.left) return beside()
  if (fits.bottom || fits.top) return aboveOrBelow()
  // 대상이 화면만큼 크면(예: 표 전체) 대상 안쪽 아래에 겹친다.
  return { left: clampX(midX - bubble.width / 2), top: clampY(hole.top + hole.height - bubble.height - GAP), side: 'center', arrow: 0 }
}

/** 화살표가 말풍선 모서리의 둥근 곳에 걸리지 않게 안쪽으로 당긴다. */
function clampArrow(offset: number, length: number): number {
  return Math.min(Math.max(18, offset), length - 18)
}
