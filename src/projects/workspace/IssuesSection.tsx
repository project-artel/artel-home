import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { IssueList } from '../../issues/IssueList'
import { ISSUE_SEVERITIES, ISSUE_STATUSES, type IssueFilters } from '../../issues/issueTypes'
import { useIssueResolution } from '../../issues/useIssueResolution'
import { useProjectIssues } from '../../issues/useIssues'
import { useActionBinding, useFieldBinding } from '../../projectAgent/bindings'
import { requireKnownId } from '../../projectAgent/specs/fieldWriters'
import {
  createIssueStatusRunner,
  createTrackerTicketRunner,
  findListedIssue,
  ISSUES_CREATE_TRACKER_TICKET_ACTION,
  ISSUES_ISSUE_FIELD,
  ISSUES_OPEN_ACTION,
  ISSUES_OPEN_TRACKER_ACTION,
  ISSUES_SET_STATUS_ACTION,
  ISSUES_SEVERITY_FIELD,
  ISSUES_STATUS_FIELD,
  issueIdArg,
  issueOptionLabel,
  trackerUrlOf,
} from '../../projectAgent/specs/issues'
import { qaRunPath } from '../../qa/qaTypes'
import { useTrackerSync } from '../../tracker/useTrackerSync'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('issue')
  const [filters, setFilters] = useState<IssueFilters>({ status: focusId === null ? 'OPEN' : 'ALL', severity: 'ALL' })
  const [reloadToken, setReloadToken] = useState(0)
  // 이미 가리킨 이슈를 사용자가 접은 뒤 agent 가 다시 열어도 행이 펼쳐지도록, 열 때마다 올린다.
  const [focusToken, setFocusToken] = useState(0)
  const issues = useProjectIssues(projectId, filters, reloadToken)
  // `trackerLink` starts `null` until `useWorkspaceExtras`'s five-way read
  // settles (see `DashboardSection`'s own `extrasStatus === 'ready'` guard);
  // without this, a project with an existing connection would flash every
  // row with no tracker UI for a moment before the badges appear.
  const trackerConnected =
    extrasStatus === 'ready' && trackerLink !== null && trackerLink.repository !== null
  const resolution = useIssueResolution(issues.patch)
  const trackerSync = useTrackerSync(issues.patch)
  const panel = useRef<HTMLElement>(null)

  /**
   * 강조할 조작 칸. target 은 args 를 못 받으므로 가리킨 이슈(`?issue=`)의 행을, 없으면 목록 첫 행을 보인다.
   * 칸이 없으면 행, 행도 없으면 목록 전체.
   */
  function issueTarget(control: string): HTMLElement | null {
    const issueId = focusId ?? issues.items[0]?.id ?? null
    if (issueId === null) return panel.current
    const row = panel.current?.querySelector<HTMLElement>(`[data-issue-id="${CSS.escape(issueId)}"]`) ?? null
    return row?.querySelector<HTMLElement>(`[data-issue-action="${control}"]`) ?? row ?? panel.current
  }

  /** 목록이 읽히기 전에는 행이 없다. 화면이 그 자리에 보이는 문구를 그대로 쓴다. */
  function listBlocked(): string | null {
    if (issues.status === 'loading') return t.issues.list.loading
    if (issues.status === 'error') return t.issues.list.loadFailed
    return null
  }

  // 행의 상세 버튼이 하는 일과 같은 결과 — 이슈를 펼치고 그 자리로 간다. 다른 화면이 `?issue=` 로 여는 길을 쓴다.
  function openIssue(issueId: string) {
    findListedIssue(issues.items, issueId)
    setFocusToken((token) => token + 1)
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('issue', issueId)
        return next
      },
      { replace: true },
    )
  }

  useFieldBinding(ISSUES_STATUS_FIELD, {
    target: () => panel.current?.querySelector<HTMLElement>('[data-issue-filter="status"]') ?? null,
    read: () => filters.status,
    options: () => [
      { value: 'ALL', label: t.issues.filters.all },
      ...ISSUE_STATUSES.map((status) => ({ value: status, label: t.issues.statusLabels[status] })),
    ],
    write: (value) => {
      const status = requireKnownId(ISSUES_STATUS_FIELD.name, value, ['ALL', ...ISSUE_STATUSES])
      setFilters((current) => ({ ...current, status: status as IssueFilters['status'] }))
    },
  })

  useFieldBinding(ISSUES_SEVERITY_FIELD, {
    target: () => panel.current?.querySelector<HTMLElement>('[data-issue-filter="severity"]') ?? null,
    read: () => filters.severity,
    options: () => [
      { value: 'ALL', label: t.issues.filters.all },
      ...ISSUE_SEVERITIES.map((severity) => ({ value: severity, label: t.issues.severityLabels[severity] })),
    ],
    write: (value) => {
      const severity = requireKnownId(ISSUES_SEVERITY_FIELD.name, value, ['ALL', ...ISSUE_SEVERITIES])
      setFilters((current) => ({ ...current, severity: severity as IssueFilters['severity'] }))
    },
  })

  useFieldBinding(ISSUES_ISSUE_FIELD, {
    target: () => issueTarget('detail'),
    read: () => focusId,
    options: () => issues.items.map((issue) => ({ value: issue.id, label: issueOptionLabel(issue) })),
    write: (value) => {
      openIssue(
        requireKnownId(
          ISSUES_ISSUE_FIELD.name,
          value,
          issues.items.map((issue) => issue.id),
        ),
      )
    },
  })

  useActionBinding(ISSUES_OPEN_ACTION, {
    target: () => issueTarget('detail'),
    blocked: listBlocked,
    run: async (args) => {
      const issueId = issueIdArg(args)
      openIssue(issueId)
      return { issueId }
    },
  })

  useActionBinding(ISSUES_SET_STATUS_ACTION, {
    target: () => issueTarget('resolve'),
    blocked: listBlocked,
    run: createIssueStatusRunner({ items: () => issues.items, toggle: resolution.toggle }),
  })

  useActionBinding(ISSUES_OPEN_TRACKER_ACTION, {
    target: () => issueTarget('tracker'),
    blocked: listBlocked,
    run: async (args) => {
      const url = trackerUrlOf(findListedIssue(issues.items, issueIdArg(args)))
      window.open(url, '_blank', 'noopener,noreferrer')
      return { url }
    },
  })

  useActionBinding(ISSUES_CREATE_TRACKER_TICKET_ACTION, {
    target: () => issueTarget('export'),
    blocked: listBlocked,
    run: createTrackerTicketRunner({
      items: () => issues.items,
      sync: trackerSync.sync,
      trackerConnected: () => trackerConnected,
    }),
  })

  return (
    <div className="section-single">
      <section className="panel" aria-label={t.issues.page.title} ref={panel}>
        <p className="section-intro">{t.issues.page.subtitle}</p>

        <div className="issue-filters">
          <label className="issue-filter">
            <span>{t.issues.filters.status}</span>
            <select
              data-issue-filter="status"
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
              data-issue-filter="severity"
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
          focusToken={focusToken}
          hasMore={issues.hasMore}
          issues={issues.items}
          loadingMore={issues.loadingMore}
          onLoadMore={issues.loadMore}
          onRetry={() => setReloadToken((token) => token + 1)}
          resolution={resolution}
          trackerSync={trackerSync}
          runHref={(qaRunId, qaTryId) => qaRunPath(projectId, qaRunId, qaTryId)}
          status={issues.status}
          trackerConnected={trackerConnected}
        />
      </section>
    </div>
  )
}
