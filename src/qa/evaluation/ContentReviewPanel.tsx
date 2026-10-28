import { useContext, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import type { GameBuild } from '../../projects/gameTypes'
import { WorkspaceContext } from '../../projects/workspace/workspaceContext'
import { createFreeRun } from '../../projects/workspace/dashboard/freeRun'
import type { ContentReview } from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'
import { contentReviewVideoPath } from './contentReviewModel'
import { useContentReviews } from './useContentReviews'

export function ContentReviewBadge({ row }: { row: ContentReview }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  return <span className={`qe-content-badge qe-content-badge--${row.state}`}>{copy[row.state]}</span>
}

export function ContentReviewPanel({ projectId, testCaseId, builds = [], defaultBuildId }: { projectId: string; testCaseId: string; builds?: GameBuild[]; defaultBuildId?: string | null }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const content = useContentReviews(projectId, testCaseId)
  const row = content.rows.find(item => item.testCaseId === testCaseId)
  const [buildId, setBuildId] = useState(defaultBuildId ?? '')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const navigate = useNavigate()
  const workspace = useContext(WorkspaceContext)
  const selectedBuild = builds.some(build => build.id === buildId) ? buildId : builds[0]?.id ?? ''
  const source = row && contentReviewVideoPath(projectId, row)
  if (content.status === 'loading') return <p className="qe-status" role="status">{copy.contentStatus} · {copy.loading}</p>
  if (content.status === 'failed') return <p className="qe-status" role="alert">{copy.contentStatus} · {copy.error} <button className="button button--secondary button--compact" type="button" onClick={() => content.reload()}>{copy.retry}</button></p>
  if (!row) return null
  return <section className="qe-content-panel" aria-label={copy.contentStatus}>
    <div className="qe-head"><h3>{copy.contentStatus}</h3><ContentReviewBadge row={row} /></div>
    <p className="qe-content-reason"><b>{copy.contentReason}</b> {row.note || '—'}</p>
    <div className="qe-links">
      {source && <Link className="button button--secondary button--compact" to={source}>{copy.sourceVideo}</Link>}
      {row.state === 'NEEDS_REVALIDATION' && <>
        <label className="qe-content-build">{copy.revalidationBuild}<select className="qe-select" disabled={busy} value={selectedBuild} onChange={event => setBuildId(event.target.value)}>
          {!builds.length && <option value="">—</option>}
          {builds.map(build => <option key={build.id} value={build.id}>{build.label || build.version}</option>)}
        </select></label>
        <button className="button button--primary button--compact" disabled={busy || !selectedBuild} type="button" onClick={() => {
          setBusy(true); setFailed(false)
          void createFreeRun(projectId, selectedBuild, `TC ${testCaseId} · ${copy.revalidate}`, [testCaseId])
            .then(async runId => { if (workspace?.projectId === projectId) await workspace.refreshRuns(); navigate(`/projects/${encodeURIComponent(projectId)}/qa?${new URLSearchParams({ run: runId })}`) })
            .catch(() => setFailed(true)).finally(() => setBusy(false))
        }}>{copy.revalidate}</button>
      </>}
    </div>
    {failed && <p className="qe-status" role="alert">{copy.error}</p>}
  </section>
}
