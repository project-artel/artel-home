import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import * as api from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'
import { clipGaps, clipSegments, evidenceExpired } from './videoEvidence'
import { useProjectChange } from '../../live/useProjectChange'
import './evaluation.css'

export function CaseEvaluationPanel({ projectId, qaTryId, testCaseId }: { projectId: string; qaTryId?: string; testCaseId?: string }) {
  return <AttemptList key={`${projectId}:${qaTryId ?? ''}:${testCaseId ?? ''}`} projectId={projectId} qaTryId={qaTryId} testCaseId={testCaseId} />
}

function AttemptList({ projectId, qaTryId, testCaseId }: { projectId: string; qaTryId?: string; testCaseId?: string }) {
  const [params] = useSearchParams()
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [rows, setRows] = useState<api.Attempt[]>([])
  const [selected, setSelected] = useState<string | null>(() => params.get('attempt'))
  const [linkedAttempt, setLinkedAttempt] = useState<api.Attempt | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const result = await api.attempts(projectId, { qaTryId, testCaseId }, signal); setRows(result); setHasMore(result.length === 100); setError(false) }
    catch { if (!signal?.aborted) setError(true) }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [projectId, qaTryId, testCaseId])
  useProjectChange(projectId, ['QA_RUNS', 'TEST_CASES'], () => void load())
  useEffect(() => {
    const controller = new AbortController()
    void api.attempts(projectId, { qaTryId, testCaseId }, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setRows(result); setHasMore(result.length === 100); setError(false) } })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [projectId, qaTryId, testCaseId])
  useEffect(() => {
    if (!selected) return
    const controller = new AbortController()
    void api.getAttempt(projectId, selected, controller.signal).then(row => {
      if (!controller.signal.aborted && (!qaTryId || row.qaTryId === qaTryId) && (!testCaseId || row.testCaseId === testCaseId)) setLinkedAttempt(row)
    }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [projectId, selected, qaTryId, testCaseId])
  const options = linkedAttempt && !rows.some(row => row.id === linkedAttempt.id) ? [linkedAttempt, ...rows] : rows
  const current = options.find(row => row.id === selected) ?? rows[0]
  return <section className="qe-panel" aria-label={copy.title}>
    <h3>{copy.title}</h3>
    {loading && <p role="status">{copy.loading}</p>}
    {error && <p role="alert">{copy.error} <button className="button button--secondary" onClick={() => void load()}>{copy.retry}</button></p>}
    {!loading && !rows.length && <p>{copy.empty}</p>}
    {options.length > 0 && <select aria-label={copy.title} value={current?.id} onChange={event => setSelected(event.target.value)}>
      {options.map(row => <option key={row.id} value={row.id}>TC {row.testCaseId} · {new Date(row.startedAt ?? row.createdAt).toLocaleString()} · {row.verdict ? copy[row.verdict] : copy.running} · {row.review ? copy[row.review] : copy.unreviewed}</option>)}
    </select>}
    {current && <AttemptReview key={current.id} attempt={current} projectId={projectId} onSaved={() => void load()} />}
    {hasMore && rows.length > 0 && <button className="button button--secondary" onClick={() => {
      void api.attempts(projectId, { qaTryId, testCaseId, before: rows[rows.length - 1].createdAt, beforeId: rows[rows.length - 1].id })
        .then(next => { setRows(previous => [...previous, ...next.filter(row => !previous.some(existing => existing.id === row.id))]); setHasMore(next.length === 100) }).catch(() => setError(true))
    }}>{copy.more}</button>}
  </section>
}

function AttemptReview({ attempt, projectId, onSaved }: { attempt: api.Attempt; projectId: string; onSaved: () => void }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [decision, setDecision] = useState(attempt.review ?? 'INCONCLUSIVE')
  const [note, setNote] = useState(attempt.note ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<api.Revision[]>([])
  const [video, setVideo] = useState<api.Playback | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const refreshVideo = () => void api.playback(projectId, attempt.qaTryId, controller.signal).then(value => { if (!controller.signal.aborted) setVideo(value) }).catch(() => { if (!controller.signal.aborted) setMessage(copy.error) })
    refreshVideo()
    const timer = window.setInterval(refreshVideo, 60000)
    if (attempt.logId) void api.revisions(projectId, attempt.logId, controller.signal).then(setHistory).catch(() => { if (!controller.signal.aborted) setMessage(copy.error) })
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [projectId, attempt.qaTryId, attempt.logId, copy.error])
  return <div className="qe-attempt">
    <p>{copy.original}: <strong>{attempt.verdict ? copy[attempt.verdict] : copy.running}</strong></p>
    {attempt.originalReason && <div><h4>{copy.originalReason}</h4><p className="qe-evidence-text">{attempt.originalReason}</p></div>}
    {attempt.caseSnapshot && <details open><summary>{copy.snapshot}</summary><dl className="qe-snapshot">
      {attempt.caseSnapshot.scene && <><dt>{copy.scene}</dt><dd>{attempt.caseSnapshot.scene}</dd></>}
      {attempt.caseSnapshot.precondition && <><dt>{copy.precondition}</dt><dd>{attempt.caseSnapshot.precondition}</dd></>}
      {attempt.caseSnapshot.step && <><dt>{copy.step}</dt><dd>{attempt.caseSnapshot.step}</dd></>}
      {attempt.caseSnapshot.expected && <><dt>{copy.expected}</dt><dd>{attempt.caseSnapshot.expected}</dd></>}
    </dl></details>}
    <nav className="qe-links">
      <Link className="table-link" to={`/projects/${encodeURIComponent(projectId)}/test-cases?case=${encodeURIComponent(attempt.testCaseId)}`}>{copy.testcase}</Link>
      {attempt.qaRunId ? <Link className="table-link" to={`/projects/${encodeURIComponent(projectId)}/qa-history/${encodeURIComponent(attempt.qaRunId)}?scenario=${encodeURIComponent(attempt.qaTryId)}`}>{copy.qa} #{attempt.qaTryId}</Link> : <span>{copy.qa} #{attempt.qaTryId}</span>}
    </nav>
    {!attempt.startedAt && <p>{copy.unknownStart}</p>}
    {video && <VideoEvidence key={video.recording?.id ?? 'none'} attempt={attempt} playback={video} />}
    {attempt.logId && <form onSubmit={event => {
      event.preventDefault(); setBusy(true); setMessage('')
      void api.review(projectId, attempt.logId!, decision, note).then(async () => {
        setHistory(await api.revisions(projectId, attempt.logId!)); setMessage(copy.saved); onSaved()
      }).catch(() => setMessage(copy.error)).finally(() => setBusy(false))
    }}>
      <label>{copy.actual}<select aria-label={copy.actual} value={decision} onChange={event => setDecision(event.target.value as api.Verdict)}>
        {(['PASSED', 'FAILED', 'INCONCLUSIVE'] as const).map(value => <option key={value} value={value}>{copy[value]}</option>)}
      </select></label>
      <label>{copy.reason}<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
      <p className="qe-note">{copy.help}</p>
      <button className="button button--primary qe-review-submit" disabled={busy} type="submit">{copy.save}</button>
    </form>}
    {message && <p role="status">{message}</p>}
    <details><summary>{copy.history} ({history.length})</summary>
      <ol>{history.map(item => <li key={item.id}>{new Date(item.decidedAt).toLocaleString()} · {item.decision} · #{item.decidedBy ?? '—'}{item.note && <p>{item.note}</p>}</li>)}</ol>
    </details>
  </div>
}

function VideoEvidence({ attempt, playback }: { attempt: api.Attempt; playback: api.Playback }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const segments = clipSegments(attempt, playback.segments)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const continuePlaying = useRef(false)
  const position = useRef<{ id: string; time: number; playing: boolean } | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const index = Math.max(0, segments.findIndex(segment => segment.id === selectedSegmentId))
  const current = segments[index]
  const expired = evidenceExpired(attempt, playback, now)
  const clipStart = Date.parse(attempt.startedAt ?? attempt.finishedAt ?? attempt.createdAt) - 10000
  const clipEnd = attempt.finishedAt ? Date.parse(attempt.finishedAt) + 5000 : Infinity
  const gaps = clipGaps(attempt, playback.gaps)
  const missing = gaps.length > 0 || playback.segments.some(segment => segment.state === 'UPLOADING' && Date.parse(segment.endedAt) > clipStart && Date.parse(segment.startedAt) < clipEnd) ||
    segments.some((segment, position) => position > 0 && Date.parse(segment.startedAt) - Date.parse(segments[position - 1].endedAt) > 1000)
  return <section aria-label={copy.video}>
    <h4>{copy.video}</h4>
    {playback.recording?.error && <p role="status">{playback.recording.error}</p>}
    {expired ? <p>{copy.expired}</p> : current ? <>
      <video key={current.id} controls preload="metadata" playsInline src={current.url!} aria-label={copy.video}
        onLoadedMetadata={event => {
          const saved = position.current?.id === current.id ? position.current : null
          event.currentTarget.currentTime = Math.min(current.to, Math.max(current.from, saved?.time ?? current.from))
          if (continuePlaying.current || saved?.playing) { continuePlaying.current = false; void event.currentTarget.play().catch(() => {}) }
        }}
        onSeeking={event => { const video = event.currentTarget; if (video.currentTime < current.from) video.currentTime = current.from; else if (video.currentTime > current.to) video.currentTime = current.to }}
        onTimeUpdate={event => { const video = event.currentTarget; if (video.readyState > 0) position.current = { id: current.id, time: video.currentTime, playing: !video.paused }; if (video.currentTime >= current.to) { const wasPlaying = !video.paused; video.pause(); if (index + 1 < segments.length) { continuePlaying.current = wasPlaying; setSelectedSegmentId(segments[index + 1].id) } } }}
        onEnded={() => { if (index + 1 < segments.length) { continuePlaying.current = true; setSelectedSegmentId(segments[index + 1].id) } }} />
      <p>{new Date(current.startedAt).toLocaleString()} · {index + 1} / {segments.length}</p>
      {segments.length > 1 && <select aria-label={copy.next} value={current.id} onChange={event => setSelectedSegmentId(event.target.value)}>
        {segments.map(segment => <option key={segment.id} value={segment.id}>{new Date(segment.startedAt).toLocaleTimeString()}</option>)}
      </select>}
    </> : <p>{copy.unavailable}</p>}
    {missing && <p role="status">{copy.gap}</p>}
    {gaps.map((gap, position) => <p key={position}>{new Date(gap.startedAt).toLocaleString()} – {new Date(gap.endedAt).toLocaleTimeString()} · {gap.reason}</p>)}
  </section>
}
