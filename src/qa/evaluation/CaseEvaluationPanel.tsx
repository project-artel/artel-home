import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { shortWhen } from '../history/historyModel'
import * as api from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'
import { VerdictPill } from './VerdictPill'
import { clipGaps, clipSegments, evidenceExpired } from './videoEvidence'
import { useProjectChange } from '../../live/useProjectChange'
import './evaluation.css'

const REVIEW_CHOICES = ['PASSED', 'FAILED', 'INCONCLUSIVE'] as const

export function CaseEvaluationPanel({ projectId, qaTryId, testCaseId }: { projectId: string; qaTryId?: string; testCaseId?: string }) {
  return <AttemptList key={`${projectId}:${qaTryId ?? ''}:${testCaseId ?? ''}`} projectId={projectId} qaTryId={qaTryId} testCaseId={testCaseId} />
}

function AttemptList({ projectId, qaTryId, testCaseId }: { projectId: string; qaTryId?: string; testCaseId?: string }) {
  const [params] = useSearchParams()
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const pickId = useId()
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
  const optionLabel = (row: api.Attempt) =>
    `${shortWhen(row.startedAt ?? row.createdAt)} · TC ${row.testCaseId} · ${row.verdict ? copy[row.verdict] : copy.running} → ${row.review ? copy[row.review] : copy.unreviewed}`
  return <section className="qe-panel" aria-label={copy.title}>
    <div className="qe-head">
      <h3>{copy.title}</h3>
      {options.length > 0 && <div className="qe-attempt-pick">
        <label htmlFor={pickId}>{copy.attempt}</label>
        <select className="qe-select" id={pickId} value={current?.id} onChange={event => setSelected(event.target.value)}>
          {options.map(row => <option key={row.id} value={row.id}>{optionLabel(row)}</option>)}
        </select>
      </div>}
    </div>
    {loading && <p className="qe-status" role="status">{copy.loading}</p>}
    {error && <p className="qe-status" role="alert">{copy.error} <button className="button button--secondary button--compact" onClick={() => void load()} type="button">{copy.retry}</button></p>}
    {!loading && !rows.length && <p className="qe-status">{copy.empty}</p>}
    {current && <AttemptReview key={current.id} attempt={current} projectId={projectId} onSaved={() => void load()} />}
    {hasMore && rows.length > 0 && <button className="button button--secondary button--compact qe-more" type="button" onClick={() => {
      void api.attempts(projectId, { qaTryId, testCaseId, before: rows[rows.length - 1].createdAt, beforeId: rows[rows.length - 1].id })
        .then(next => { setRows(previous => [...previous, ...next.filter(row => !previous.some(existing => existing.id === row.id))]); setHasMore(next.length === 100) }).catch(() => setError(true))
    }}>{copy.more}</button>}
  </section>
}

function AttemptReview({ attempt, projectId, onSaved }: { attempt: api.Attempt; projectId: string; onSaved: () => void }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const actualId = useId()
  const [decision, setDecision] = useState<api.Verdict>(attempt.review ?? 'INCONCLUSIVE')
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
  const latest = history[0]
  const snapshot = attempt.caseSnapshot
  const snapshotRows = snapshot ? ([['scene', snapshot.scene], ['precondition', snapshot.precondition], ['step', snapshot.step], ['expected', snapshot.expected]] as const).filter(([, value]) => value) : []
  return <div className="qe-attempt">
    <div className="qe-verdicts">
      <div className="qe-verdict">
        <span className="qe-kicker">{copy.original}</span>
        <div className="qe-verdict-row">
          <VerdictPill verdict={attempt.verdict} copy={copy} empty="running" />
          {attempt.finishedAt && <span className="qe-meta mono">{shortWhen(attempt.finishedAt)}</span>}
        </div>
        {attempt.originalReason && <p className="qe-verdict-text">{attempt.originalReason}</p>}
      </div>
      <div className="qe-verdict">
        <span className="qe-kicker">{copy.human}</span>
        <div className="qe-verdict-row">
          <VerdictPill verdict={attempt.review} copy={copy} empty="unreviewed" />
          {attempt.review && latest && <span className="qe-meta">{shortWhen(latest.decidedAt)}{latest.decidedBy && ` · #${latest.decidedBy}`}</span>}
        </div>
        {attempt.review && attempt.note && <p className="qe-verdict-text">{attempt.note}</p>}
      </div>
    </div>
    <div className="qe-grid">
      <div className="qe-media">
        {!attempt.startedAt && <p className="qe-notice">{copy.unknownStart}</p>}
        {video && <VideoEvidence key={video.recording?.id ?? 'none'} attempt={attempt} playback={video} />}
      </div>
      <div className="qe-info">
        <div className="qe-section">
          {snapshotRows.length > 0 && <dl className="qe-snapshot">
            {snapshotRows.map(([key, value]) => <div key={key}><dt>{copy[key]}</dt><dd>{value}</dd></div>)}
          </dl>}
          <nav className="qe-links" aria-label={copy.snapshot}>
            <Link className="button button--secondary button--compact" to={`/projects/${encodeURIComponent(projectId)}/test-cases?case=${encodeURIComponent(attempt.testCaseId)}`}>{copy.testcase}</Link>
            {attempt.qaRunId
              ? <Link className="button button--secondary button--compact" to={`/projects/${encodeURIComponent(projectId)}/qa-history/${encodeURIComponent(attempt.qaRunId)}?scenario=${encodeURIComponent(attempt.qaTryId)}`}>{copy.qa} #{attempt.qaTryId}</Link>
              : <span className="qe-chip">{copy.qa} <b>#{attempt.qaTryId}</b></span>}
          </nav>
        </div>
        {attempt.logId && <form className="qe-form" onSubmit={event => {
          event.preventDefault(); setBusy(true); setMessage('')
          void api.review(projectId, attempt.logId!, decision, note).then(async () => {
            setHistory(await api.revisions(projectId, attempt.logId!)); setMessage(copy.saved); onSaved()
          }).catch(() => setMessage(copy.error)).finally(() => setBusy(false))
        }}>
          <div className="qe-field">
            <span id={actualId}>{copy.actual}</span>
            {/* 고른 하나만 Tab 에 걸리고, 나머지는 화살표로 옮긴다. 셋이 전부 Tab 정거장이면 이유 칸까지 세 번 눌러야 한다. */}
            <div className="qe-seg" role="radiogroup" aria-labelledby={actualId} onKeyDown={event => {
              const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
              if (step === 0) return
              event.preventDefault()
              const index = REVIEW_CHOICES.indexOf(decision as (typeof REVIEW_CHOICES)[number])
              const next = REVIEW_CHOICES[(index + step + REVIEW_CHOICES.length) % REVIEW_CHOICES.length]
              setDecision(next)
              event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus()
            }}>
              {REVIEW_CHOICES.map(value => <button
                aria-checked={decision === value}
                className="qe-seg-btn"
                data-value={value}
                disabled={busy}
                key={value}
                onClick={() => setDecision(value)}
                role="radio"
                tabIndex={decision === value || !REVIEW_CHOICES.includes(decision as (typeof REVIEW_CHOICES)[number]) && value === REVIEW_CHOICES[0] ? 0 : -1}
                type="button"
              ><i aria-hidden="true" className={value} />{copy[value]}</button>)}
            </div>
          </div>
          <label>{copy.reason}<textarea className="field-input field-input--multiline" maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
          <div className="qe-form-foot">
            <span className="qe-hint">{copy.help}</span>
            <button className="button button--primary button--compact" disabled={busy} type="submit">{copy.save}</button>
          </div>
        </form>}
        {message && <p className="qe-status" role="status">{message}</p>}
        <details className="qe-history"><summary>{copy.history} ({history.length})</summary>
          <ol>{history.map(item => <li key={item.id}>
            <span className="qe-meta mono">{shortWhen(item.decidedAt)}</span>
            <VerdictPill verdict={isVerdict(item.decision) ? item.decision : null} copy={copy} empty="unreviewed" />
            <span className="qe-meta">#{item.decidedBy ?? '—'}</span>
            {item.note && <p>{item.note}</p>}
          </li>)}</ol>
        </details>
      </div>
    </div>
  </div>
}

function isVerdict(value: string): value is api.Verdict {
  return value === 'PASSED' || value === 'FAILED' || value === 'INCONCLUSIVE' || value === 'INTERRUPTED'
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
  const time = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return <section className="qe-media" aria-label={copy.video}>
    {expired ? <p className="qe-notice">{copy.expired}</p> : current ? <>
      <video key={current.id} controls preload="metadata" playsInline src={current.url!} aria-label={copy.video}
        onLoadedMetadata={event => {
          const saved = position.current?.id === current.id ? position.current : null
          event.currentTarget.currentTime = Math.min(current.to, Math.max(current.from, saved?.time ?? current.from))
          if (continuePlaying.current || saved?.playing) { continuePlaying.current = false; void event.currentTarget.play().catch(() => {}) }
        }}
        onSeeking={event => { const video = event.currentTarget; if (video.currentTime < current.from) video.currentTime = current.from; else if (video.currentTime > current.to) video.currentTime = current.to }}
        onTimeUpdate={event => { const video = event.currentTarget; if (video.readyState > 0) position.current = { id: current.id, time: video.currentTime, playing: !video.paused }; if (video.currentTime >= current.to) { const wasPlaying = !video.paused; video.pause(); if (index + 1 < segments.length) { continuePlaying.current = wasPlaying; setSelectedSegmentId(segments[index + 1].id) } } }}
        onEnded={() => { if (index + 1 < segments.length) { continuePlaying.current = true; setSelectedSegmentId(segments[index + 1].id) } }} />
      <div className="qe-media-bar">
        <span className="mono">{shortWhen(current.startedAt)}</span>
        <span>{index + 1} / {segments.length} {copy.segment}</span>
        {segments.length > 1 && <select className="qe-select" aria-label={copy.next} value={current.id} onChange={event => setSelectedSegmentId(event.target.value)}>
          {segments.map(segment => <option key={segment.id} value={segment.id}>{time(segment.startedAt)}</option>)}
        </select>}
      </div>
    </> : <p className="qe-notice">{copy.unavailable}</p>}
    {playback.recording?.error && <p className="qe-notice qe-notice--error" role="status">{playback.recording.error}</p>}
    {missing && <div className="qe-notice" role="status">
      <span>{copy.gap}</span>
      {gaps.length > 0 && <ul>{gaps.map((gap, position) => <li className="mono" key={position}>{time(gap.startedAt)} – {time(gap.endedAt)} · {gap.reason}</li>)}</ul>}
    </div>}
  </section>
}
