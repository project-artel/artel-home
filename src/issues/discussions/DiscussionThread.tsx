import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../design-system/primitives/Dialog'
import { InfoHint } from '../../design-system/primitives/InfoHint'
import { useAuth } from '../../auth/useAuth'
import { useI18n } from '../../i18n/useI18n'
import type { ProjectMember } from '../../projects/memberTypes'
import { formatDateTime } from '../../projects/formatters'
import { ProjectApiError } from '../../projects/projectApi'
import { qaRunPath } from '../../qa/qaTypes'
import { IssueList } from '../IssueList'
import type { Issue, IssueSeverity } from '../issueTypes'
import { SeverityTag } from '../SeverityTag'
import {
  getDiscussion,
  getOriginalIssue,
  listComments,
  reactToComment,
  approveDiscussion,
  deleteComment,
  saveComment,
  setDiscussion,
} from './discussionApi'
import { ConfirmActionDialog } from '../../design-system/primitives/ConfirmActionDialog'
import { CategoryChip } from '../IssueCategories'
import { TestCaseSpecModal } from '../../testCases/TestCaseSpecModal'
import type { TestCase } from '../../testCases/testCaseTypes'
import { CaseRefsProvider } from './CaseRefsProvider'
import { MarkdownEditor } from './MarkdownEditor'
import { MarkdownView } from './MarkdownView'
import { CommentsSketch } from '../issueSketches'
import { DiscussionIcon } from './discussionIcons'
import { Avatar, PinnedMark, PurposeTag, StateTag } from './discussionParts'
import type { Comment, DiscussionDetail, Person } from './discussionTypes'
import { useDiscussionPage } from './useDiscussionPage'

export function Mentioned({ people }: { people: Person[] }) {
  return people.length ? (
    <div className="dc-mentioned">
      {people.map((person) => (
        <span className="dc-mentioned-chip" key={person.id} title={person.displayName}>
          @{person.displayName}
        </span>
      ))}
    </div>
  ) : null
}

export function OriginalReport({
  projectId,
  issueId,
  trackerConnected,
  onClose,
}: {
  projectId: string
  issueId: string
  trackerConnected: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const text = t.discussions
  const [issue, setIssue] = useState<Issue | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void getOriginalIssue(projectId, issueId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setIssue(value)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [projectId, issueId, revision])
  return (
    <Dialog
      title={`${text.readReport} #${issueId}`}
      labelledBy="discussion-report-title"
      onClose={onClose}
    >
      <IssueList
        status={status}
        issues={issue ? [issue] : []}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => {}}
        patch={(_, next) =>
          setIssue((current) => (current ? next(current) : current))
        }
        runHref={(runId, tryId) => qaRunPath(projectId, runId, tryId)}
        filtered={false}
        onRetry={() => {
          setStatus('loading')
          setRevision((value) => value + 1)
        }}
        trackerConnected={trackerConnected}
        focusId={issueId}
      />
      <div className="dc-report-foot">
        <button className="button button--secondary" onClick={onClose} type="button">
          {text.close}
        </button>
      </div>
    </Dialog>
  )
}

export function DiscussionThread({
  projectId,
  discussionId,
  members,
  membersFailed,
  trackerConnected,
  onBack,
  onEdit,
}: {
  projectId: string
  discussionId: string
  members: ProjectMember[]
  membersFailed: boolean
  trackerConnected: boolean
  onBack: () => void
  onEdit: (post: DiscussionDetail) => void
}) {
  const { t } = useI18n()
  const text = t.discussions
  const [post, setPost] = useState<DiscussionDetail | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState<string[]>([])
  const [recentlySaved, setRecentlySaved] = useState<string[]>([])
  const [editing, setEditing] = useState<Comment | undefined>()
  /** 답글을 다는 최상위 댓글. 있으면 입력칸이 그 댓글 아래로 간다. */
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [reopening, setReopening] = useState(false)
  const [deletingComment, setDeletingComment] = useState<Comment | null>(null)
  const [openCase, setOpenCase] = useState<TestCase | null>(null)
  const auth = useAuth()
  const myId = auth.status === 'authenticated' ? auth.user.id : null
  const [report, setReport] = useState<string | null>(null)
  const requestKey = useRef({ payload: '', id: crypto.randomUUID() })
  const readGeneration = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const load = useCallback(
    (cursor: string | undefined, signal: AbortSignal) =>
      listComments(projectId, discussionId, cursor, signal),
    [projectId, discussionId],
  )
  const comments = useDiscussionPage(load)
  useEffect(() => {
    const controller = new AbortController()
    const generation = ++readGeneration.current
    void getDiscussion(projectId, discussionId, controller.signal)
      .then((value) => {
        if (
          !controller.signal.aborted &&
          generation === readGeneration.current
        ) {
          setPost(value)
          setLoadError(false)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && generation === readGeneration.current)
          setLoadError(true)
      })
    return () => controller.abort()
  }, [projectId, discussionId, revision])
  async function mutate(action: () => Promise<void>) {
    if (pending) return
    readGeneration.current += 1
    setPending(true)
    setError(null)
    setNotice('')
    try {
      await action()
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof ProjectApiError && failure.status === 409
            ? text.conflict
            : text.saveFailed,
        )
    } finally {
      if (mounted.current) setPending(false)
    }
  }
  const change = (
    action: 'state' | 'pin' | 'decision' | 'subscription',
    value:
      | { enabled: boolean }
      | { state: 'DRAFT' | 'OPEN' | 'CLOSED' }
      | { commentId: string | null },
  ) =>
    void mutate(async () => {
      const next = await setDiscussion(projectId, discussionId, action, value)
      if (mounted.current) {
        setPost(next)
        setNotice(text.changed)
      }
    })
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim() || comments.status !== 'ready') return
    const payload = JSON.stringify({
      body: body.trim(),
      mentions,
      editing: editing?.id,
      replyTo,
    })
    if (requestKey.current.payload !== payload)
      requestKey.current = { payload, id: crypto.randomUUID() }
    void mutate(async () => {
      const saved = await saveComment(
        projectId,
        discussionId,
        body.trim(),
        mentions,
        requestKey.current.id,
        editing,
        replyTo,
      )
      if (!mounted.current) return
      setBody('')
      setMentions([])
      setEditing(undefined)
      setReplyTo(null)
      requestKey.current = { payload: '', id: crypto.randomUUID() }
      comments.setItems((items) =>
        items.some((item) => item.id === saved.id)
          ? items.map((item) => (item.id === saved.id ? saved : item))
          : [...items, saved],
      )
      if (!editing) setRecentlySaved((ids) => [...ids, saved.id])
      setRevision((value) => value + 1)
      setNotice(text.changed)
    })
  }
  const approve = (approved: boolean) =>
    void mutate(async () => {
      const next = await approveDiscussion(projectId, discussionId, approved)
      if (mounted.current) {
        setPost(next)
        setNotice(text.changed)
      }
    })
  if (loadError)
    return (
      <div className="dc-empty" role="alert">
        <p>{text.failed}</p>
        <div className="dc-empty-actions">
          <button className="button button--secondary" onClick={() => setRevision((value) => value + 1)} type="button">
            {text.retry}
          </button>
          <button className="button button--secondary" onClick={onBack} type="button">
            {text.back}
          </button>
        </div>
      </div>
    )
  if (!post)
    return (
      <p aria-busy="true" className="dc-quiet dc-pad">
        {text.loading}
      </p>
    )
  const subscribeLabel = post.subscribed ? text.unfollow : text.follow
  const approvers = post.reviewers.filter((reviewer) => reviewer.approvedAt !== null)
  const approvedCount = approvers.length
  const iApproved = approvers.some((reviewer) => reviewer.person.id === myId)
  const ordered = [...comments.items].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
  const topLevel = ordered.filter((comment) => comment.parentId === null || !ordered.some((one) => one.id === comment.parentId))
  const repliesOf = new Map<string, Comment[]>()
  for (const comment of ordered)
    if (comment.parentId !== null && ordered.some((one) => one.id === comment.parentId))
      repliesOf.set(comment.parentId, [...(repliesOf.get(comment.parentId) ?? []), comment])

  function renderComment(comment: Comment) {
    const isDecision = post?.decision?.id === comment.id
    if (post === null) return null
    return (
                    <article className={`dc-comment${isDecision ? ' is-decision' : ''}${comment.parentId ? ' is-reply' : ''}`}>
                      <Avatar person={comment.author} />
                      <div className="dc-comment-main">
                        {comments.hasMore && recentlySaved.includes(comment.id) && (
                          <small className="dc-quiet">{text.savedWithHistory}</small>
                        )}
                        <header className="dc-comment-head">
                          <strong>{comment.author.displayName}</strong>
                          <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                          {isDecision && (
                            <span className="dc-decision-mark">
                              <DiscussionIcon name="seal" size={13} />
                              {text.decision}
                            </span>
                          )}
                        </header>
                        <div className="dc-comment-body">
                          <MarkdownView mentions={comment.mentions.map((person) => person.displayName)} source={comment.body} />
                        </div>
                        <Mentioned people={comment.mentions} />
                        <div className="dc-comment-actions">
                          <button
                            aria-pressed={comment.reacted}
                            className="dc-mini"
                            disabled={pending}
                            onClick={() =>
                              void mutate(async () => {
                                const updated = await reactToComment(
                                  projectId,
                                  discussionId,
                                  comment.id,
                                  !comment.reacted,
                                )
                                if (mounted.current)
                                  comments.setItems((items) =>
                                    items.map((item) => (item.id === updated.id ? updated : item)),
                                  )
                              })
                            }
                            type="button"
                          >
                            <DiscussionIcon name="heart" size={13} />
                            {text.like}
                            {comment.reactionCount > 0 && <span className="dc-tag">{comment.reactionCount}</span>}
                          </button>
                          {post.canManage && (
                            <button
                              className="dc-mini"
                              disabled={pending}
                              onClick={() =>
                                change('decision', { commentId: isDecision ? null : comment.id })
                              }
                              type="button"
                            >
                              <DiscussionIcon name="seal" size={13} />
                              {isDecision ? text.clearDecision : text.chooseDecision}
                            </button>
                          )}
                          {comment.parentId === null && post.state !== 'DRAFT' && (
                            <button
                              className="dc-mini"
                              disabled={pending}
                              onClick={() => {
                                setEditing(undefined)
                                setReplyTo(comment.id)
                                setBody('')
                                setMentions([])
                              }}
                              type="button"
                            >
                              <DiscussionIcon name="reply" size={13} />
                              {text.reply}
                            </button>
                          )}
                          {comment.canEdit && (
                            <button
                              className="dc-mini"
                              disabled={pending}
                              onClick={() => {
                                setEditing(comment)
                                setReplyTo(comment.parentId)
                                setBody(comment.body)
                                setMentions(comment.mentions.map((person) => person.id))
                                document.getElementById('discussion-comment-input')?.focus()
                              }}
                              type="button"
                            >
                              <DiscussionIcon name="pencil" size={13} />
                              {text.edit}
                            </button>
                          )}
                          {comment.canDelete && (
                            <button
                              className="dc-mini dc-mini--danger"
                              disabled={pending}
                              onClick={() => setDeletingComment(comment)}
                              type="button"
                            >
                              <DiscussionIcon name="trash" size={13} />
                              {text.deleteComment}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
    )
  }

  function renderForm() {
    return (
            <form className={`dc-reply${editing ? ' is-editing' : ''}`} onSubmit={submit}>
              <label className="visually-hidden" htmlFor="discussion-comment-input">
                {editing ? text.edit : text.comments}
              </label>
              {editing && (
                <p className="dc-reply-editing">
                  <DiscussionIcon name="pencil" size={13} />
                  {text.editingComment}
                </p>
              )}
              <MarkdownEditor
                autoFocus={replyTo !== null}
                compact
                disabled={pending}
                footer={
                  <button className="dc-ghost" disabled title={text.attachSoon} type="button">
                    <DiscussionIcon name="image" size={15} />
                    {text.attach}
                    <span className="dc-soon">{text.soon}</span>
                  </button>
                }
                id="discussion-comment-input"
                maxLength={10000}
                members={membersFailed ? [] : members}
                mentions={mentions}
                onChange={setBody}
                onMentionsChange={setMentions}
                placeholder={replyTo ? text.replyPlaceholder : text.commentPlaceholder}
                required
                rows={replyTo ? 3 : 4}
                value={body}
              />
              <div className="dc-reply-foot">
                <div className="dc-reply-buttons">
                  {(editing || replyTo) && (
                    <button
                      className="button button--secondary"
                      disabled={pending}
                      onClick={() => {
                        setEditing(undefined)
                        setReplyTo(null)
                        setBody('')
                        setMentions([])
                      }}
                      type="button"
                    >
                      {editing ? text.cancelEdit : text.cancel}
                    </button>
                  )}
                  <button
                    className="button button--primary"
                    disabled={pending || comments.status !== 'ready' || !body.trim()}
                    type="submit"
                  >
                    {pending ? text.saving : editing ? text.save : replyTo ? text.reply : text.send}
                  </button>
                </div>
              </div>
            </form>
    )
  }

  // 본문 · 댓글의 TC 는 글의 빌드 버전에 든 것이다.
  const caseScope = post.buildVersion ? text.caseScope(post.buildVersion) : text.caseScopeAll
  return (
    <CaseRefsProvider gameBuildId={post.gameBuildId} onOpen={setOpenCase} projectId={projectId} scope={caseScope}>
    <div className="dc-thread">
      <div className="dc-thread-bar">
        <button className="dc-ghost" onClick={onBack} type="button">
          <DiscussionIcon name="back" size={15} />
          {text.back}
        </button>
        <div className="dc-thread-tools">
          <button
            aria-pressed={post.subscribed}
            className="dc-ghost"
            disabled={pending}
            onClick={() => change('subscription', { enabled: !post.subscribed })}
            title={text.subscriptionHelp}
            type="button"
          >
            <DiscussionIcon name="bell" size={15} />
            {subscribeLabel}
          </button>
          <button
            className="dc-ghost"
            onClick={() =>
              void navigator.clipboard
                .writeText(window.location.href)
                .then(() => setNotice(text.copied))
                .catch(() => setError(text.copyFailed))
            }
            type="button"
          >
            <DiscussionIcon name="copy" size={15} />
            {text.copy}
          </button>
          {post.canPin && (
            <button
              aria-pressed={post.pinned}
              className="dc-ghost"
              disabled={pending}
              onClick={() => change('pin', { enabled: !post.pinned })}
              type="button"
            >
              <DiscussionIcon name="pin" size={15} />
              {post.pinned ? text.unpin : text.pin}
            </button>
          )}
          {post.canEdit && (
            <button className="dc-ghost" disabled={pending} onClick={() => onEdit(post)} type="button">
              <DiscussionIcon name="pencil" size={15} />
              {text.edit}
            </button>
          )}
          <button
            aria-label={text.refresh}
            className="dc-ghost dc-ghost--icon"
            disabled={pending}
            onClick={() => {
              setRevision((value) => value + 1)
              comments.refresh()
            }}
            title={text.refresh}
            type="button"
          >
            <DiscussionIcon name="refresh" size={15} />
          </button>
          {post.canManage && (
            <span className="dc-conclude">
              {post.state === 'DRAFT' ? (
                <button
                  className="button button--primary"
                  disabled={pending}
                  onClick={() => change('state', { state: 'OPEN' })}
                  title={text.draftHint}
                  type="button"
                >
                  {text.publishDraft}
                </button>
              ) : post.purpose === 'QUESTION' && post.state === 'OPEN' ? (
                <span className="dc-approval-gate" title={text.approvalGate}>
                  <DiscussionIcon name="seal" size={14} />
                  {text.approvals(approvedCount, post.approvalsRequired)}
                </span>
              ) : (
                <button
                  className="button button--secondary dc-with-icon"
                  disabled={pending}
                  onClick={() => (post.state === 'OPEN' ? change('state', { state: 'CLOSED' }) : setReopening(true))}
                  type="button"
                >
                  {post.state === 'OPEN' && <DiscussionIcon name="check" size={15} />}
                  {post.state === 'OPEN' ? text.conclude : text.reopen}
                </button>
              )}
              <InfoHint label={text.independent}>{text.independent}</InfoHint>
            </span>
          )}
        </div>
      </div>

      <div className="dc-thread-grid">
        <article className="dc-article">
          <div className="dc-post-tags">
            <PurposeTag purpose={post.purpose} />
            <StateTag state={post.state} />
            {post.pinned && <PinnedMark />}
            {post.buildVersion && (
              <span className="ib-version" title={text.buildVersion}>
                {post.buildVersion}
              </span>
            )}
          </div>
          <h2 className="dc-article-title">
            {post.number && <span className="dc-article-no">#{post.number}</span>}
            {post.title}
          </h2>
          {post.categories.length > 0 && (
            <div className="dc-post-categories">
              {post.categories.map((category) => (
                <CategoryChip key={category.id} tag={category} />
              ))}
            </div>
          )}
          <p className="dc-post-meta">
            <Avatar person={post.author} size="sm" />
            <span>{post.author.displayName}</span>
            <span aria-hidden="true" className="dc-dot" />
            <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
          </p>
          <div className="dc-body">
            <MarkdownView mentions={post.mentions.map((person) => person.displayName)} source={post.body} />
          </div>
          <Mentioned people={post.mentions} />

          {!post.decision && (
            <section className="dc-decision dc-decision--empty">
              <header>
                <DiscussionIcon name="seal" size={16} />
                <h3>{text.decision}</h3>
              </header>
              <p>{text.noDecision}</p>
              {post.canManage && <p className="dc-quiet">{text.noDecisionHint}</p>}
            </section>
          )}
          {post.decision && (
            <section className="dc-decision">
              <header>
                <DiscussionIcon name="seal" size={16} />
                <h3>{text.decision}</h3>
                <span className="dc-decision-by">{post.decision.author.displayName}</span>
                {post.canManage && (
                  <button
                    className="dc-link-button"
                    disabled={pending}
                    onClick={() => change('decision', { commentId: null })}
                    type="button"
                  >
                    {text.clearDecision}
                  </button>
                )}
              </header>
              <MarkdownView mentions={post.decision.mentions.map((person) => person.displayName)} source={post.decision.body} />
            </section>
          )}

          <section className="dc-comments">
            <h3 className="dc-section-title">
              {text.comments} <span className="dc-tag">{post.commentCount}</span>
            </h3>
            {comments.status === 'loading' && (
              <p aria-busy="true" className="dc-quiet">
                {text.loading}
              </p>
            )}
            {comments.status === 'error' && (
              <p className="dc-error" role="alert">
                {text.failed}{' '}
                <button className="dc-link-button" onClick={comments.refresh} type="button">
                  {text.retry}
                </button>
              </p>
            )}
            {comments.status === 'ready' && comments.items.length === 0 && (
              <div className="dc-sketch-empty dc-sketch-empty--inline">
                <CommentsSketch />
                <p className="dc-sketch-help">{text.noComments}</p>
              </div>
            )}
            <ol className="dc-comment-list">
              {topLevel.map((comment) => (
                <li className="dc-thread-item" key={comment.id}>
                  {renderComment(comment)}
                  {(repliesOf.get(comment.id)?.length ?? 0) > 0 && (
                    <ol className="dc-replies">
                      {repliesOf.get(comment.id)!.map((reply) => (
                        <li key={reply.id}>{renderComment(reply)}</li>
                      ))}
                    </ol>
                  )}
                  {replyTo === comment.id && <div className="dc-replies dc-replies--form">{renderForm()}</div>}
                </li>
              ))}
            </ol>
            {comments.moreFailed && (
              <p className="dc-error" role="alert">
                {text.failed}
              </p>
            )}
            {comments.hasMore && (
              <button
                className="button button--secondary dc-more"
                disabled={comments.loadingMore}
                onClick={() => void comments.loadMore()}
                type="button"
              >
                {comments.loadingMore ? text.loading : text.more}
              </button>
            )}

            {replyTo === null && renderForm()}
          </section>
        </article>

        <aside className="dc-side">
          {post.purpose === 'QUESTION' && (
            <section className="dc-side-section">
              <h3 className="dc-side-title">
                {text.approvalTitle}
                <span className="dc-tag">{text.approvals(approvedCount, post.approvalsRequired)}</span>
              </h3>
              <div
                aria-hidden="true"
                className="dc-approval-bar"
                style={{ ['--done' as string]: `${Math.min(100, (approvedCount / post.approvalsRequired) * 100)}%` }}
              />
              {approvers.length === 0 ? (
                <p className="dc-quiet">{text.noApprovals}</p>
              ) : (
                <ul className="dc-reviewers">
                  {approvers.map((reviewer) => (
                    <li key={reviewer.person.id}>
                      <Avatar person={reviewer.person} size="sm" />
                      <span className="dc-member-name">{reviewer.person.displayName}</span>
                      <span className="dc-review-state is-approved">
                        <DiscussionIcon name="check" size={13} />
                        {text.approved}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {post.canApprove && (
                <button
                  className={iApproved ? 'button button--secondary' : 'button button--primary dc-with-icon'}
                  disabled={pending}
                  onClick={() => approve(!iApproved)}
                  type="button"
                >
                  {iApproved ? text.unapprove : (
                    <>
                      <DiscussionIcon name="check" size={15} />
                      {text.approve}
                    </>
                  )}
                </button>
              )}
              <p className="dc-quiet">{post.state === 'CLOSED' ? text.approvalDone : text.approvalGate}</p>
            </section>
          )}
          <section className="dc-side-section">
            <h3 className="dc-side-title">
              {text.linked} <span className="dc-tag">{post.issues.length}</span>
            </h3>
            {post.issues.length === 0 && <p className="dc-quiet">{text.noLinks}</p>}
            <ul className="dc-linked">
              {post.issues.map((issue) => (
                <li key={issue.id}>
                  <button className="dc-linked-issue" onClick={() => setReport(issue.id)} type="button">
                    <span className="dc-option-meta">
                      <span className="dc-tag">#{issue.number ?? issue.id}</span>
                      <SeverityTag severity={issue.severity as IssueSeverity} />
                      <span className={`dc-issue-status dc-issue-status--${issue.status.toLowerCase()}`}>
                        {issue.status === 'RESOLVED' ? t.issues.statusLabels.RESOLVED : t.issues.statusLabels.OPEN}
                      </span>
                    </span>
                    <span className="dc-option-title">{issue.title}</span>
                    <span className="dc-linked-open">
                      {text.original}
                      <DiscussionIcon name="external" size={12} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      {error && (
        <p className="dc-error dc-feedback" role="alert">
          {error}
        </p>
      )}
      <p className="dc-notice" role="status">
        {notice}
      </p>
      {deletingComment && (
        <ConfirmActionDialog
          body={text.deleteCommentBody}
          cancelLabel={text.cancel}
          confirmLabel={text.deleteComment}
          onClose={() => setDeletingComment(null)}
          onConfirm={async () => {
            const target = deletingComment
            await deleteComment(projectId, discussionId, target.id)
            if (!mounted.current) return
            comments.setItems((items) => items.filter((item) => item.id !== target.id && item.parentId !== target.id))
            if (editing?.id === target.id || replyTo === target.id) {
              setEditing(undefined)
              setReplyTo(null)
              setBody('')
            }
            setDeletingComment(null)
            setRevision((value) => value + 1)
            setNotice(text.changed)
          }}
          pendingLabel={text.deleting}
          title={text.deleteCommentTitle}
          toFailureMessage={() => text.saveFailed}
        />
      )}
      {reopening && (
        <ConfirmActionDialog
          body={<><strong>{post.title}</strong>{text.reopenBody}</>}
          cancelLabel={text.cancel}
          confirmLabel={text.reopenConfirm}
          onClose={() => setReopening(false)}
          onConfirm={async () => {
            const next = await setDiscussion(projectId, discussionId, 'state', { state: 'OPEN' })
            if (mounted.current) {
              setPost(next)
              setReopening(false)
              setNotice(text.changed)
            }
          }}
          pendingLabel={text.saving}
          title={text.reopenTitle}
          toFailureMessage={() => text.saveFailed}
        />
      )}
      {report && (
        <OriginalReport
          issueId={report}
          key={report}
          onClose={() => {
            setReport(null)
            setRevision((value) => value + 1)
          }}
          projectId={projectId}
          trackerConnected={trackerConnected}
        />
      )}
      {openCase && (
        <div className="cp-scope">
          <TestCaseSpecModal cases={[openCase]} onClose={() => setOpenCase(null)} projectId={projectId} scope={caseScope} />
        </div>
      )}
    </div>
    </CaseRefsProvider>
  )
}
