/**
 * Turning contract values into things a chart can draw, without inventing data.
 *
 * Kept apart from the components so the two rules that matter most — never
 * bridge an unmeasured window, never join a low-confidence run to the trend —
 * are testable without rendering.
 */

/**
 * Splits a series at every unmeasured point so a polyline never spans a gap.
 *
 * Dropping the null points instead would let the line run straight from the
 * last measured value to the next one, which is the specific way this screen
 * could lie about a stall that was never recorded.
 */
export function splitMeasuredSegments<T>(
  points: readonly T[],
  value: (point: T) => number | null,
): T[][] {
  const segments: T[][] = []
  let current: T[] = []

  for (const point of points) {
    if (value(point) === null) {
      if (current.length > 0) segments.push(current)
      current = []
      continue
    }

    current.push(point)
  }

  if (current.length > 0) segments.push(current)

  return segments
}

/** An inclusive index range of consecutive unmeasured points. */
export type GapRange = { from: number; to: number }

/**
 * The unmeasured windows, as index ranges, so a chart can shade the hole the
 * broken line leaves rather than making the reader notice its absence.
 */
export function findGapRanges<T>(
  points: readonly T[],
  value: (point: T) => number | null,
): GapRange[] {
  const gaps: GapRange[] = []

  points.forEach((point, index) => {
    if (value(point) !== null) return

    const previous = gaps.at(-1)
    if (previous !== undefined && previous.to === index - 1) {
      previous.to = index
      return
    }

    gaps.push({ from: index, to: index })
  })

  return gaps
}

/**
 * Build runs in time order.
 *
 * The contract already sends them ascending; sorting a copy keeps the screen
 * correct if that ever slips without mutating the parsed response.
 */
export function sortByStartedAt<T extends { startedAt: string }>(runs: readonly T[]): T[] {
  return [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/**
 * Splits the trend line wherever a low-confidence run sits.
 *
 * The run keeps its point and its row — it is real data. What it does not get
 * is a line segment implying it is comparable with the runs around it.
 */
export function splitTrustedSegments<T>(
  runs: readonly T[],
  lowConfidence: (run: T) => boolean,
): T[][] {
  return splitMeasuredSegments(runs, (run) => (lowConfidence(run) ? null : 1))
}
