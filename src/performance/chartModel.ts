export function splitMeasuredSegments<T>(points: readonly T[], value: (point: T) => number | null): T[][] {
  const segments: T[][] = []
  let current: T[] = []
  for (const point of points) {
    if (value(point) === null) {
      if (current.length > 0) segments.push(current)
      current = []
    } else current.push(point)
  }
  if (current.length > 0) segments.push(current)
  return segments
}

export function sortByStartedAt<T extends { startedAt: string }>(runs: readonly T[]): T[] {
  return [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

export function splitTrustedSegments<T>(runs: readonly T[], lowConfidence: (run: T) => boolean): T[][] {
  return splitMeasuredSegments(runs, (run) => lowConfidence(run) ? null : 1)
}
