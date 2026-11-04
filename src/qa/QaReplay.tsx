import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { QaExecutionTimeline } from './QaExecutionTimeline'
import { useI18n } from '../i18n/useI18n'
import * as api from './evaluation/evaluationApi'
import { evaluationCopy } from './evaluation/evaluationCopy'
import { firstReplayTimestamp, replayBounds, segmentAt } from './qaReplayModel'
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

export function QaReplay({ projectId, qaTry, onPosition, timelineHost }: {
  timelineHost: HTMLDivElement | null; projectId: string; qaTry: QaTry; onPosition: (timestamp: number, seek: boolean) => void
}) {
  const { locale } = useI18n()
  const evidence = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
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
  const initialTime = bounds && data ? firstReplayTimestamp(data.playback.segments, bounds) : null
  const currentTime = timestamp ?? initialTime ?? bounds?.start ?? 0
  const segment = data ? selectedSegmentId === null ? segmentAt(data.playback.segments, currentTime) : data.playback.segments.find(candidate => candidate.id === selectedSegmentId) ?? null : null
  const segmentId = segment?.id
  useEffect(() => {
    const video = videoRef.current
    return () => { video?.pause() }
  }, [segmentId])
  const boundsStart = initialTime ?? bounds?.start ?? null
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

  return <>
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
    {timelineHost && createPortal(<QaExecutionTimeline bounds={bounds} timestamp={currentTime} playback={data.playback} attempts={data.attempts} playing={playing} playable={segment !== null && !mediaFailed} onSeek={seek} onRefresh={refresh} onTogglePlay={() => {
      const video = videoRef.current
      if (!video) return
      if (video.paused) { resumeRef.current = true; void video.play().catch(() => setPlaying(false)) }
      else { resumeRef.current = false; video.pause() }
    }} />, timelineHost)}
  </>
}
