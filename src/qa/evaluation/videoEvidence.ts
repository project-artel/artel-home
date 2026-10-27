import type { Attempt, Gap, Playback, Segment } from './evaluationApi'

const retentionMilliseconds = 30 * 24 * 60 * 60 * 1000

export function clipGaps(attempt: Attempt, gaps: Gap[]) {
  const start = Date.parse(attempt.startedAt ?? attempt.finishedAt ?? attempt.createdAt) - 10000
  const end = attempt.finishedAt ? Date.parse(attempt.finishedAt) + 5000 : Infinity
  return gaps.filter(gap => Date.parse(gap.endedAt) > start && Date.parse(gap.startedAt) < end)
    .map(gap => ({ ...gap, startedAt: new Date(Math.max(start, Date.parse(gap.startedAt))).toISOString(),
      endedAt: new Date(Math.min(end, Date.parse(gap.endedAt))).toISOString() }))
}

export function evidenceExpired(attempt: Attempt, playback: Playback, now: number) {
  if (playback.recording?.expiresAt && Date.parse(playback.recording.expiresAt) <= now) return true
  const start = Date.parse(attempt.startedAt ?? attempt.finishedAt ?? attempt.createdAt) - 10000
  const end = attempt.finishedAt ? Date.parse(attempt.finishedAt) + 5000 : Infinity
  const relevant = playback.segments.filter(segment => Date.parse(segment.endedAt) > start && Date.parse(segment.startedAt) < end)
  return relevant.length > 0 && relevant.every(segment => segment.state === 'EXPIRED' || Date.parse(segment.endedAt) + retentionMilliseconds <= now)
}

export function clipSegments(attempt: Attempt, segments: Segment[]) {
  const start = Date.parse(attempt.startedAt ?? attempt.finishedAt ?? attempt.createdAt) - 10000
  const end = attempt.finishedAt ? Date.parse(attempt.finishedAt) + 5000 : Infinity
  return segments.filter(segment => segment.state === 'READY' && segment.url && Date.parse(segment.endedAt) > start && Date.parse(segment.startedAt) < end)
    .map(segment => ({ ...segment, from: Math.max(0, (start - Date.parse(segment.startedAt)) / 1000), to: Math.min((end - Date.parse(segment.startedAt)) / 1000, (Date.parse(segment.endedAt) - Date.parse(segment.startedAt)) / 1000) }))
}
