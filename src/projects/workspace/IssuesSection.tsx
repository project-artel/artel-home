import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { IssueBoard } from '../../issues/IssueBoard'
import { CategoryManager, CategoryWorkbench } from '../../issues/IssueCategories'
import { useIssueCategories } from '../../issues/useIssueCategories'
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
import { DiscussionIcon } from '../../issues/discussions/discussionIcons'

/**
 * Every defect this project's runs have found, and the team board that discusses them (ARTEL-1114).
 *
 * The all-issues tab is `IssueBoard`: a full-width table that says, on every row, which build, test run and
 * scenario the defect came from, filtered by those same three.
 */
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
  // 팀 공유가 먼저다. 다른 화면이 이슈 하나를 가리켜 열면(`?issue=`) 전체 이슈로 연다.
  const categoriesTab = params.get('tab') === 'categories' && params.get('compose') !== 'new'
  const team =
    !categoriesTab &&
    (params.get('compose') === 'new' ||
      params.get('tab') === 'team' ||
      (params.get('tab') === null && params.get('issue') === null))
  // 카테고리 탭에서 "목록 보기" 로 넘어오면 그 카테고리로 걸러 연다.
  const categoryParam = params.get('category')
  const discussionId = params.get('discussion')
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [membersFailed, setMembersFailed] = useState(false)
  const [selected, setSelected] = useState<Issue[]>([])
  const [compose, setCompose] = useState(false)
  const [editing, setEditing] = useState<DiscussionDetail | undefined>()
  const [revision, setRevision] = useState(0)
  const { categories, reload: reloadCategories } = useIssueCategories(projectId)
  const [managingCategories, setManagingCategories] = useState(false)
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
  // 새 글은 창이 아니라 페이지에서 쓴다(`?compose=new`). 수정은 창으로 연다.
  const composingNew = params.get('compose') === 'new'
  function navigate(tab: 'issues' | 'team' | 'categories', id?: string, composeNew = false, categoryId?: string) {
    const next = new URLSearchParams(params)
    next.delete('issue')
    next.delete('discussion')
    next.delete('compose')
    next.delete('category')
    if (composeNew) next.set('compose', 'new')
    if (tab === 'team') next.delete('tab')
    else next.set('tab', tab)
    if (categoryId) next.set('category', categoryId)
    if (id) next.set('discussion', id)
    setParams(next)
  }
  function openComposer(post?: DiscussionDetail) {
    if (post === undefined) {
      navigate('team', undefined, true)
      return
    }
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
    ({ id, title, severity, status, qaTryId, qaRunId, number }) => ({
      id,
      title,
      severity,
      status,
      qaTryId,
      qaRunId,
      number,
    }),
  )
  return (
    <div className="dc-workspace">
      <div className="dc-tabs-row">
        <nav aria-label={t.issues.page.title} className="dc-tabs">
          <button
            aria-current={team ? 'page' : undefined}
            className="dc-tab"
            onClick={() => navigate('team')}
            type="button"
          >
            {text.team}
          </button>
          <button
            aria-current={!team && !categoriesTab ? 'page' : undefined}
            className="dc-tab"
            onClick={() => navigate('issues')}
            type="button"
          >
            {text.allIssues}
          </button>
          <button
            aria-current={categoriesTab ? 'page' : undefined}
            className="dc-tab"
            onClick={() => navigate('categories')}
            type="button"
          >
            {t.issues.board.categoriesTab}
            <span className="dc-tab-count">{categories.length}</span>
          </button>
        </nav>
        {!composingNew && !categoriesTab && (team || selected.length === 0) && (
          <button
            className="button button--primary dc-with-icon"
            onClick={() => openComposer()}
            type="button"
          >
            <DiscussionIcon name="plus" size={15} />
            {text.newPost}
          </button>
        )}
      </div>
      {composingNew ? (
        <DiscussionComposer
          categories={categories}
          initialIssues={initialIssues}
          key="new"
          members={members}
          membersFailed={membersFailed}
          mode="page"
          onClose={() => navigate('team')}
          onManageCategories={() => setManagingCategories(true)}
          onCategoriesChanged={reloadCategories}
          onSaved={(post) => {
            setSelected([])
            setRevision((value) => value + 1)
            navigate('team', post.id)
          }}
          projectId={projectId}
        />
      ) : categoriesTab ? (
        <section className="cm2-page" aria-label={t.issues.board.categoriesTab}>
          <p className="dc-quiet">{t.issues.board.categoriesTabHelp}</p>
          <CategoryWorkbench
            categories={categories}
            onChanged={reloadCategories}
            onShowIssues={(category) => navigate('issues', undefined, false, category.id)}
            onShowPosts={(category) => navigate('team', undefined, false, category.id)}
            projectId={projectId}
            variant="page"
          />
        </section>
      ) : !team ? (
        <>
          {selected.length > 0 && (
            <div className="dc-selection" role="status">
              <span className="dc-selection-count">
                {selected.length}
                {text.selected}
              </span>
              <button className="dc-link-button" onClick={() => setSelected([])} type="button">
                {text.clear}
              </button>
              <span className="dc-selection-spacer" />
              <button className="button button--primary dc-with-icon" onClick={() => openComposer()} type="button">
                <DiscussionIcon name="messages" size={15} />
                {text.selectedShare}
              </button>
            </div>
          )}
          <IssueBoard
            initialCategoryId={categoryParam}
            key={categoryParam ?? 'all'}
            categories={categories}
            onCategoriesChanged={reloadCategories}
            onManageCategories={() => setManagingCategories(true)}
            focusId={params.get('issue')}
            onClearSelected={() => setSelected([])}
            onToggleSelected={toggle}
            projectId={projectId}
            selectedIds={selected.map((issue) => issue.id)}
            trackerConnected={trackerConnected}
          />
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
          categories={categories}
          initialCategoryId={categoryParam}
          key={`${revision}:${categoryParam ?? ''}`}
          projectId={projectId}
          members={members}
          membersFailed={membersFailed}
          onOpen={(id) => navigate('team', id)}
          onNew={() => openComposer()}
        />
      )}
      {compose && editing && (
        <DiscussionComposer
          key={editing?.id ?? 'new'}
          projectId={projectId}
          members={members}
          membersFailed={membersFailed}
          initialIssues={initialIssues}
          editing={editing}
          categories={categories}
          onCategoriesChanged={reloadCategories}
          onManageCategories={() => setManagingCategories(true)}
          onClose={() => setCompose(false)}
          onSaved={(post) => {
            setCompose(false)
            setSelected([])
            setRevision((value) => value + 1)
            navigate('team', post.id)
          }}
        />
      )}
      {managingCategories && (
        <CategoryManager
          categories={categories}
          onChanged={reloadCategories}
          onClose={() => setManagingCategories(false)}
          projectId={projectId}
        />
      )}
    </div>
  )
}
