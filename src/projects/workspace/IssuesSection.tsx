import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { IssueList } from '../../issues/IssueList'
import { ISSUE_SEVERITIES, ISSUE_STATUSES, type IssueFilters } from '../../issues/issueTypes'
import { useProjectIssues } from '../../issues/useIssues'
import { qaRunPath } from '../../qa/qaTypes'
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
  const { extrasStatus, projectId, trackerLink } = useWorkspace()
  // 다른 화면이 이슈 하나를 가리켜 열면(`?issue=`, ARTEL-1084) 그 이슈가 이미 해결됐을 수 있다.
  // 기본 필터(미해결)로 열면 가리킨 이슈가 안 보이므로 그때는 전체로 연다.
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('issue')
  const [filters, setFilters] = useState<IssueFilters>({ status: focusId === null ? 'OPEN' : 'ALL', severity: 'ALL' })
  const [reloadToken, setReloadToken] = useState(0)
  const issues = useProjectIssues(projectId, filters, reloadToken)
  // `trackerLink` starts `null` until `useWorkspaceExtras`'s five-way read
  // settles (see `DashboardSection`'s own `extrasStatus === 'ready'` guard);
  // without this, a project with an existing connection would flash every
  // row with no tracker UI for a moment before the badges appear.
  const trackerConnected =
    extrasStatus === 'ready' && trackerLink !== null && trackerLink.repository !== null

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
          focusId={focusId}
          hasMore={issues.hasMore}
          issues={issues.items}
          loadingMore={issues.loadingMore}
          onLoadMore={issues.loadMore}
          onRetry={() => setReloadToken((token) => token + 1)}
          patch={issues.patch}
          runHref={(qaRunId, qaTryId) => qaRunPath(projectId, qaRunId, qaTryId)}
          status={issues.status}
          trackerConnected={trackerConnected}
        />
      </section>
    </div>
  )
}
