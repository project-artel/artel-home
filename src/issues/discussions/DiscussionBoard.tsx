import { useCallback, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { formatDateTime } from '../../projects/formatters'
import type { ProjectMember } from '../../projects/memberTypes'
import { listDiscussions } from './discussionApi'
import type { Filter } from './discussionTypes'
import { useDiscussionPage } from './useDiscussionPage'

export function DiscussionBoard({
  projectId,
  members,
  membersFailed,
  onOpen,
  onNew,
}: {
  projectId: string
  members: ProjectMember[]
  membersFailed: boolean
  onOpen: (id: string) => void
  onNew: () => void
}) {
  const { t } = useI18n()
  const text = t.discussions
  const [filter, setFilter] = useState<Filter>('all')
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const load = useCallback(
    (cursor: string | undefined, signal: AbortSignal) =>
      listDiscussions(projectId, filter, query, cursor, signal),
    [projectId, filter, query],
  )
  const page = useDiscussionPage(load)
  const filters: Filter[] = ['all', 'open', 'closed', 'subscribed', 'mine']
  function search(event: FormEvent) {
    event.preventDefault()
    setQuery(input)
  }
  return (
    <div className="discussion-board">
      <main>
        <div className="discussion-board-heading">
          <div>
            <h2>{text.title}</h2>
            <p>{text.intro}</p>
          </div>
          <form className="discussion-search" onSubmit={search}>
            <input
              aria-label={text.search}
              placeholder={text.search}
              maxLength={200}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button>{text.search}</button>
          </form>
        </div>
        <div className="discussion-filters">
          <div>
            {filters.map((value) => (
              <button
                key={value}
                aria-pressed={value === filter}
                type="button"
                onClick={() => setFilter(value)}
              >
                {text[value]}
              </button>
            ))}
          </div>
          <small>{text.order}</small>
        </div>
        {page.status === 'loading' && (
          <p className="discussion-empty" aria-busy="true">
            {text.loading}
          </p>
        )}
        {page.status === 'error' && (
          <div className="discussion-empty" role="alert">
            <p>{text.failed}</p>
            <button type="button" onClick={page.refresh}>
              {text.retry}
            </button>
          </div>
        )}
        {page.status === 'ready' && page.items.length === 0 && (
          <div className="discussion-empty">
            <div className="discussion-empty-symbol" aria-hidden="true">
              ↗
            </div>
            <h3>{filter === 'all' && !query ? text.empty : text.noResults}</h3>
            <p>{text.emptyHelp}</p>
            <button className="button button--primary" onClick={onNew}>
              {text.newPost}
            </button>
          </div>
        )}
        <div className="discussion-posts">
          {page.items.map((post) => (
            <button
              type="button"
              className={`discussion-post ${post.pinned ? 'is-pinned' : ''}`}
              key={post.id}
              onClick={() => onOpen(post.id)}
            >
              <span className="discussion-avatar" aria-hidden="true">
                {post.author.displayName.slice(0, 1)}
              </span>
              <span className="discussion-post-copy">
                <span className="discussion-eyebrow">
                  {text.purposes[post.purpose]}{' '}
                  {post.pinned && <span>⌖ {text.pinned}</span>}
                </span>
                <strong>{post.title}</strong>
                <span className="discussion-excerpt">{post.excerpt}</span>
                <span className="discussion-meta">
                  {post.author.displayName} · {text.linked} {post.issueCount} ·{' '}
                  {text.comments} {post.commentCount}
                  {post.subscribed && ` · ${text.subscribed}`}
                </span>
              </span>
              <span className="discussion-post-side">
                <span
                  className={`discussion-state ${post.state === 'CLOSED' ? 'is-closed' : ''}`}
                >
                  {post.state === 'OPEN' ? text.open : `✓ ${text.closed}`}
                </span>
                <time>{formatDateTime(post.updatedAt)}</time>
              </span>
            </button>
          ))}
        </div>
        {page.moreFailed && <p role="alert">{text.failed}</p>}
        {page.hasMore && (
          <button
            className="button button--secondary discussion-more"
            disabled={page.loadingMore}
            onClick={() => void page.loadMore()}
          >
            {page.loadingMore ? text.loading : text.more}
          </button>
        )}
      </main>
      <aside className="discussion-sidebar">
        <section>
          <h3>{text.latest}</h3>
          {[...page.items]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 3)
            .map((post) => (
              <button
                className="discussion-activity"
                key={post.id}
                onClick={() => onOpen(post.id)}
              >
                <strong>{post.title}</strong>
                <time>{formatDateTime(post.updatedAt)}</time>
              </button>
            ))}
        </section>
        <section>
          <h3>{text.members}</h3>
          {membersFailed ? (
            <p>{text.mentionsFailed}</p>
          ) : (
            <div className="discussion-avatars">
              {members.slice(0, 8).map((member) => (
                <span
                  className="discussion-avatar"
                  key={member.userId}
                  title={`${member.nickname}#${member.userTag}`}
                >
                  {member.nickname.slice(0, 1)}
                </span>
              ))}
            </div>
          )}
          <p>{text.memberHelp}</p>
          <small>{text.sharedWith}</small>
        </section>
      </aside>
    </div>
  )
}
