import { useI18n } from '../i18n/useI18n'
import { IssueRow } from './IssueRow'
import type { Issue } from './issueTypes'
import { useIssueResolution } from './useIssueResolution'

type IssueListProps = {
  status: 'loading' | 'ready' | 'error'
  issues: Issue[]
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  patch: (issueId: string, next: (issue: Issue) => Issue) => void
  /** Given a run id, where its page is — or null inside that run's own panel. */
  qaTryHref: ((qaTryId: string) => string) | null
  /** True when a filter is narrowing the list, which changes the empty text. */
  filtered: boolean
  onRetry: () => void
}

/**
 * The list itself, shared by the project page and the run panel.
 *
 * It owns the resolve toggle so both surfaces get the same optimistic update
 * and the same rollback; everything above it only supplies rows.
 */
export function IssueList({
  status,
  issues,
  hasMore,
  loadingMore,
  onLoadMore,
  patch,
  qaTryHref,
  filtered,
  onRetry,
}: IssueListProps) {
  const { t } = useI18n()
  const { toggle, pending, failedId } = useIssueResolution(patch)

  if (status === 'loading') {
    return (
      <p className="panel-empty" aria-busy="true">
        {t.issues.list.loading}
      </p>
    )
  }

  if (status === 'error') {
    return (
      <div className="panel-message" role="alert">
        <p className="panel-message-copy">{t.issues.list.loadFailed}</p>
        <button className="button button--secondary" onClick={onRetry} type="button">
          {t.issues.list.retry}
        </button>
      </div>
    )
  }

  if (issues.length === 0) {
    // Two different facts, and confusing them sends people looking for a bug in
    // the wrong place: nothing was ever found, versus nothing matches right now.
    return <p className="panel-empty">{filtered ? t.issues.list.emptyFiltered : t.issues.list.empty}</p>
  }

  return (
    <>
      <ul className="issue-list">
        {issues.map((issue) => (
          <IssueRow
            failed={failedId === issue.id}
            issue={issue}
            key={issue.id}
            onToggle={(target) => void toggle(target)}
            pending={pending.has(issue.id)}
            qaTryHref={qaTryHref === null ? null : qaTryHref(issue.qaTryId)}
          />
        ))}
      </ul>
      {hasMore ? (
        <div className="list-footer">
          <button
            className="button button--secondary"
            disabled={loadingMore}
            onClick={onLoadMore}
            type="button"
          >
            {loadingMore ? t.issues.list.loadingMore : t.issues.list.loadMore}
          </button>
        </div>
      ) : null}
    </>
  )
}
