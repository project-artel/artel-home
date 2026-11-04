import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useTestCaseLabel } from '../testCases/testCaseIdentifiers'
import * as api from './evaluation/evaluationApi'
import { evaluationCopy } from './evaluation/evaluationCopy'
import { clipTimeLabel } from './evaluation/videoEvidence'
import { attemptRange, replayBounds, segmentAt } from './qaReplayModel'
import type { QaTry } from './qaTypes'
import './qaReplay.css'

type ReplayData = { playback: api.Playback; attempts: api.Attempt[]; loadedAt: number }

async function loadReplay(projectId: string, tryId: string, signal: AbortSignal): Promise<ReplayData> {
  const [playback, first] = await Promise.all([api.playback(projectId, tryId, signal), api.attempts(projectId, { qaTryId: tryId }, signal)])
  const attempts = [...first]
  let page = first
  while (page.length === 100) {
    const last = page[page.length - 1]
    page = await api.attempts(projectId, { qaTryId: tryId, before: last.createdAt, beforeId: last.id }, signal)
    const unseen = page.filter(attempt => !attempts.some(existing => existing.id === attempt.id))
    attempts.push(...unseen)
    if (unseen.length === 0) break
  }
  return { playback, attempts, loadedAt: Date.now() }
}

export function QaReplay({ projectId, qaTry, onPosition }: {
  projectId: string; qaTry: QaTry; onPosition: (timestamp: number, seek: boolean) => void
}) {
  const { t, locale } = useI18n()
  const copy = t.qa.replay
  const evidence = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const caseLabel = useTestCaseLabel()
  const [data, setData] = useState<ReplayData | null>(null)
  const [failed, setFailed] = useState(false)
  const [mediaFailed, setMediaFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [timestamp, setTimestamp] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const resumeRef = useRef(false)
  const seekRef = useRef<number | null>(null)
  const positionRef = useRef(onPosition)
  useEffect(() => { positionRef.current = onPosition }, [onPosition])

  useEffect(() => {
    const controller = new AbortController()
    void loadReplay(projectId, qaTry.id, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setFailed(false) }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [projectId, qaTry.id, reload])

  const bounds = data ? replayBounds(qaTry, data.playback) : null
  const currentTime = timestamp ?? bounds?.start ?? 0
  const segment = data ? selectedSegmentId === null ? segmentAt(data.playback.segments, currentTime) : data.playback.segments.find(candidate => candidate.id === selectedSegmentId) ?? null : null
  const segmentId = segment?.id
  useEffect(() => {
    const video = videoRef.current
    return () => { video?.pause() }
  }, [segmentId])
  const boundsStart = bounds?.start ?? null
  useEffect(() => {
    if (boundsStart !== null && timestamp === null) positionRef.current(boundsStart, true)
  }, [boundsStart, timestamp])
  useEffect(() => {
    if (!data || Date.now() - Date.parse(qaTry.completedAt ?? '') > 120_000) return
    if (data.playback.recording?.endedAt && data.playback.segments.every(segment => segment.state === 'READY' || segment.state === 'EXPIRED')) return
    const timer = window.setTimeout(() => setReload(value => value + 1), 5000)
    return () => window.clearTimeout(timer)
  }, [data, qaTry.completedAt])

  function seek(next: number, resume = false, userSeek = true) {
    if (!bounds || !data) return
    const value = Math.max(bounds.start, Math.min(bounds.end, next))
    const mediaPosition = value === bounds.end ? value - 1 : value
    const target = segmentAt(data.playback.segments, mediaPosition)
    resumeRef.current = resume
    seekRef.current = mediaPosition
    setMediaFailed(false)
    setTimestamp(value)
    setSelectedSegmentId(target?.id ?? '')
    setPlaying(resume && target !== null)
    positionRef.current(value, userSeek)
    const video = videoRef.current
    if (video && target && target.id === segment?.id && video.readyState > 0) {
      video.currentTime = (mediaPosition - Date.parse(target.startedAt)) / 1000
      if (resume) void video.play().catch(() => setPlaying(false))
      else video.pause()
    }
  }

  const refresh = () => {
    resumeRef.current = false
    seekRef.current = null
    setTimestamp(null)
    setSelectedSegmentId(null)
    setPlaying(false)
    setData(null)
    setFailed(false)
    setMediaFailed(false)
    setReload(value => value + 1)
  }
  if (failed) return <div className="qa-replay-status" role="alert">{evidence.error} <button className="button button--secondary" type="button" onClick={refresh}>{evidence.retry}</button></div>
  if (!data) return <p className="qa-replay-status" role="status">{evidence.loading}</p>
  if (!bounds) return <p className="qa-replay-status">{evidence.unavailable}</p>
  const expired = data.playback.recording?.expiresAt != null && Date.parse(data.playback.recording.expiresAt) <= data.loadedAt
  const duration = (bounds.end - bounds.start) / 1000

  return <div className="qa-replay">
    <div className="qa-replay-screen">
      {segment && !mediaFailed ? <video key={segment.id} ref={videoRef} src={segment.url!} muted playsInline preload="metadata" aria-label={evidence.video}
        onLoadedMetadata={event => {
          const video = event.currentTarget
          video.currentTime = Math.max(0, ((seekRef.current ?? currentTime) - Date.parse(segment.startedAt)) / 1000)
          if (resumeRef.current) void video.play().catch(() => setPlaying(false))
        }}
        onPlay={() => { setSelectedSegmentId(segment.id); setPlaying(true) }} onPause={() => setPlaying(false)}
        onError={() => { setMediaFailed(true); setPlaying(false) }}
        onTimeUpdate={event => {
          const value = Math.min(bounds.end, Date.parse(segment.startedAt) + event.currentTarget.currentTime * 1000)
          setTimestamp(value); positionRef.current(value, false)
          if (value >= bounds.end) { event.currentTarget.pause(); resumeRef.current = false }
        }}
        onEnded={() => {
          const next = data.playback.segments.filter(candidate => candidate.state === 'READY' && candidate.url && Date.parse(candidate.startedAt) >= Date.parse(segment.endedAt) && Date.parse(candidate.startedAt) < bounds.end)
            .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))[0]
          if (next) seek(Date.parse(next.startedAt), true, false)
          else if (Date.parse(segment.endedAt) < bounds.end) seek(Date.parse(segment.endedAt), false, false)
          else { resumeRef.current = false; setPlaying(false); setTimestamp(bounds.end); positionRef.current(bounds.end, false) }
        }} /> : <p role="status">{expired ? evidence.expired : mediaFailed ? evidence.error : data.playback.recording === null ? evidence.unavailable : evidence.gap}</p>}
    </div>
    <div className="qa-replay-transport">
      <button className="button button--secondary" type="button" disabled={!segment || mediaFailed} aria-label={playing ? evidence.pause : evidence.play} onClick={() => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) { resumeRef.current = true; void video.play().catch(() => setPlaying(false)) }
        else { resumeRef.current = false; video.pause() }
      }}>{playing ? 'Ⅱ' : '▶'}</button>
      <input type="range" min={0} max={duration} step={0.1} value={(currentTime - bounds.start) / 1000} aria-label={copy.timeline}
        aria-valuetext={`${clipTimeLabel((currentTime - bounds.start) / 1000)} / ${clipTimeLabel(duration)}`} onChange={event => seek(bounds.start + Number(event.target.value) * 1000)} />
      <output className="mono">{clipTimeLabel((currentTime - bounds.start) / 1000)} / {clipTimeLabel(duration)}</output>
      <button className="button button--secondary" type="button" onClick={refresh}>{evidence.retry}</button>
    </div>
    {(data.playback.gaps.length > 0 || data.playback.recording?.error) && <p className="qa-replay-status">{evidence.gap}</p>}
    <div className="qa-replay-attempts" aria-label={copy.intervals}>
      {data.attempts.slice().sort((left, right) => Date.parse(left.startedAt ?? left.createdAt) - Date.parse(right.startedAt ?? right.createdAt)).map(attempt => {
        const range = attemptRange(attempt, bounds)
        const label = caseLabel(attempt.testCaseId)
        const start = range?.start ?? Date.parse(attempt.finishedAt ?? attempt.createdAt)
        const selected = range !== null && currentTime >= range.start && currentTime < range.end
        return <button className="qa-replay-attempt" type="button" key={attempt.id} aria-pressed={selected} onClick={() => seek(start)}>
          <span className="qa-replay-attempt-track" aria-hidden="true">{range && <span style={{ left: `${(range.start - bounds.start) / (bounds.end - bounds.start) * 100}%`, width: `${(range.end - range.start) / (bounds.end - bounds.start) * 100}%` }} />}</span>
          <span>{label} · {attempt.verdict ? evidence[attempt.verdict] : evidence.running}</span>
          <span className="mono">{range ? `${clipTimeLabel((range.start - bounds.start) / 1000)}–${clipTimeLabel((range.end - bounds.start) / 1000)}` : copy.unknownStart}</span>
        </button>
      })}
      {data.attempts.length === 0 && <p>{evidence.empty}</p>}
    </div>
  </div>
}
