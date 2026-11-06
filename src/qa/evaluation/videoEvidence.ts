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

export type EvidenceClip = ReturnType<typeof clipSegments>[number]

/** 누락 시간은 제외하고 재생 가능한 TC 구간의 길이를 합한다. */
export function clipDuration(clips: readonly EvidenceClip[]) {
  return clips.reduce((sum, clip) => sum + clip.to - clip.from, 0)
}

export function clipElapsed(clips: readonly EvidenceClip[], id: string, mediaTime: number) {
  let elapsed = 0
  for (const clip of clips) {
    if (clip.id === id) return elapsed + Math.max(0, Math.min(clip.to - clip.from, mediaTime - clip.from))
    elapsed += clip.to - clip.from
  }
  return 0
}

export function clipSeek(clips: readonly EvidenceClip[], elapsed: number) {
  let remaining = Math.max(0, Math.min(clipDuration(clips), elapsed))
  for (const [index, clip] of clips.entries()) {
    const length = clip.to - clip.from
    if (remaining < length || index === clips.length - 1) return { id: clip.id, time: clip.from + remaining }
    remaining -= length
  }
  return null
}

export function clipTimeLabel(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
