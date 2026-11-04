import type { Attempt, Playback, Segment } from './evaluation/evaluationApi'
import type { QaLog, QaTry } from './qaTypes'

export function replayBounds(qaTry: QaTry, playback: Playback) {
  const start = Date.parse(qaTry.startedAt ?? playback.recording?.startedAt ?? '')
  const end = Date.parse(qaTry.completedAt ?? playback.recording?.endedAt ?? '')
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null
}

export function segmentAt(segments: Segment[], timestamp: number) {
  return segments.find(segment => segment.state === 'READY' && segment.url !== null &&
    Date.parse(segment.startedAt) <= timestamp && timestamp < Date.parse(segment.endedAt)) ?? null
}

export function attemptRange(attempt: Attempt, bounds: { start: number; end: number }) {
  if (attempt.startedAt === null) return null
  const start = Math.max(bounds.start, Date.parse(attempt.startedAt))
  const end = Math.min(bounds.end, Date.parse(attempt.finishedAt ?? new Date(bounds.end).toISOString()))
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null
}

export function logAt(logs: QaLog[], timestamp: number) {
  let nearest: QaLog | null = null
  for (const log of logs) {
    const time = Date.parse(log.createdAt)
    if (time <= timestamp && (nearest === null || time >= Date.parse(nearest.createdAt))) nearest = log
  }
  return nearest
}
