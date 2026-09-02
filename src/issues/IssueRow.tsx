import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import { parseIssueDetail } from './issueApi'
import { IssueTrackerStatus } from './IssueTrackerStatus'
import type { Issue } from './issueTypes'
import { SeverityTag } from './SeverityTag'

type IssueRowProps = {
  issue: Issue
  /**
   * Builds the run console address from `issue.qaRunId` and `issue.qaTryId`.
   * `null` disables the link entirely — used inside a run's own panel, where
   * a link back would go nowhere. When present but `issue.qaRunId` is `null`,
   * the row shows `t.issues.row.noRun` as plain muted text instead of a link.
   */
  runHref: ((qaRunId: string, qaTryId: string) => string) | null
  onToggle: (issue: Issue) => void
  pending: boolean
  failed: boolean
  /** Whether the project has a connected tracker at all — never derived from `issue.tracker` alone (see `IssueList`). */
  trackerConnected: boolean
  onSync: (issue: Issue) => void
  syncPending: boolean
  syncFailed: boolean
}

/**
 * One defect: what it is, when it was seen, and the one thing a person can do
 * about it.
 *
 * The detail stays folded. A list is for deciding what to look at, and the
 * expected/actual pair only helps once that decision is made.
 */
export function IssueRow({
  issue,
  runHref,
  onToggle,
  pending,
  failed,
  trackerConnected,
  onSync,
  syncPending,
  syncFailed,
}: IssueRowProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const detail = parseIssueDetail(issue.detail)
  const resolved = issue.status === 'RESOLVED'
  // The raw payload is inside the fold too, so a report carrying only fields
  // this app does not name still has a way to be read.
  const hasDetail =
    detail.expected !== null ||
    detail.actual !== null ||
    detail.reproduction.length > 0 ||
    issue.detail !== null

  return (
    <li className={`issue-row ${resolved ? 'issue-row--resolved' : ''}`}>
      <div className="issue-row-head">
        <SeverityTag severity={issue.severity} />
        <span className="issue-row-title">{issue.title}</span>
        <span className={`issue-status issue-status--${issue.status.toLowerCase()}`}>
          {t.issues.statusLabels[issue.status]}
        </span>
      </div>

      <div className="issue-row-meta">
        <span className="mono" translate="no">
          {t.issues.row.reportedAt(formatDateTime(issue.reportedAt))}
        </span>
        {detail.step !== null ? <span>{t.issues.row.step(detail.step)}</span> : null}
        {resolved && issue.resolvedAt !== null ? (
          <span className="mono" translate="no">
            {t.issues.row.resolvedAt(formatDateTime(issue.resolvedAt))}
          </span>
        ) : null}
        {trackerConnected ? <IssueTrackerStatus tracker={issue.tracker} /> : null}
        {runHref !== null ? (
          issue.qaRunId !== null ? (
            <Link className="issue-row-link" to={runHref(issue.qaRunId, issue.qaTryId)}>
              {t.issues.row.openQaTry}
            </Link>
          ) : (
            <span className="issue-row-link issue-row-link--muted">{t.issues.row.noRun}</span>
          )
        ) : null}
      </div>

      <div className="issue-row-actions">
        {trackerConnected && (issue.tracker === null || issue.tracker.syncState === 'FAILED') ? (
          <button
            className="button button--secondary button--compact"
            disabled={syncPending}
            onClick={() => onSync(issue)}
            type="button"
          >
            {syncPending
              ? t.tracker.row.exporting
              : issue.tracker === null
                ? t.tracker.row.export
                : t.tracker.row.retry}
          </button>
        ) : null}
        {hasDetail ? (
          <button
            aria-controls={detailId}
            aria-expanded={open}
            className="button button--secondary button--compact"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            {open ? t.issues.row.hideDetail : t.issues.row.showDetail}
          </button>
        ) : null}
        <button
          className="button button--secondary button--compact"
          disabled={pending}
          onClick={() => onToggle(issue)}
          type="button"
        >
          {pending ? t.issues.row.pending : resolved ? t.issues.row.reopen : t.issues.row.resolve}
        </button>
      </div>

      {failed ? (
        <p className="issue-row-error" role="alert">
          {t.issues.row.failed}
        </p>
      ) : null}

      {syncFailed ? (
        <p className="issue-row-error" role="alert">
          {t.issues.row.failed}
        </p>
      ) : null}

      {open ? (
        <dl className="issue-detail" id={detailId}>
          {detail.expected !== null ? (
            <>
              <dt>{t.issues.row.expected}</dt>
              <dd>{detail.expected}</dd>
            </>
          ) : null}
          {detail.actual !== null ? (
            <>
              <dt>{t.issues.row.actual}</dt>
              <dd>{detail.actual}</dd>
            </>
          ) : null}
          {detail.reproduction.length > 0 ? (
            <>
              <dt>{t.issues.row.reproduction}</dt>
              <dd>
                <ol className="issue-repro">
                  {detail.reproduction.map((step, index) => (
                    <li key={`${index}-${step}`}>{step}</li>
                  ))}
                </ol>
              </dd>
            </>
          ) : null}
          {/* The server does not fix the payload's shape, so whatever the named
              fields did not cover is still here to read. */}
          <dt>{t.issues.row.raw}</dt>
          <dd>
            <pre className="issue-raw mono">{JSON.stringify(issue.detail, null, 2)}</pre>
          </dd>
        </dl>
      ) : null}
    </li>
  )
}
