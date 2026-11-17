import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { QaExecutionTimeline } from './QaExecutionTimeline'
import { useI18n } from '../i18n/useI18n'
import * as api from './evaluation/evaluationApi'
import { evaluationCopy } from './evaluation/evaluationCopy'
import { replayBounds, segmentAt } from './qaReplayModel'
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

export function QaReplay({ autoPlay, projectId, qaTry, onPosition, timelineHost }: {
  autoPlay: boolean
  timelineHost: HTMLDivElement | null; projectId: string; qaTry: QaTry; onPosition: (timestamp: number, seek: boolean) => void
}) {
  const { locale } = useI18n()
  const evidence = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [data, setData] = useState<ReplayData | null>(null)
  const [failed, setFailed] = useState(false)
  const [mediaFailed, setMediaFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [timestamp, setTimestamp] = useState<number | null>(null)
  const [playing, setPlaying] = useState(autoPlay)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const resumeRef = useRef(autoPlay)
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
  const segmentStartedAt = segment?.startedAt
  const boundsEnd = bounds?.end
  const [playbackRate, setPlaybackRate] = useState(1)
  function changePlaybackRate(rate: number) {
    if (videoRef.current) videoRef.current.playbackRate = rate
    setPlaybackRate(rate)
  }
  useEffect(() => {
    const video = videoRef.current
    return () => { video?.pause() }
  }, [segmentId])
  useEffect(() => {
    const video = videoRef.current
    if (!playing || !video || segmentStartedAt === undefined || boundsEnd === undefined) return
    const start = Date.parse(segmentStartedAt)
    let stopped = false
    let request = 0
    let lastSample = 0
    const nativeFrames = typeof video.requestVideoFrameCallback === 'function'
    function sample(now: number) {
      if (stopped || videoRef.current !== video) return
      if (now - lastSample >= 100 && !video!.paused) {
        lastSample = now
        const value = Math.min(boundsEnd!, start + video!.currentTime * 1000)
        setTimestamp(value)
        positionRef.current(value, false)
        if (value >= boundsEnd!) { resumeRef.current = false; video!.pause(); return }
      }
      request = nativeFrames ? video!.requestVideoFrameCallback(sample) : window.requestAnimationFrame(sample)
    }
    request = nativeFrames ? video.requestVideoFrameCallback(sample) : window.requestAnimationFrame(sample)
    return () => { stopped = true; if (nativeFrames) video.cancelVideoFrameCallback(request); else window.cancelAnimationFrame(request) }
  }, [playing, segmentId, segmentStartedAt, boundsEnd])
  const boundsStart = bounds?.start ?? null
  const segments = data?.playback.segments
  const expiresAt = data?.playback.recording?.expiresAt
  const canPlayMedia = !mediaFailed && !(expiresAt && data && Date.parse(expiresAt) <= data.loadedAt)
  useEffect(() => {
    if (!playing || (segmentId !== undefined && canPlayMedia) || boundsStart === null || boundsEnd === undefined || segments === undefined) return
    const start = seekRef.current ?? boundsStart
    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      const position = Math.min(boundsEnd, start + (performance.now() - startedAt) * playbackRate)
      seekRef.current = position
      setTimestamp(position)
      positionRef.current(position, false)
      const nextSegment = canPlayMedia ? segmentAt(segments, position) : null
      if (position >= boundsEnd) {
        resumeRef.current = false
        setPlaying(false)
      } else if (nextSegment !== null) {
        setSelectedSegmentId(nextSegment.id)
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [boundsStart, boundsEnd, canPlayMedia, playbackRate, playing, segments, segmentId])
  useEffect(() => {
    if (autoPlay && boundsStart !== null && timestamp === null) positionRef.current(boundsStart, false)
  }, [autoPlay, boundsStart, timestamp])
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
    const shouldResume = resume && value < bounds.end
    resumeRef.current = shouldResume
    seekRef.current = mediaPosition
    setMediaFailed(false)
    setTimestamp(value)
    setSelectedSegmentId(target?.id ?? '')
    setPlaying(shouldResume)
    positionRef.current(value, userSeek)
    const video = videoRef.current
    if (video && target && target.id === segment?.id && video.readyState > 0) {
      video.currentTime = (mediaPosition - Date.parse(target.startedAt)) / 1000
      if (shouldResume) void video.play().catch(() => setPlaying(false))
      else video.pause()
    }
  }

  const refresh = () => {
    resumeRef.current = autoPlay
    seekRef.current = null
    setTimestamp(null)
    setSelectedSegmentId(null)
    setPlaying(autoPlay)
    setData(null)
    setFailed(false)
    setMediaFailed(false)
    setReload(value => value + 1)
  }
  if (failed) return <div className="qa-replay-status qa-replay-without-video" role="alert">{evidence.error} <button className="button button--secondary" type="button" onClick={refresh}>{evidence.retry}</button></div>
  if (!data) return <p className="qa-replay-status qa-replay-without-video" role="status">{evidence.loading}</p>
  if (!bounds) return <p className="qa-replay-status qa-replay-without-video">{evidence.unavailable}</p>
  const expired = data.playback.recording?.expiresAt != null && Date.parse(data.playback.recording.expiresAt) <= data.loadedAt
  const hasVideo = !expired && !mediaFailed && data.playback.segments.some(candidate => candidate.state === 'READY' && candidate.url !== null && Date.parse(candidate.endedAt) > bounds.start && Date.parse(candidate.startedAt) < bounds.end)
  const preparing = data.playback.segments.some(candidate => candidate.state !== 'READY' && candidate.state !== 'EXPIRED')

  return <>
    {hasVideo ? <div className="qa-replay-screen">
      {segment && !mediaFailed ? <video key={segment.id} ref={videoRef} src={segment.url!} muted playsInline preload="metadata" aria-label={evidence.video}
        onLoadedMetadata={event => {
          const video = event.currentTarget
          video.playbackRate = playbackRate
          video.currentTime = Math.max(0, ((seekRef.current ?? currentTime) - Date.parse(segment.startedAt)) / 1000)
          if (resumeRef.current) void video.play().catch(() => setPlaying(false))
        }}
        onPlay={event => { if (event.currentTarget === videoRef.current) { setSelectedSegmentId(segment.id); setPlaying(true) } }}
        onPause={event => { if (event.currentTarget === videoRef.current) setPlaying(false) }}
        onError={() => { setMediaFailed(true); setPlaying(false) }}
        onTimeUpdate={event => {
          if (event.currentTarget !== videoRef.current) return
          if (!resumeRef.current && (timestamp === null || timestamp === bounds.end)) return
          const value = Math.min(bounds.end, Date.parse(segment.startedAt) + event.currentTarget.currentTime * 1000)
          seekRef.current = value
          setTimestamp(value); positionRef.current(value, false)
          if (value >= bounds.end) { event.currentTarget.pause(); resumeRef.current = false }
        }}
        onEnded={event => {
          if (event.currentTarget !== videoRef.current) return
          seek(Date.parse(segment.endedAt), true, false)
        }} /> : <p role="status">{expired ? evidence.expired : mediaFailed ? evidence.error : data.playback.recording === null ? evidence.unavailable : evidence.gap}</p>}
    </div> : <div className="qa-replay-status qa-replay-without-video" role={mediaFailed ? 'alert' : 'status'}>
      {expired ? evidence.expired : mediaFailed ? evidence.error : preparing ? evidence.loading : evidence.unavailable}
      {mediaFailed && <button className="button button--secondary" type="button" onClick={refresh}>{evidence.retry}</button>}
    </div>}
    {timelineHost && createPortal(<QaExecutionTimeline bounds={bounds} timestamp={currentTime} playback={data.playback} attempts={data.attempts} playing={playing} playable={true} playbackRate={playbackRate} onPlaybackRateChange={changePlaybackRate} onSeek={seek} onRefresh={refresh} onTogglePlay={() => {
      const video = videoRef.current
      if (currentTime >= bounds.end) { seek(bounds.start, true, false); return }
      if (!video) { resumeRef.current = !playing; setPlaying(!playing); return }
      if (video.paused) { resumeRef.current = true; void video.play().catch(() => setPlaying(false)) }
      else { resumeRef.current = false; video.pause() }
    }} />, timelineHost)}
  </>
}
