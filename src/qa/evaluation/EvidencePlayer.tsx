import { useEffect, useRef, useState } from 'react'
import { shortWhen } from '../history/historyModel'
import type { evaluationCopy } from './evaluationCopy'
import { clipDuration, clipElapsed, clipSeek, clipTimeLabel, type EvidenceClip } from './videoEvidence'

type Position = { id: string; time: number; playing: boolean }

/** 부모가 attempt와 recording의 identity로 재생 상태를 분리한다. */
export function EvidencePlayer({ clips, copy }: { clips: EvidenceClip[]; copy: typeof evaluationCopy.ko | typeof evaluationCopy.en }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const position = useRef<Position | null>(null)
  const index = Math.max(0, clips.findIndex(clip => clip.id === selectedId))
  const current = clips[index]
  const duration = clipDuration(clips)

  useEffect(() => {
    const video = videoRef.current
    return () => { video?.pause() }
  }, [current?.id])

  if (!current) return null

  function play(video: HTMLVideoElement) {
    void video.play().then(() => { if (videoRef.current !== video) video.pause() }).catch(() => {})
  }

  function seek(value: number, resume = videoRef.current !== null && !videoRef.current.paused) {
    const target = clipSeek(clips, value)
    if (!target) return
    position.current = { ...target, playing: resume }
    setElapsed(Math.max(0, Math.min(duration, value)))
    if (target.id !== current.id) setSelectedId(target.id)
    else if (videoRef.current) {
      const video = videoRef.current
      if (video.readyState > 0) video.currentTime = target.time
      if (resume) play(video)
      else video.pause()
    }
  }

  function advance(video: HTMLVideoElement, ended = false) {
    if (position.current?.id !== current.id) return
    const resume = ended || !video.paused
    const next = clips[index + 1]
    video.pause()
    if (next) {
      position.current = { id: next.id, time: next.from, playing: resume }
      setSelectedId(next.id)
    } else {
      position.current = { id: current.id, time: current.to, playing: false }
      setElapsed(duration)
      setPlaying(false)
    }
  }

  return <>
    <div className="qe-player" ref={containerRef}>
      <video key={current.id} ref={videoRef} preload="metadata" playsInline muted={muted} src={current.url!} aria-label={copy.video}
        onLoadedMetadata={event => {
          const video = event.currentTarget
          const saved = position.current?.id === current.id ? position.current : null
          const time = Math.min(current.to, Math.max(current.from, saved?.time ?? current.from))
          video.currentTime = time
          position.current = { id: current.id, time, playing: saved?.playing ?? false }
          setElapsed(clipElapsed(clips, current.id, time))
          if (saved?.playing) play(video)
        }}
        onPlay={event => {
          const video = event.currentTarget
          position.current = { id: current.id, time: video.currentTime, playing: true }
          setPlaying(true)
        }}
        onPause={event => {
          const video = event.currentTarget
          if (video !== videoRef.current) return
          setPlaying(false)
          if (video.readyState > 0 && position.current?.id === current.id) position.current.playing = false
        }}
        onSeeking={event => {
          const video = event.currentTarget
          if (video.currentTime < current.from) video.currentTime = current.from
          else if (video.currentTime > current.to) video.currentTime = current.to
        }}
        onTimeUpdate={event => {
          const video = event.currentTarget
          if (video.readyState === 0 || (position.current !== null && position.current.id !== current.id)) return
          position.current = { id: current.id, time: video.currentTime, playing: !video.paused }
          setElapsed(clipElapsed(clips, current.id, video.currentTime))
          if (video.currentTime >= current.to) advance(video)
        }}
        onEnded={event => advance(event.currentTarget, true)} />
      <div className="qe-player-controls">
        <button className="button button--secondary button--compact" type="button" aria-label={playing ? copy.pause : copy.play}
          onClick={() => {
            const video = videoRef.current
            if (!video) return
            if (!video.paused) video.pause()
            else if (elapsed >= duration) seek(0, true)
            else play(video)
          }}><span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span></button>
        <input type="range" aria-label={copy.video} min={0} max={duration} step={0.1} value={Math.min(elapsed, duration)}
          aria-valuetext={`${clipTimeLabel(elapsed)} / ${clipTimeLabel(duration)}`} onChange={event => seek(Number(event.target.value))} />
        <span className="mono qe-player-time">{clipTimeLabel(elapsed)} / {clipTimeLabel(duration)}</span>
        <button className="button button--secondary button--compact" type="button" aria-label={copy.mute} aria-pressed={muted}
          onClick={() => setMuted(value => !value)}><span aria-hidden="true">{muted ? '♩̸' : '♪'}</span></button>
        <button className="button button--secondary button--compact" type="button" aria-label={copy.fullscreen}
          onClick={() => { if (document.fullscreenElement === containerRef.current) void document.exitFullscreen().catch(() => {}); else void containerRef.current?.requestFullscreen().catch(() => {}) }}><span aria-hidden="true">⛶</span></button>
      </div>
    </div>
    <div className="qe-media-bar">
      <span className="mono">{shortWhen(current.startedAt)}</span>
      <span>{index + 1} / {clips.length} {copy.segment}</span>
      {clips.length > 1 && <select className="qe-select" aria-label={copy.next} value={current.id} onChange={event => {
        const clip = clips.find(candidate => candidate.id === event.target.value)
        if (clip) seek(clipElapsed(clips, clip.id, clip.from))
      }}>
        {clips.map(clip => <option key={clip.id} value={clip.id}>{new Date(clip.startedAt).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</option>)}
      </select>}
    </div>
  </>
}
