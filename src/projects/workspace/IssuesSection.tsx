import { useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { IssueList } from '../../issues/IssueList'
import { ISSUE_SEVERITIES, ISSUE_STATUSES, type IssueFilters } from '../../issues/issueTypes'
import { useProjectIssues } from '../../issues/useIssues'
import { useWorkspace } from './workspaceContext'

/**
 * Every defect this project's runs have found.
 *
 * The default filter is unresolved, because the question this section exists to
 * answer is "what is still wrong" — the resolved ones are history and are one
 * select away. Its own paged read stays here rather than moving to the
 * workspace: the filters change what is asked for, and the dashboard only ever
 * needs the unresolved head of the list.
 */
export function IssuesSection() {
  const { t } = useI18n()
  const { projectId } = useWorkspace()
  const [filters, setFilters] = useState<IssueFilters>({ status: 'OPEN', severity: 'ALL' })
  const [reloadToken, setReloadToken] = useState(0)
  const issues = useProjectIssues(projectId, filters, reloadToken)

  return (
    <div className="section-single">
      <section className="panel" aria-label={t.issues.page.title}>
        <p className="section-intro">{t.issues.page.subtitle}</p>

        <div className="issue-filters">
          <label className="issue-filter">
            <span>{t.issues.filters.status}</span>
            <select
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as IssueFilters['status'],
                }))
              }
              value={filters.status}
            >
              <option value="ALL">{t.issues.filters.all}</option>
              {ISSUE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t.issues.statusLabels[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="issue-filter">
            <span>{t.issues.filters.severity}</span>
            <select
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  severity: event.target.value as IssueFilters['severity'],
                }))
              }
              value={filters.severity}
            >
              <option value="ALL">{t.issues.filters.all}</option>
              {ISSUE_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {t.issues.severityLabels[severity]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <IssueList
          filtered={filters.status !== 'ALL' || filters.severity !== 'ALL'}
          hasMore={issues.hasMore}
          issues={issues.items}
          loadingMore={issues.loadingMore}
          onLoadMore={issues.loadMore}
          onRetry={() => setReloadToken((token) => token + 1)}
          patch={issues.patch}
          qaTryHref={(qaTryId) => `/projects/${projectId}/qa-tries/${qaTryId}`}
          status={issues.status}
        />
      </section>
    </div>
  )
}
