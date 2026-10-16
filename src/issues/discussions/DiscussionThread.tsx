import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../design-system/primitives/Dialog'
import { useI18n } from '../../i18n/useI18n'
import type { ProjectMember } from '../../projects/memberTypes'
import { formatDateTime } from '../../projects/formatters'
import { ProjectApiError } from '../../projects/projectApi'
import { qaRunPath } from '../../qa/qaTypes'
import { IssueList } from '../IssueList'
import type { Issue } from '../issueTypes'
import {
  getDiscussion,
  getOriginalIssue,
  listComments,
  reactToComment,
  saveComment,
  setDiscussion,
} from './discussionApi'
import { MemberPicker } from './DiscussionComposer'
import type { Comment, DiscussionDetail, Person } from './discussionTypes'
import { useDiscussionPage } from './useDiscussionPage'

export function Mentioned({ people }: { people: Person[] }) {
  return people.length ? (
    <div className="discussion-mentioned">
      {people.map((person) => (
        <span key={person.id}>
          @{person.displayName}
          <small>#{person.userTag}</small>
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
      <button
        type="button"
        className="button button--secondary"
        onClick={onClose}
      >
        {text.close}
      </button>
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
      | { state: 'OPEN' | 'CLOSED' }
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
      )
      if (!mounted.current) return
      setBody('')
      setMentions([])
      setEditing(undefined)
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
  if (loadError)
    return (
      <div className="discussion-empty" role="alert">
        <p>{text.failed}</p>
        <button onClick={() => setRevision((value) => value + 1)}>
          {text.retry}
        </button>
        <button onClick={onBack}>{text.back}</button>
      </div>
    )
  if (!post)
    return (
      <p className="discussion-empty" aria-busy="true">
        {text.loading}
      </p>
    )
  return (
    <div className="discussion-thread">
      <div className="discussion-thread-top">
        <button type="button" onClick={onBack}>
          {text.back}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setRevision((value) => value + 1)
            comments.refresh()
          }}
        >
          {text.refresh}
        </button>
      </div>
      <div className="discussion-thread-grid">
        <article className="discussion-article">
          <div className="discussion-eyebrow">
            <span>{text.purposes[post.purpose]}</span>
            {post.pinned && <span>⌖ {text.pinned}</span>}
            <span
              className={`discussion-state ${post.state === 'CLOSED' ? 'is-closed' : ''}`}
            >
              {post.state === 'OPEN' ? text.open : text.closed}
            </span>
          </div>
          <h2>{post.title}</h2>
          <p className="discussion-meta">
            {post.author.displayName}{' '}
            <span className="mono">#{post.author.userTag}</span> ·{' '}
            {formatDateTime(post.createdAt)}
          </p>
          <div className="discussion-body">{post.body}</div>
          <Mentioned people={post.mentions} />
          {post.decision && (
            <section className="discussion-decision">
              <h3>✓ {text.decision}</h3>
              <p>{post.decision.body}</p>
              <small>{post.decision.author.displayName}</small>
              {post.canEdit && (
                <button
                  disabled={pending}
                  onClick={() => change('decision', { commentId: null })}
                >
                  {text.clearDecision}
                </button>
              )}
            </section>
          )}
          <section className="discussion-comments">
            <h3>
              {text.comments} <span className="mono">{post.commentCount}</span>
            </h3>
            {comments.status === 'loading' && (
              <p aria-busy="true">{text.loading}</p>
            )}
            {comments.status === 'error' && (
              <p role="alert">
                {text.failed}{' '}
                <button onClick={comments.refresh}>{text.retry}</button>
              </p>
            )}
            {comments.status === 'ready' && comments.items.length === 0 && (
              <p>{text.noComments}</p>
            )}
            {[...comments.items]
              .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
              .map((comment) => (
                <article className="discussion-comment" key={comment.id}>
                  <div className="discussion-avatar" aria-hidden="true">
                    {comment.author.displayName.slice(0, 1)}
                  </div>
                  <div>
                    {comments.hasMore && recentlySaved.includes(comment.id) && (
                      <small>{text.savedWithHistory}</small>
                    )}
                    <header>
                      <strong>{comment.author.displayName}</strong>{' '}
                      <span className="mono">#{comment.author.userTag}</span>
                      <time>{formatDateTime(comment.createdAt)}</time>
                    </header>
                    <p>{comment.body}</p>
                    <Mentioned people={comment.mentions} />
                    <div className="discussion-comment-actions">
                      <button
                        type="button"
                        disabled={pending}
                        aria-pressed={comment.reacted}
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
                                items.map((item) =>
                                  item.id === updated.id ? updated : item,
                                ),
                              )
                          })
                        }
                      >
                        ♡ {text.like} {comment.reactionCount || ''}
                      </button>
                      {post.canEdit && (
                        <button
                          disabled={pending}
                          type="button"
                          onClick={() =>
                            change('decision', {
                              commentId:
                                post.decision?.id === comment.id
                                  ? null
                                  : comment.id,
                            })
                          }
                        >
                          {post.decision?.id === comment.id
                            ? `✓ ${text.decision}`
                            : text.chooseDecision}
                        </button>
                      )}
                      {comment.canEdit && (
                        <button
                          disabled={pending}
                          type="button"
                          onClick={() => {
                            setEditing(comment)
                            setBody(comment.body)
                            setMentions(
                              comment.mentions.map((person) => person.id),
                            )
                            document
                              .getElementById('discussion-comment-input')
                              ?.focus()
                          }}
                        >
                          {text.edit}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            {comments.moreFailed && <p role="alert">{text.failed}</p>}
            {comments.hasMore && (
              <button
                type="button"
                disabled={comments.loadingMore}
                onClick={() => void comments.loadMore()}
              >
                {comments.loadingMore ? text.loading : text.more}
              </button>
            )}
            <form className="discussion-comment-form" onSubmit={submit}>
              <label htmlFor="discussion-comment-input">
                {editing ? text.edit : text.comments}
              </label>
              <textarea
                id="discussion-comment-input"
                rows={4}
                maxLength={10000}
                required
                placeholder={text.commentPlaceholder}
                value={body}
                disabled={pending}
                onChange={(event) => setBody(event.target.value)}
              />
              {membersFailed ? (
                <p>{text.mentionsFailed}</p>
              ) : (
                <fieldset
                  disabled={pending}
                  className="discussion-mention-field"
                >
                  <MemberPicker
                    members={members}
                    selected={mentions}
                    onChange={setMentions}
                  />
                </fieldset>
              )}
              <div>
                {editing && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setEditing(undefined)
                      setBody('')
                      setMentions([])
                    }}
                  >
                    {text.cancelEdit}
                  </button>
                )}
                <button
                  className="button button--primary"
                  disabled={
                    pending || comments.status !== 'ready' || !body.trim()
                  }
                >
                  {pending ? text.saving : editing ? text.save : text.send}
                </button>
              </div>
            </form>
          </section>
        </article>
        <aside className="discussion-sidebar">
          <div className="discussion-actions">
            <button
              type="button"
              className="button button--secondary"
              disabled={pending}
              aria-pressed={post.subscribed}
              onClick={() =>
                change('subscription', { enabled: !post.subscribed })
              }
            >
              {post.subscribed ? text.unfollow : text.follow}
            </button>
            <small>{text.subscriptionHelp}</small>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(window.location.href)
                  .then(() => setNotice(text.copied))
                  .catch(() => setError(text.copyFailed))
              }
            >
              {text.copy}
            </button>
            {post.canEdit && (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onEdit(post)}
                >
                  {text.edit}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    change('state', {
                      state: post.state === 'OPEN' ? 'CLOSED' : 'OPEN',
                    })
                  }
                >
                  {post.state === 'OPEN' ? text.conclude : text.reopen}
                </button>
                <small>{text.independent}</small>
              </>
            )}
            {post.canPin && (
              <button
                type="button"
                disabled={pending}
                onClick={() => change('pin', { enabled: !post.pinned })}
              >
                {post.pinned ? text.unpin : text.pin}
              </button>
            )}
          </div>
          <section>
            <h3>
              {text.linked} <span className="mono">{post.issues.length}</span>
            </h3>
            {post.issues.length === 0 && <p>{text.noLinks}</p>}
            {post.issues.map((issue) => (
              <button
                className="discussion-linked-issue"
                key={issue.id}
                onClick={() => setReport(issue.id)}
              >
                <small className="mono">
                  #{issue.id} · {issue.severity}
                </small>
                <strong>{issue.title}</strong>
                <span>
                  {issue.status === 'RESOLVED'
                    ? t.issues.statusLabels.RESOLVED
                    : t.issues.statusLabels.OPEN}{' '}
                  ↗ {text.original}
                </span>
              </button>
            ))}
          </section>
          <p>{text.sharedWith}</p>
        </aside>
      </div>
      {error && (
        <p className="discussion-feedback" role="alert">
          {error}
        </p>
      )}
      <p role="status" className="discussion-notice">
        {notice}
      </p>
      {report && (
        <OriginalReport
          key={report}
          projectId={projectId}
          issueId={report}
          trackerConnected={trackerConnected}
          onClose={() => {
            setReport(null)
            setRevision((value) => value + 1)
          }}
        />
      )}
    </div>
  )
}
