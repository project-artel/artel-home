import { useI18n } from '../i18n/useI18n'
import { useTestCaseLabel } from '../testCases/testCaseIdentifiers'
import type { Attempt, Playback } from './evaluation/evaluationApi'
import { evaluationCopy } from './evaluation/evaluationCopy'
import { clipTimeLabel } from './evaluation/videoEvidence'
import { attemptRange, firstReplayTimestamp } from './qaReplayModel'

export function QaExecutionTimeline({ bounds, timestamp, playback, attempts, playing, playable, onSeek, onTogglePlay, onRefresh }: {
  bounds: { start: number; end: number }; timestamp: number; playback: Playback; attempts: Attempt[]
  playing: boolean; playable: boolean; onSeek: (timestamp: number) => void; onTogglePlay: () => void; onRefresh: () => void
}) {
  const { t, locale } = useI18n()
  const copy = t.qa.replay
  const evidence = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const caseLabel = useTestCaseLabel()
  const duration = (bounds.end - bounds.start) / 1000
  const percentage = (time: number) => Math.max(0, Math.min(100, (time - bounds.start) / (bounds.end - bounds.start) * 100))
  const lanes: number[] = []
  const ranges = attempts.map(attempt => ({ attempt, range: attemptRange(attempt, bounds) }))
    .filter(item => item.range !== null).sort((left, right) => left.range!.start - right.range!.start)
    .map(item => {
      const range = item.range!
      let lane = lanes.findIndex(end => end <= range.start)
      if (lane === -1) lane = lanes.length
      lanes[lane] = range.end
      return { ...item, range, lane }
    })
  const unknown = attempts.filter(attempt => attempt.startedAt === null)
  const current = ranges.find(({ range }) => timestamp >= range.start && timestamp < range.end)
  return <section className="qa-execution-timeline" aria-label={copy.timeline}>
    <header className="qa-execution-head">
      <button className="qa-icon-button" type="button" disabled={!playable} aria-label={playing ? evidence.pause : evidence.play} onClick={onTogglePlay}>{playing ? 'Ⅱ' : '▶'}</button>
      <strong>{copy.title}</strong>
      <output className="mono">{clipTimeLabel((timestamp - bounds.start) / 1000)}<span> / {clipTimeLabel(duration)}</span></output>
      <select className="qa-timeline-case-picker" aria-label={copy.intervals} value={current?.attempt.id ?? ''} onChange={event => {
        const item = ranges.find(item => item.attempt.id === event.target.value)
        if (item) onSeek(firstReplayTimestamp(playback.segments, item.range))
      }}>
        <option value="">{copy.intervals}</option>
        {ranges.map(({ attempt, range }) => <option key={attempt.id} value={attempt.id}>{caseLabel(attempt.testCaseId)} · {clipTimeLabel((range.start - bounds.start) / 1000)}–{clipTimeLabel((range.end - bounds.start) / 1000)}</option>)}
      </select>
      {playback.gaps.length > 0 && <span className="qa-timeline-gap-label">{copy.gaps(playback.gaps.length)}</span>}
      <button className="qa-icon-button qa-timeline-refresh" type="button" aria-label={evidence.retry} title={evidence.retry} onClick={onRefresh}>↻</button>
    </header>
    <div className="qa-timeline-chart">
      <div className="qa-timeline-ruler" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index}>{clipTimeLabel(duration * index / 5)}</span>)}</div>
      <div className="qa-timeline-recording" aria-hidden="true">
        {playback.segments.filter(segment => segment.state === 'READY' && segment.url).map(segment => <span key={segment.id} style={{ left: `${percentage(Date.parse(segment.startedAt))}%`, width: `${Math.max(0, percentage(Date.parse(segment.endedAt)) - percentage(Date.parse(segment.startedAt)))}%` }} />)}
      </div>
      <input className="qa-timeline-seek" type="range" min={0} max={duration} step={0.1} value={(timestamp - bounds.start) / 1000} aria-label={copy.timeline}
        aria-valuetext={`${clipTimeLabel((timestamp - bounds.start) / 1000)} / ${clipTimeLabel(duration)}`} onChange={event => onSeek(bounds.start + Number(event.target.value) * 1000)} />
      <div className="qa-timeline-cases" style={{ height: `${Math.max(1, lanes.length) * 34}px` }} aria-label={copy.intervals}>
        {ranges.map(({ attempt, range, lane }) => {
          const label = `${caseLabel(attempt.testCaseId)} · ${clipTimeLabel((range.start - bounds.start) / 1000)}–${clipTimeLabel((range.end - bounds.start) / 1000)} · ${attempt.verdict ? evidence[attempt.verdict] : evidence.running}`
          return <button key={attempt.id} className={`qa-timeline-case qa-timeline-case--${attempt.verdict?.toLowerCase() ?? 'running'}`} aria-label={label} title={label} aria-pressed={timestamp >= range.start && timestamp < range.end} type="button" onClick={() => onSeek(firstReplayTimestamp(playback.segments, range))}
            style={{ left: `${percentage(range.start)}%`, width: `${Math.max(0.2, percentage(range.end) - percentage(range.start))}%`, top: `${lane * 34}px` }}><span>{caseLabel(attempt.testCaseId)}</span></button>
        })}
      </div>
      <span className="qa-timeline-playhead" aria-hidden="true" style={{ left: `${percentage(timestamp)}%` }} />
    </div>
    <div className="qa-timeline-selected" aria-live="polite">{current && <><strong>{caseLabel(current.attempt.testCaseId)}</strong><span className="mono">{clipTimeLabel((current.range.start - bounds.start) / 1000)}–{clipTimeLabel((current.range.end - bounds.start) / 1000)}</span><span>{current.attempt.verdict ? evidence[current.attempt.verdict] : evidence.running}</span></>}</div>
    {unknown.length > 0 && <details className="qa-timeline-unknown"><summary>{copy.unknownIntervals(unknown.length)}</summary><div>{unknown.map(attempt => <button type="button" key={attempt.id} onClick={() => onSeek(Date.parse(attempt.finishedAt ?? attempt.createdAt))}>{caseLabel(attempt.testCaseId)} · {copy.unknownStart}</button>)}</div></details>}
  </section>
}
