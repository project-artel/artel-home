import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useTestCaseLabel } from '../testCases/testCaseIdentifiers'
import type { Attempt, Playback } from './evaluation/evaluationApi'
import { evaluationCopy } from './evaluation/evaluationCopy'
import { clipTimeLabel } from './evaluation/videoEvidence'
import { caseTimelineTracks, firstReplayTimestamp } from './qaReplayModel'

export function QaExecutionTimeline({ bounds, timestamp, playback, attempts, playing, playable, onSeek, onTogglePlay, onRefresh }: {
  bounds: { start: number; end: number }; timestamp: number; playback: Playback; attempts: Attempt[]
  playing: boolean; playable: boolean; onSeek: (timestamp: number) => void; onTogglePlay: () => void; onRefresh: () => void
}) {
  const { t, locale } = useI18n()
  const copy = t.qa.replay
  const evidence = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const caseLabel = useTestCaseLabel()
  const [collapsed, setCollapsed] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [height, setHeight] = useState(155)
  const [maximumHeight, setMaximumHeight] = useState(400)
  const [resizing, setResizing] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const drag = useRef<{ y: number; height: number } | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = panel.current?.closest('.qa-console')
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setMaximumHeight(Math.max(64, Math.min(600, entry.contentRect.height - 160))))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  const shownHeight = Math.max(64, Math.min(maximumHeight, height))
  function resizeTo(value: number) { setHeight(Math.max(64, Math.min(maximumHeight, value))) }
  const duration = (bounds.end - bounds.start) / 1000
  const percentage = (time: number) => Math.max(0, Math.min(100, (time - bounds.start) / (bounds.end - bounds.start) * 100))
  const tracks = caseTimelineTracks(attempts, bounds)
  const ranges = tracks.flatMap(track => track.intervals)
  const current = ranges.filter(({ range }) => timestamp >= range.start && timestamp < range.end)
  const unknown = attempts.filter(attempt => attempt.startedAt === null)
  return <section ref={panel} className={`qa-execution-timeline${collapsed ? ' qa-execution-timeline--collapsed' : ''}`} aria-label={copy.timeline}>
    <div className="qa-timeline-resize" role="separator" tabIndex={0} aria-label={copy.resize} aria-orientation="horizontal" aria-valuemin={64} aria-valuemax={maximumHeight} aria-valuenow={shownHeight} data-resizing={resizing}
      onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { y: event.clientY, height: collapsed ? 64 : shownHeight }
        setResizing(true)
      }}
      onPointerMove={event => {
        if (!drag.current) return
        if (Math.abs(event.clientY - drag.current.y) > 3) setCollapsed(false)
        resizeTo(drag.current.height + drag.current.y - event.clientY)
      }}
      onPointerUp={event => { drag.current = null; setResizing(false); event.currentTarget.releasePointerCapture(event.pointerId) }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false) }}
      onKeyDown={event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        setCollapsed(false)
        resizeTo(event.key === 'Home' ? 64 : event.key === 'End' ? maximumHeight : shownHeight + (event.key === 'ArrowUp' ? 24 : -24))
      }}><span aria-hidden="true" /></div>
    <header className="qa-execution-head">
      <button className="qa-icon-button" type="button" disabled={!playable} aria-label={playing ? evidence.pause : evidence.play} onClick={onTogglePlay}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">{playing ? <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></> : <path d="M7 4.5a1 1 0 0 1 1.5-.86l12 7a1 1 0 0 1 0 1.72l-12 7A1 1 0 0 1 7 18.5z" />}</svg>
      </button>
      <strong>{copy.title}</strong>
      <output className="mono">{clipTimeLabel((timestamp - bounds.start) / 1000)}<span> / {clipTimeLabel(duration)}</span></output>
      {!collapsed && <><select className="qa-timeline-case-picker" aria-label={copy.intervals} value={current[0]?.attempt.id ?? ''} onChange={event => {
        const item = ranges.find(item => item.attempt.id === event.target.value)
        if (item) onSeek(firstReplayTimestamp(playback.segments, item.range))
      }}><option value="">{copy.intervals}</option>{ranges.map(({ attempt, range }) => <option key={attempt.id} value={attempt.id}>{caseLabel(attempt.testCaseId)} · {clipTimeLabel((range.start - bounds.start) / 1000)}–{clipTimeLabel((range.end - bounds.start) / 1000)}</option>)}</select>
      <select className="qa-timeline-zoom" aria-label={copy.zoom} value={zoom} onChange={event => {
        const next = Number(event.target.value)
        setZoom(next)
        window.requestAnimationFrame(() => {
          if (scroll.current) scroll.current.scrollLeft = Math.max(0, percentage(timestamp) / 100 * (scroll.current.scrollWidth - 84) - scroll.current.clientWidth / 2)
        })
      }}>{[1, 2, 4, 8, 16].map(value => <option key={value} value={value}>{value}×</option>)}</select></>}
      <button className="qa-icon-button qa-timeline-refresh" type="button" aria-label={evidence.retry} title={evidence.retry} onClick={onRefresh}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5" /><path d="M19.4 12a7.5 7.5 0 1 0-1.8 5" /></svg></button>
      <button className="qa-icon-button qa-timeline-collapse" type="button" aria-label={collapsed ? copy.expand : copy.collapse} title={collapsed ? copy.expand : copy.collapse} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={collapsed ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg></button>
    </header>
    {!collapsed && <>
      <div className="qa-timeline-scroll" ref={scroll} style={{ height: shownHeight }}>
        <div className="qa-timeline-chart" style={{ width: `${zoom * 100}%` }}>
          <div className="qa-timeline-axis">
            <div className="qa-timeline-ruler" aria-hidden="true">{Array.from({ length: 6 * zoom }, (_, index) => <span key={index}>{clipTimeLabel(duration * index / (6 * zoom - 1))}</span>)}</div>
            <div className="qa-timeline-recording" aria-hidden="true">{playback.segments.filter(segment => segment.state === 'READY' && segment.url).map(segment => <span key={segment.id} style={{ left: `${percentage(Date.parse(segment.startedAt))}%`, width: `${Math.max(0, percentage(Date.parse(segment.endedAt)) - percentage(Date.parse(segment.startedAt)))}%` }} />)}</div>
            <input className="qa-timeline-seek" type="range" min={0} max={duration} step={0.1} value={(timestamp - bounds.start) / 1000} aria-label={copy.timeline} aria-valuetext={`${clipTimeLabel((timestamp - bounds.start) / 1000)} / ${clipTimeLabel(duration)}`} onChange={event => onSeek(bounds.start + Number(event.target.value) * 1000)} />
          </div>
          <div className="qa-timeline-cases" aria-label={copy.intervals}>
            {tracks.map(track => <div className="qa-timeline-track" key={track.caseId} style={{ minHeight: `${track.laneEnds.length * 34}px` }}>
              <strong className="qa-timeline-track-label">{caseLabel(track.caseId)}</strong>
              <div className="qa-timeline-track-lanes">{track.intervals.map(({ attempt, range, lane }, index) => {
                const label = `${caseLabel(attempt.testCaseId)} · ${clipTimeLabel((range.start - bounds.start) / 1000)}–${clipTimeLabel((range.end - bounds.start) / 1000)} · ${attempt.verdict ? evidence[attempt.verdict] : evidence.running}`
                return <button key={attempt.id} className={`qa-timeline-case qa-timeline-case--${attempt.verdict?.toLowerCase() ?? 'running'}`} aria-label={label} title={label} aria-pressed={timestamp >= range.start && timestamp < range.end} type="button" onClick={() => onSeek(firstReplayTimestamp(playback.segments, range))} style={{ left: `${percentage(range.start)}%`, width: `${Math.max(.2, percentage(range.end) - percentage(range.start))}%`, top: `${lane * 34}px` }}><span>{track.intervals.length > 1 ? `${index + 1} · ` : ''}{clipTimeLabel((range.start - bounds.start) / 1000)}–{clipTimeLabel((range.end - bounds.start) / 1000)}</span></button>
              })}</div>
            </div>)}
          </div>
          <div className="qa-timeline-playhead-area"><span className="qa-timeline-playhead" aria-hidden="true" style={{ left: `${percentage(timestamp)}%` }} /></div>
        </div>
      </div>
      <div className="qa-timeline-selected" aria-live="polite">{current.map(({ attempt, range }) => <span key={attempt.id}><strong>{caseLabel(attempt.testCaseId)}</strong> <span className="mono">{clipTimeLabel((range.start - bounds.start) / 1000)}–{clipTimeLabel((range.end - bounds.start) / 1000)}</span> · {attempt.verdict ? evidence[attempt.verdict] : evidence.running}</span>)}</div>
      {unknown.length > 0 && <details className="qa-timeline-unknown"><summary>{copy.unknownIntervals(unknown.length)}</summary><div>{unknown.map(attempt => <button type="button" key={attempt.id} onClick={() => onSeek(Date.parse(attempt.finishedAt ?? attempt.createdAt))}>{caseLabel(attempt.testCaseId)} · {copy.unknownStart}</button>)}</div></details>}
    </>}
  </section>
}
