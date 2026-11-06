import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { IssueList } from './IssueList'
import { useTrackerSync } from '../tracker/useTrackerSync'
import { useIssueResolution } from './useIssueResolution'
import { useQaTryIssues } from './useIssues'

/**
 * What this run has filed so far, beside its timeline.
 *
 * Issues arrive as the agent finds them. The run's own log stream is where a
 * reader watches that happen live; this panel is for reading the findings as a
 * list, so it re-reads the list when the project change stream reports
 * `ISSUES`, and polls while that stream is down (`useQaTryIssues`).
 */
export function QaTryIssuePanel({ projectId, qaTryId }: { projectId: string; qaTryId: string }) {
  const { t } = useI18n()
  const [reloadToken, setReloadToken] = useState(0)
  const issues = useQaTryIssues(qaTryId, reloadToken, projectId || null)
  const resolution = useIssueResolution(issues.patch)
  const trackerSync = useTrackerSync(issues.patch)
  const reload = () => setReloadToken((token) => token + 1)

  const count = issues.items.length

  return (
    <section className="panel qa-issue-panel qa-focus-issues" aria-labelledby="qa-issues-title">
      <header className="panel-header panel-header--split">
        <div className="qa-issue-title">
          <h2 id="qa-issues-title">{t.issues.panel.title}</h2>
          {issues.status === 'ready' && count > 0 && (
            <span className="qa-issue-count">{count}{issues.hasMore ? '+' : ''}</span>
          )}
        </div>
      </header>

      <IssueList
        filtered={false}
        hasMore={issues.hasMore}
        issues={issues.items}
        loadingMore={issues.loadingMore}
        onLoadMore={issues.loadMore}
        onRetry={reload}
        resolution={resolution}
        trackerSync={trackerSync}
        // The run is already on screen; a link back to it would go nowhere.
        runHref={null}
        status={issues.status}
        // This panel renders outside the project workspace route, so it has
        // no access to the project's tracker connection state (ARTEL-672
        // plan, Non-goals). No tracker UI here for now.
        trackerConnected={false}
      />
    </section>
  )
}
