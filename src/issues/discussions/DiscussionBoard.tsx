import { useTestCaseLabel } from '../../testCases/testCaseIdentifiers'
import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { formatDateTime } from '../../projects/formatters'
import type { ProjectMember } from '../../projects/memberTypes'
import { BuildVersionSelect } from '../BuildVersionSelect'
import { CategoryFilter } from '../CategoryFilter'
import { CategoryChip } from '../IssueCategories'
import { BoardSketch } from '../issueSketches'
import type { IssueCategory } from '../issueTypes'
import { listDiscussionPage } from './discussionApi'
import { plainMarkdown } from './discussionMarkdown'
import { DiscussionIcon } from './discussionIcons'
import { Avatar, PinnedMark, PurposeTag, StateTag } from './discussionParts'
import type { Discussion, Filter, NumberedPage } from './discussionTypes'
import { Pagination } from './Pagination'

const PAGE_SIZE = 20

/**
 * 팀 공유 게시판(ARTEL-1114). 쪽 번호로 나눈다 — 글이 쌓이면 "더 보기" 로는 지난 글을 다시 찾아가기 어렵다.
 * 기본 탭은 "논의 중" 이고, 아직 공개 전인 Draft 도 그 안에 함께 보인다.
 */
export function DiscussionBoard({
  projectId,
  members,
  membersFailed,
  onOpen,
  onNew,
  categories,
  initialCategoryId = null,
}: {
  projectId: string
  members: ProjectMember[]
  membersFailed: boolean
  onOpen: (id: string) => void
  onNew: () => void
  categories: readonly IssueCategory[]
  /** 카테고리 탭의 "목록 보기" 로 열면 그 카테고리. */
  initialCategoryId?: string | null
}) {
  const { t } = useI18n()
  const caseLabel = useTestCaseLabel()
  const text = t.discussions
  const [filter, setFilter] = useState<Filter>('open')
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId)
  const [gameBuildId, setGameBuildId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<{ key: string; data: NumberedPage<Discussion> | null; failed: boolean } | null>(null)
  const [revision, setRevision] = useState(0)
  const key = `${filter}|${query}|${categoryId}|${gameBuildId}|${page}|${revision}`

  useEffect(() => {
    const controller = new AbortController()
    listDiscussionPage(projectId, filter, query, page, PAGE_SIZE, categoryId, gameBuildId, controller.signal)
      .then((data) => setResult({ key, data, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, data: null, failed: true })
      })
    return () => controller.abort()
  }, [projectId, filter, query, page, categoryId, gameBuildId, key])

  const settled = result?.key === key ? result : null
  const items = settled?.data?.items ?? []
  const total = settled?.data?.total ?? 0
  const filters: Filter[] = ['open', 'closed', 'subscribed', 'mine']

  function changeFilter(next: Filter) {
    setFilter(next)
    setPage(1)
  }
  function search(event: FormEvent) {
    event.preventDefault()
    setQuery(input)
    setPage(1)
  }
  const recent = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)
  const narrowed = filter !== 'open' || query !== '' || categoryId !== null || gameBuildId !== null

  return (
    <div className="dc-board">
      <main className="dc-board-main">
        <div className="dc-toolbar">
          <div className="dc-segments" role="group" aria-label={text.title}>
            {filters.map((value) => (
              <button
                aria-pressed={value === filter}
                className="dc-segment"
                key={value}
                onClick={() => changeFilter(value)}
                type="button"
              >
                {text[value]}
              </button>
            ))}
          </div>
          <span className="dc-toolbar-end">
          <BuildVersionSelect
            className="dc-input dc-version-filter"
            emptyLabel={text.allVersions}
            label={text.buildVersion}
            onChange={(next) => {
              setGameBuildId(next)
              setPage(1)
            }}
            projectId={projectId}
            value={gameBuildId}
          />
          <form className="dc-search" onSubmit={search} role="search">
            <DiscussionIcon className="dc-search-icon" name="search" size={15} />
            <input
              aria-label={text.search}
              maxLength={200}
              onChange={(event) => setInput(event.target.value)}
              placeholder={text.search}
              type="search"
              value={input}
            />
          </form>
          </span>
        </div>
        <CategoryFilter
          projectId={projectId}
          allLabel={text.allCategories}
          categories={categories}
          countOf={(category) => category.discussionCount}
          onChange={(next) => {
            setCategoryId(next)
            setPage(1)
          }}
          selected={categoryId}
        />

        {settled === null && (
          <p aria-busy="true" className="dc-quiet dc-pad">
            {text.loading}
          </p>
        )}
        {settled?.failed && (
          <div className="dc-empty" role="alert">
            <p>{text.failed}</p>
            <button className="button button--secondary" onClick={() => setRevision((value) => value + 1)} type="button">
              {text.retry}
            </button>
          </div>
        )}
        {settled !== null && !settled.failed && items.length === 0 && (
          <div className="dc-empty">
            <BoardSketch />
            <h3>{narrowed ? text.noResults : text.empty}</h3>
            <p>{text.emptyHelp}</p>
            <button className="button button--primary dc-with-icon" onClick={onNew} type="button">
              <DiscussionIcon name="plus" size={15} />
              {text.newPost}
            </button>
          </div>
        )}

        {items.length > 0 && (
          <>
            <p className="dc-order">
              {text.order} · {text.totalPosts(total)}
            </p>
            <ul className="dc-posts">
              {items.map((post) => (
                <li key={post.id}>
                  <button
                    className={`dc-post${post.pinned ? ' is-pinned' : ''}${post.state === 'CLOSED' ? ' is-closed' : ''}${post.state === 'DRAFT' ? ' is-draft' : ''}`}
                    onClick={() => onOpen(post.id)}
                    type="button"
                  >
                    <span className="dc-post-tags">
                      {post.number && <span className="dc-post-no">#{post.number}</span>}
                      <PurposeTag purpose={post.purpose} />
                      {post.pinned && <PinnedMark />}
                    </span>
                    {/* 버전과 카테고리는 모든 줄의 같은 자리에 둔다. 없으면 없다고 보인다. */}
                    <span className="dc-post-facets">
                      <span className="dc-post-facet">
                        <span className="dc-cap">{text.buildVersion}</span>
                        {post.buildVersion ? (
                          <span className="ib-version">{post.buildVersion}</span>
                        ) : (
                          <span className="dc-facet-empty">{text.noVersion}</span>
                        )}
                      </span>
                      <span className="dc-post-facet">
                        <span className="dc-cap">{text.categories}</span>
                        <span className="dc-post-facet-chips">
                          {post.categories.length === 0 ? (
                            <span className="dc-facet-empty">—</span>
                          ) : (
                            <>
                              {post.categories.slice(0, 3).map((category) => (
                                <CategoryChip key={category.id} small tag={category} />
                              ))}
                              {post.categories.length > 3 && (
                                <span className="dc-tag" title={post.categories.slice(3).map((category) => category.name).join(', ')}>
                                  {text.moreCategories(post.categories.length - 3)}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                      </span>
                    </span>
                    <span className="dc-post-title">{post.title}</span>
                    <span className="dc-post-excerpt">{plainMarkdown(post.excerpt, caseLabel)}</span>
                    <span className="dc-post-meta">
                      <Avatar person={post.author} size="sm" />
                      <span>{post.author.displayName}</span>
                      <span aria-hidden="true" className="dc-dot" />
                      <time dateTime={post.updatedAt}>{formatDateTime(post.updatedAt)}</time>
                      <span className="dc-count" title={text.linked}>
                        <DiscussionIcon name="link" size={13} />
                        <span className="visually-hidden">{text.linked}</span>
                        {post.issueCount}
                      </span>
                      <span className="dc-count" title={text.comments}>
                        <DiscussionIcon name="message" size={13} />
                        <span className="visually-hidden">{text.comments}</span>
                        {post.commentCount}
                      </span>
                      {post.subscribed && (
                        <span className="dc-count" title={text.subscribed}>
                          <DiscussionIcon name="bell" size={13} />
                          <span className="visually-hidden">{text.subscribed}</span>
                        </span>
                      )}
                    </span>
                    <span className="dc-post-state">
                      <StateTag state={post.state} />
                      {post.purpose === 'QUESTION' && post.reviewerCount > 0 && (
                        <span className="dc-approval-count">{text.approvals(post.approvalCount, post.reviewerCount)}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination onChange={setPage} page={page} pageSize={PAGE_SIZE} total={total} />
          </>
        )}
      </main>

      <aside className="dc-side">
        <section className="dc-side-section">
          <h3 className="dc-side-title">{text.latest}</h3>
          {recent.length === 0 ? (
            <p className="dc-quiet">{text.noActivity}</p>
          ) : (
            <ul className="dc-activity">
              {recent.map((post) => (
                <li key={post.id}>
                  <button onClick={() => onOpen(post.id)} type="button">
                    <span className="dc-activity-title">{post.title}</span>
                    <time dateTime={post.updatedAt}>{formatDateTime(post.updatedAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="dc-side-section">
          <h3 className="dc-side-title">{text.members}</h3>
          {membersFailed ? (
            <p className="dc-quiet">{text.mentionsFailed}</p>
          ) : (
            <ul className="dc-members">
              {members.slice(0, 8).map((member) => (
                <li key={member.userId}>
                  <Avatar person={{ id: member.userId, displayName: member.nickname }} size="sm" />
                  <span className="dc-member-name">{member.nickname}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="dc-quiet">{text.memberHelp}</p>
        </section>
      </aside>
    </div>
  )
}
