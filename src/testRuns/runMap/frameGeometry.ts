/**
 * TS 프레임 안팎의 자리(ARTEL-1245). 프레임 안에서는 한 줄에 [STEPS_PER_LINE] 스텝을 놓고, 줄이 바뀌면 화살표가
 * 오른쪽으로 빠져 줄 사이를 지나 다음 줄 왼쪽 밖에서 들어온다. 스텝을 가로지르지 않게 하려는 것이다.
 */
import type { SceneSegment } from './runMapModel'

export const STEPS_PER_LINE = 8
export const STEP_W = 56
export const PAD_X = 22
export const LINE_H = 96
export const DOT_R = 8
export const HEAD_H = 40
export const BODY_TOP = 42
export const FRAME_W = PAD_X * 2 + STEPS_PER_LINE * STEP_W
export const FOLDED_BODY_H = 30
const COLUMN_GAP = 28
const ROW_GAP = 22
const COLUMNS = 3

export function lineCount(stepCount: number): number {
  return Math.max(1, Math.ceil(stepCount / STEPS_PER_LINE))
}

export function frameHeight(stepCount: number, folded: boolean): number {
  return HEAD_H + (folded ? FOLDED_BODY_H : BODY_TOP + (lineCount(stepCount) - 1) * LINE_H + 44)
}

/** 스텝 점의 가운데. 프레임 몸통(머리줄 아래) 좌표다. */
export function stepPoint(index: number): { x: number; y: number } {
  return { x: PAD_X + (index % STEPS_PER_LINE) * STEP_W + STEP_W / 2, y: BODY_TOP + Math.floor(index / STEPS_PER_LINE) * LINE_H }
}

/** [index] - 1 에서 [index] 로 가는 화살표. 같은 줄은 곧게, 줄이 바뀌면 줄 사이로 각지게. */
export function wirePath(index: number): string {
  const from = stepPoint(index - 1)
  const to = stepPoint(index)
  const start = from.x + DOT_R + 2
  const end = to.x - DOT_R - 4
  if (index % STEPS_PER_LINE !== 0) return `M ${start} ${from.y} H ${end}`
  const gutter = from.y + 54
  return `M ${start} ${from.y} H ${FRAME_W - 8} V ${gutter} H 8 V ${to.y} H ${end}`
}

/** 씬 구간의 바탕 칸. 줄을 넘는 구간은 줄마다 한 칸이고, 첫 칸만 이름을 단다. */
export type SegmentBand = { left: number; top: number; width: number; scene: string | null; count: number; first: boolean; shade: boolean }

export function segmentBands(segments: readonly SceneSegment[]): SegmentBand[] {
  const bands: SegmentBand[] = []
  segments.forEach((segment, order) => {
    let at = segment.from
    while (at <= segment.to) {
      const lineEnd = Math.min(segment.to, Math.floor(at / STEPS_PER_LINE) * STEPS_PER_LINE + STEPS_PER_LINE - 1)
      const left = stepPoint(at).x - STEP_W / 2 + 3
      const right = stepPoint(lineEnd).x + STEP_W / 2 - 3
      bands.push({ left, top: stepPoint(at).y - 18, width: right - left, scene: segment.scene, count: segment.to - segment.from + 1, first: at === segment.from, shade: order % 2 === 1 })
      at = lineEnd + 1
    }
  })
  return bands
}

/** 런 순서대로 세 칸에 놓는다. 다음 프레임은 가장 짧은 칸에 간다. */
export function autoLayout(frames: readonly { id: string; height: number }[]): Map<string, { x: number; y: number }> {
  const columns = Array.from({ length: COLUMNS }, () => 20)
  const placed = new Map<string, { x: number; y: number }>()
  for (const frame of frames) {
    const column = columns.indexOf(Math.min(...columns))
    placed.set(frame.id, { x: 20 + column * (FRAME_W + COLUMN_GAP), y: columns[column] })
    columns[column] += frame.height + ROW_GAP
  }
  return placed
}
