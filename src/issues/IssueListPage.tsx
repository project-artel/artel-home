import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { isDecimalId } from '../qa/qaApi'
import { NotFoundPage } from '../NotFoundPage'
import { IssueList } from './IssueList'
import { ISSUE_SEVERITIES, ISSUE_STATUSES, type IssueFilters } from './issueTypes'
import { useProjectIssues } from './useIssues'

export function IssueListRoute() {
  const { projectId } = useParams()
  if (!isDecimalId(projectId)) return <NotFoundPage />
  return <IssueListPage projectId={projectId} />
}

/**
 * Every defect this project's runs have found, in one place.
 *
 * The default filter is unresolved, because the question this page exists to
 * answer is "what is still wrong" — the resolved ones are history and are one
 * select away.
 */
function IssueListPage({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const [filters, setFilters] = useState<IssueFilters>({ status: 'OPEN', severity: 'ALL' })
  const [reloadToken, setReloadToken] = useState(0)
  const issues = useProjectIssues(projectId, filters, reloadToken)

  return (
    <section className="page" aria-labelledby="issues-title">
      <header className="page-header">
        <Link className="back-link" to={`/projects/${projectId}`}>
          {t.issues.page.backToProject}
        </Link>
        <h1 id="issues-title">{t.issues.page.title}</h1>
        <p className="page-subtitle">{t.issues.page.subtitle}</p>
      </header>

      {/* No `aria-labelledby` of its own: the page heading above already names
          this content, and pointing at a heading outside the section is worse
          than leaving it to the page. */}
      <section className="panel">
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
    </section>
  )
}
