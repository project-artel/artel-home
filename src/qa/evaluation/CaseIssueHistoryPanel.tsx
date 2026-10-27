import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { issueHistory, type CaseIssueHistory } from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'

export function CaseIssueHistoryPanel({ projectId, issueId }: { projectId: string; issueId: string }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [data, setData] = useState<CaseIssueHistory | null>(null)
  const [error, setError] = useState(false)
  const [more, setMore] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void issueHistory(projectId, issueId, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setData(result); setMore(result.occurrences.length === 100); setError(false) } })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [projectId, issueId, retry])
  if (error) return <p role="alert">{copy.error} <button className="button button--secondary" onClick={() => setRetry(value => value + 1)}>{copy.retry}</button></p>
  if (!data?.testCaseId) return null
  const issueLink = (id: string) => `/projects/${encodeURIComponent(projectId)}/issues?issue=${encodeURIComponent(id)}`
  return <section className="qe-panel">
    <h3>{copy.occurrences}</h3>
    <nav className="qe-links">
      <Link to={`/projects/${encodeURIComponent(projectId)}/test-cases?case=${encodeURIComponent(data.testCaseId)}`}>{copy.testcase} #{data.testCaseId}</Link>
      {data.previousIssueId && <Link to={issueLink(data.previousIssueId)}>{copy.previousIssue} #{data.previousIssueId}</Link>}
      {data.mergedInto && <Link to={issueLink(data.mergedInto)}>{copy.mergedIssue} #{data.mergedInto}</Link>}
    </nav>
    {data.autoClosed && <p>{copy.autoClosed}</p>}
    <ol>{data.occurrences.map(item => <li key={item.attemptId}>
      <p>{item.finishedAt ? new Date(item.finishedAt).toLocaleString() : '—'} · {item.falsePositive ? copy.falsePositive : item.validFailure ? copy.FAILED : copy.INCONCLUSIVE}</p>
      <p>{copy.original}: {item.verdict ? copy[item.verdict] : '—'} · {copy.actual}: {item.review ? copy[item.review] : copy.unreviewed}</p>
      {item.qaRunId ? <Link to={`/projects/${encodeURIComponent(projectId)}/qa-history/${encodeURIComponent(item.qaRunId)}?scenario=${encodeURIComponent(item.qaTryId)}&attempt=${encodeURIComponent(item.attemptId)}`}>{copy.qa} #{item.qaTryId}</Link> : <span>{copy.qa} #{item.qaTryId}</span>}
    </li>)}</ol>
    {more && <button className="button button--secondary" onClick={() => {
      const before = data.occurrences.at(-1)?.logId
      if (!before) return
      void issueHistory(projectId, issueId, undefined, before).then(next => { setData(previous => previous && { ...previous, occurrences: [...previous.occurrences, ...next.occurrences] }); setMore(next.occurrences.length === 100) }).catch(() => setError(true))
    }}>{copy.more}</button>}
  </section>
}
