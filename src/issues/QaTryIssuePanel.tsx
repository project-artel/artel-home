import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { IssueList } from './IssueList'
import { useQaTryIssues } from './useIssues'

/**
 * What this run has filed so far, beside its timeline.
 *
 * Not streamed. Issues arrive as the agent finds them, but the run's own log
 * stream is where a reader watches that happen live; this panel is for reading
 * the findings as a list, so a refresh button is the whole of its liveness.
 */
export function QaTryIssuePanel({ qaTryId }: { qaTryId: string }) {
  const { t } = useI18n()
  const [reloadToken, setReloadToken] = useState(0)
  const issues = useQaTryIssues(qaTryId, reloadToken)
  const reload = () => setReloadToken((token) => token + 1)

  return (
    <section className="panel qa-issue-panel" aria-labelledby="qa-issues-title">
      <header className="panel-header panel-header--split">
        <h2 id="qa-issues-title">{t.issues.panel.title}</h2>
        <button className="button button--secondary button--compact" onClick={reload} type="button">
          {t.issues.panel.refresh}
        </button>
      </header>

      <IssueList
        filtered={false}
        hasMore={issues.hasMore}
        issues={issues.items}
        loadingMore={issues.loadingMore}
        onLoadMore={issues.loadMore}
        onRetry={reload}
        patch={issues.patch}
        // The run is already on screen; a link back to it would go nowhere.
        qaTryHref={null}
        status={issues.status}
      />
    </section>
  )
}
