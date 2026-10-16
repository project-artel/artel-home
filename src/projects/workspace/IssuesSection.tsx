import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { IssueList } from '../../issues/IssueList'
import {
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  type IssueFilters,
} from '../../issues/issueTypes'
import { useProjectIssues } from '../../issues/useIssues'
import { qaRunPath } from '../../qa/qaTypes'
import { useWorkspace } from './workspaceContext'
import { useAuth } from '../../auth/useAuth'
import { listMembers } from '../memberApi'
import type { ProjectMember } from '../memberTypes'
import type { Issue } from '../../issues/issueTypes'
import { DiscussionBoard } from '../../issues/discussions/DiscussionBoard'
import { DiscussionComposer } from '../../issues/discussions/DiscussionComposer'
import { DiscussionThread } from '../../issues/discussions/DiscussionThread'
import type {
  DiscussionDetail,
  LinkedIssue,
} from '../../issues/discussions/discussionTypes'
import '../../issues/discussions/discussions.css'

/**
 * Every defect this project's runs have found.
 *
 * The default filter is unresolved, because the question this section exists to
 * answer is "what is still wrong" — the resolved ones are history and are one
 * select away. Its own paged read stays here rather than moving to the
 * workspace: the filters change what is asked for, and the dashboard only ever
 * needs the unresolved head of the list.
 */
function AllIssues({
  selected,
  onToggle,
}: {
  selected: Issue[]
  onToggle: (issue: Issue) => void
}) {
  const { t } = useI18n()
  const { extrasStatus, projectId, trackerLink } = useWorkspace()
  // 다른 화면이 이슈 하나를 가리켜 열면(`?issue=`, ARTEL-1084) 그 이슈가 이미 해결됐을 수 있다.
  // 기본 필터(미해결)로 열면 가리킨 이슈가 안 보이므로 그때는 전체로 연다.
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('issue')
  const [filters, setFilters] = useState<IssueFilters>({
    status: focusId === null ? 'OPEN' : 'ALL',
    severity: 'ALL',
  })
  const [reloadToken, setReloadToken] = useState(0)
  const issues = useProjectIssues(projectId, filters, reloadToken)
  // `trackerLink` starts `null` until `useWorkspaceExtras`'s five-way read
  // settles (see `DashboardSection`'s own `extrasStatus === 'ready'` guard);
  // without this, a project with an existing connection would flash every
  // row with no tracker UI for a moment before the badges appear.
  const trackerConnected =
    extrasStatus === 'ready' &&
    trackerLink !== null &&
    trackerLink.repository !== null

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
          selection={{ ids: selected.map((issue) => issue.id), onToggle }}
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

export function IssuesSection() {
  const { projectId } = useWorkspace()
  const auth = useAuth()
  return (
    <IssueWorkspace
      key={`${projectId}:${auth.status === 'authenticated' ? auth.user.id : ''}`}
    />
  )
}

function IssueWorkspace() {
  const { t } = useI18n()
  const text = t.discussions
  const { projectId, extrasStatus, trackerLink } = useWorkspace()
  const trackerConnected =
    extrasStatus === 'ready' &&
    trackerLink !== null &&
    trackerLink.repository !== null
  const [params, setParams] = useSearchParams()
  const team = params.get('tab') === 'team'
  const discussionId = params.get('discussion')
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [membersFailed, setMembersFailed] = useState(false)
  const [selected, setSelected] = useState<Issue[]>([])
  const [compose, setCompose] = useState(false)
  const [editing, setEditing] = useState<DiscussionDetail | undefined>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void listMembers(projectId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setMembers(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setMembersFailed(true)
      })
    return () => controller.abort()
  }, [projectId])
  function navigate(tab: 'issues' | 'team', id?: string) {
    const next = new URLSearchParams(params)
    next.delete('issue')
    next.delete('discussion')
    if (tab === 'team') next.set('tab', 'team')
    else next.delete('tab')
    if (id) next.set('discussion', id)
    setParams(next)
  }
  function openComposer(post?: DiscussionDetail) {
    setEditing(post)
    setCompose(true)
  }
  function toggle(issue: Issue) {
    setSelected((current) =>
      current.some((item) => item.id === issue.id)
        ? current.filter((item) => item.id !== issue.id)
        : current.length < 50
          ? [...current, issue]
          : current,
    )
  }
  const initialIssues: LinkedIssue[] = selected.map(
    ({ id, title, severity, status, qaTryId, qaRunId }) => ({
      id,
      title,
      severity,
      status,
      qaTryId,
      qaRunId,
    }),
  )
  return (
    <div className="discussion-workspace">
      <header className="discussion-page-header">
        <div>
          <p>{text.intro}</p>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => openComposer()}
        >
          {text.newPost}
        </button>
      </header>
      <nav className="discussion-tabs" aria-label={t.issues.page.title}>
        <button
          type="button"
          aria-current={!team ? 'page' : undefined}
          onClick={() => navigate('issues')}
        >
          {text.allIssues}
        </button>
        <button
          type="button"
          aria-current={team ? 'page' : undefined}
          onClick={() => navigate('team')}
        >
          {text.team}
        </button>
        <small>{text.sharedWith}</small>
      </nav>
      {!team ? (
        <>
          <div className="discussion-selection">
            <span>
              {selected.length
                ? `${selected.length} ${text.selected}`
                : text.selectionHint}
            </span>
            {selected.length > 0 && (
              <>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => openComposer()}
                >
                  {text.selectedShare}
                </button>
                <button type="button" onClick={() => setSelected([])}>
                  {text.clear}
                </button>
              </>
            )}
          </div>
          <AllIssues selected={selected} onToggle={toggle} />
        </>
      ) : discussionId ? (
        <DiscussionThread
          key={`${discussionId}:${revision}`}
          projectId={projectId}
          discussionId={discussionId}
          members={members}
          membersFailed={membersFailed}
          trackerConnected={trackerConnected}
          onBack={() => navigate('team')}
          onEdit={openComposer}
        />
      ) : (
        <DiscussionBoard
          key={revision}
          projectId={projectId}
          members={members}
          membersFailed={membersFailed}
          onOpen={(id) => navigate('team', id)}
          onNew={() => openComposer()}
        />
      )}
      {compose && (
        <DiscussionComposer
          key={editing?.id ?? 'new'}
          projectId={projectId}
          members={members}
          membersFailed={membersFailed}
          initialIssues={initialIssues}
          editing={editing}
          onClose={() => setCompose(false)}
          onSaved={(post) => {
            setCompose(false)
            setSelected([])
            setRevision((value) => value + 1)
            navigate('team', post.id)
          }}
        />
      )}
    </div>
  )
}
