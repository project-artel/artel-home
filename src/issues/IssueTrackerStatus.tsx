import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import type { IssueTracker } from '../tracker/trackerTypes'

/**
 * The read-only half of a row's tracker state: what already happened.
 *
 * The other half — the export/retry button — lives inline in `IssueRow`,
 * because it renders into a different part of the row's markup
 * (`issue-row-actions`, not `issue-row-meta`) and a single component instance
 * cannot usefully split itself across two sibling elements. This component
 * only ever appears once `IssueRow` already knows the project has a
 * connected tracker; `tracker === null` here means "connected, not exported
 * yet," which has nothing to say in the meta line — the export button is the
 * whole story for that case.
 */
export function IssueTrackerStatus({ tracker }: { tracker: IssueTracker | null }) {
  const { t } = useI18n()

  if (tracker === null) return null

  if (tracker.syncState === 'PENDING') {
    return <span className="mono">{t.tracker.row.syncPending}</span>
  }

  if (tracker.syncState === 'FAILED') {
    return (
      <span className="tracker-sync-failed">
        {t.tracker.row.syncFailed}
        {tracker.syncError !== null && tracker.syncError.length > 0 ? ` — ${tracker.syncError}` : ''}
      </span>
    )
  }

  const label = t.tracker.row.exported(
    t.tracker.providerLabels[tracker.provider],
    tracker.externalKey ?? '?',
  )

  return (
    <>
      {/* `url` is nullable in the contract even for a synced export; a label
          with nowhere to send the reader is still worth showing as text. */}
      {tracker.url !== null ? (
        <a className="issue-row-link" href={tracker.url} rel="noopener noreferrer" target="_blank">
          {label}
        </a>
      ) : (
        <span className="mono" translate="no">{label}</span>
      )}
      {tracker.syncedAt !== null && (
        <span className="mono" translate="no">
          {t.tracker.row.syncedAt(formatDateTime(tracker.syncedAt))}
        </span>
      )}
    </>
  )
}
