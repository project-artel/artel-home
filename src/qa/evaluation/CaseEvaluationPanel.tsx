import { loadAttemptReview } from './loadAttemptReview'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { shortWhen } from '../history/historyModel'
import * as api from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'
import { VerdictPill } from './VerdictPill'
import { clipGaps, clipSegments, evidenceExpired } from './videoEvidence'
import { useProjectChange } from '../../live/useProjectChange'
import { EvidencePlayer } from './EvidencePlayer'
import { CaseAttemptPicker } from './CaseAttemptPicker'
import './evaluation.css'

const REVIEW_CHOICES = ['PASSED', 'FAILED', 'INCONCLUSIVE', 'TC_CONTENT_ISSUE'] as const

export function CaseEvaluationPanel({ projectId, qaTryId, testCaseId, id }: { projectId: string; qaTryId?: string; testCaseId?: string; id?: string }) {
  return <AttemptList key={`${projectId}:${qaTryId ?? ''}:${testCaseId ?? ''}`} projectId={projectId} qaTryId={qaTryId} testCaseId={testCaseId} id={id} />
}

function AttemptList({ projectId, qaTryId, testCaseId, id }: { projectId: string; qaTryId?: string; testCaseId?: string; id?: string }) {
  const [params] = useSearchParams()
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const pickId = useId()
  const [rows, setRows] = useState<api.Attempt[]>([])
  const [selected, setSelected] = useState<string | null>(() => params.get('attempt'))
  const selectedRef = useRef(selected)
  const [linkedAttempt, setLinkedAttempt] = useState<api.Attempt | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const result = await loadAttemptReview(projectId, { qaTryId, testCaseId }, selected, signal); if (!signal?.aborted && selectedRef.current === selected) { setRows(result.rows); setLinkedAttempt(result.linkedAttempt); setHasMore(result.rows.length === 100); setError(false) } }
    catch { if (!signal?.aborted && selectedRef.current === selected) setError(true) }
    finally { if (!signal?.aborted && selectedRef.current === selected) setLoading(false) }
  }, [projectId, qaTryId, testCaseId, selected])
  useProjectChange(projectId, ['QA_RUNS', 'TEST_CASES'], () => void load())
  useEffect(() => {
    const controller = new AbortController()
    void loadAttemptReview(projectId, { qaTryId, testCaseId }, selected, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setRows(result.rows); setLinkedAttempt(result.linkedAttempt); setHasMore(result.rows.length === 100); setError(false) } })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [projectId, qaTryId, testCaseId, selected])
  const options = linkedAttempt?.id === selected && !rows.some(row => row.id === linkedAttempt.id) ? [linkedAttempt, ...rows] : rows
  const current = options.find(row => row.id === selected) ?? rows[0]
  return <section className="qe-panel" aria-label={copy.title} id={id}>
    <div className="qe-head">
      <h3>{copy.title}</h3>
    </div>
    {current && <CaseAttemptPicker id={pickId} options={options} current={current} onSelect={attemptId => {
      selectedRef.current = attemptId
      const picked = options.find(row => row.id === attemptId)
      if (picked) setLinkedAttempt(picked)
      setSelected(attemptId)
    }} copy={copy} />}
    {loading && <p className="qe-status" role="status">{copy.loading}</p>}
    {error && <p className="qe-status" role="alert">{copy.error} <button className="button button--secondary button--compact" onClick={() => void load()} type="button">{copy.retry}</button></p>}
    {!loading && !rows.length && <p className="qe-status">{copy.empty}</p>}
    {current && <div role="tabpanel" id={`${pickId}-panel`} aria-labelledby={`${pickId}-case-${current.testCaseId}`}>
      <AttemptReview key={current.id} attempt={current} projectId={projectId} onSaved={saved => {
        setRows(previous => previous.map(row => row.id === saved.id ? saved : row))
        setLinkedAttempt(previous => selectedRef.current === saved.id || previous?.id === saved.id ? saved : previous)
        void load()
      }} />
    </div>}
    {hasMore && rows.length > 0 && <button className="button button--secondary button--compact qe-more" type="button" onClick={() => {
      void api.attempts(projectId, { qaTryId, testCaseId, before: rows[rows.length - 1].createdAt, beforeId: rows[rows.length - 1].id })
        .then(next => { setRows(previous => [...previous, ...next.filter(row => !previous.some(existing => existing.id === row.id))]); setHasMore(next.length === 100) }).catch(() => setError(true))
    }}>{copy.more}</button>}
  </section>
}

function AttemptReview({ attempt, projectId, onSaved }: { attempt: api.Attempt; projectId: string; onSaved: (saved: api.Attempt) => void }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const actualId = useId()
  const [decision, setDecision] = useState<api.ReviewDecision>(attempt.review ?? 'INCONCLUSIVE')
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
        {video && <VideoEvidence key={`${attempt.id}:${video.recording?.id ?? 'none'}`} attempt={attempt} playback={video} />}
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
            setMessage(copy.saved); window.dispatchEvent(new CustomEvent('artel:case-content-review', { detail: projectId })); onSaved({ ...attempt, review: decision, note })
            try { setHistory(await api.revisions(projectId, attempt.logId!)) } catch { setMessage(copy.historyLoadFailed) }
          }).catch(() => setMessage(copy.error)).finally(() => setBusy(false))
        }}>
          <div className="qe-field">
            <span id={actualId}>{copy.actual}</span>
            {/* 고른 항목만 Tab에 걸리고 나머지는 화살표로 이동한다. */}
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

function isVerdict(value: string): value is api.ReviewDecision {
  return value === 'PASSED' || value === 'FAILED' || value === 'INCONCLUSIVE' || value === 'INTERRUPTED' || value === 'TC_CONTENT_ISSUE'
}

function VideoEvidence({ attempt, playback }: { attempt: api.Attempt; playback: api.Playback }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const segments = clipSegments(attempt, playback.segments)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const expired = evidenceExpired(attempt, playback, now)
  const clipStart = Date.parse(attempt.startedAt ?? attempt.finishedAt ?? attempt.createdAt) - 10000
  const clipEnd = attempt.finishedAt ? Date.parse(attempt.finishedAt) + 5000 : Infinity
  const gaps = clipGaps(attempt, playback.gaps)
  const missing = gaps.length > 0 || playback.segments.some(segment => segment.state === 'UPLOADING' && Date.parse(segment.endedAt) > clipStart && Date.parse(segment.startedAt) < clipEnd) ||
    segments.some((segment, position) => position > 0 && Date.parse(segment.startedAt) - Date.parse(segments[position - 1].endedAt) > 1000)
  const time = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return <section className="qe-media" aria-label={copy.video}>
    {expired ? <p className="qe-notice">{copy.expired}</p> : segments.length > 0
      ? <EvidencePlayer clips={segments} copy={copy} /> : <p className="qe-notice">{copy.unavailable}</p>}
    {playback.recording?.error && <p className="qe-notice qe-notice--error" role="status">{playback.recording.error}</p>}
    {missing && <div className="qe-notice" role="status">
      <span>{copy.gap}</span>
      {gaps.length > 0 && <ul>{gaps.map((gap, position) => <li className="mono" key={position}>{time(gap.startedAt)} – {time(gap.endedAt)} · {gap.reason}</li>)}</ul>}
    </div>}
  </section>
}
