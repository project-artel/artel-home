import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../design-system/primitives/Dialog'
import { useI18n } from '../../i18n/useI18n'
import type { ProjectMember } from '../../projects/memberTypes'
import { ProjectApiError } from '../../projects/projectApi'
import { issueOptions, saveDiscussion } from './discussionApi'
import {
  PURPOSES,
  type DiscussionDetail,
  type LinkedIssue,
  type Purpose,
} from './discussionTypes'
import { useDiscussionPage } from './useDiscussionPage'

export function MemberPicker({
  members,
  selected,
  onChange,
}: {
  members: ProjectMember[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const { t } = useI18n()
  const text = t.discussions
  return (
    <details className="discussion-mentions">
      <summary>
        @ {text.mention}
        {selected.length ? ` (${selected.length})` : ''}
      </summary>
      <div>
        {members.map((member) => (
          <label key={member.userId}>
            <input
              type="checkbox"
              checked={selected.includes(member.userId)}
              disabled={
                !selected.includes(member.userId) && selected.length >= 50
              }
              onChange={() =>
                onChange(
                  selected.includes(member.userId)
                    ? selected.filter((id) => id !== member.userId)
                    : [...selected, member.userId],
                )
              }
            />
            {member.nickname}
            <span className="mono">#{member.userTag}</span>
          </label>
        ))}
      </div>
    </details>
  )
}

export function DiscussionComposer({
  projectId,
  members,
  membersFailed,
  initialIssues,
  editing,
  onClose,
  onSaved,
}: {
  projectId: string
  members: ProjectMember[]
  membersFailed: boolean
  initialIssues: LinkedIssue[]
  editing?: DiscussionDetail
  onClose: () => void
  onSaved: (post: DiscussionDetail) => void
}) {
  const { t } = useI18n()
  const text = t.discussions
  const [title, setTitle] = useState(editing?.title ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
  const [purpose, setPurpose] = useState<Purpose>(
    editing?.purpose ?? 'QUESTION',
  )
  const [selected, setSelected] = useState<LinkedIssue[]>(
    editing?.issues ?? initialIssues,
  )
  const [mentions, setMentions] = useState<string[]>(
    editing?.mentions.map((person) => person.id) ?? [],
  )
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestKey = useRef({ payload: '', id: crypto.randomUUID() })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const load = useCallback(
    (cursor: string | undefined, signal: AbortSignal) =>
      issueOptions(projectId, appliedQuery, cursor, signal),
    [projectId, appliedQuery],
  )
  const options = useDiscussionPage(load)
  function toggle(issue: LinkedIssue) {
    setSelected((current) =>
      current.some((item) => item.id === issue.id)
        ? current.filter((item) => item.id !== issue.id)
        : current.length < 50
          ? [...current, issue]
          : current,
    )
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending || !title.trim() || !body.trim()) return
    const draft = {
      title: title.trim(),
      body: body.trim(),
      purpose,
      issueIds: selected.map((issue) => issue.id),
      mentionedUserIds: mentions,
    }
    const payload = JSON.stringify(draft)
    if (requestKey.current.payload !== payload)
      requestKey.current = { payload, id: crypto.randomUUID() }
    setPending(true)
    setError(null)
    try {
      const post = await saveDiscussion(
        projectId,
        draft,
        requestKey.current.id,
        editing,
      )
      if (mounted.current) onSaved(post)
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
  return (
    <Dialog
      title={editing ? text.edit : text.newPost}
      labelledBy="discussion-compose-title"
      onClose={() => {
        if (!pending) onClose()
      }}
    >
      <form
        className="discussion-compose"
        onSubmit={(event) => void submit(event)}
      >
        <fieldset disabled={pending} className="discussion-compose-fields">
          <label>
            {text.purpose}
            <select
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as Purpose)}
            >
              {PURPOSES.map((value) => (
                <option key={value} value={value}>
                  {text.purposes[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text.titleLabel}
            <input
              required
              maxLength={200}
              value={title}
              placeholder={text.titlePlaceholder}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            {text.bodyLabel}
            <textarea
              required
              maxLength={20000}
              rows={7}
              value={body}
              placeholder={text.bodyPlaceholder}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          {membersFailed ? (
            <p role="status">{text.mentionsFailed}</p>
          ) : (
            <MemberPicker
              members={members}
              selected={mentions}
              onChange={setMentions}
            />
          )}
        </fieldset>
        <fieldset disabled={pending} className="discussion-picker">
          <h3>
            {text.linked} <span className="mono">{selected.length}/50</span>
          </h3>
          {selected.length > 0 && (
            <div className="discussion-selected">
              {selected.map((issue) => (
                <button
                  type="button"
                  key={issue.id}
                  onClick={() => toggle(issue)}
                  title={issue.title}
                >
                  #{issue.id} ×
                </button>
              ))}
            </div>
          )}
          <div className="discussion-search">
            <input
              aria-label={text.searchIssues}
              placeholder={text.searchIssues}
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  setAppliedQuery(query)
                }
              }}
            />
            <button type="button" onClick={() => setAppliedQuery(query)}>
              {text.search}
            </button>
          </div>
          {options.status === 'loading' && (
            <p aria-busy="true">{text.loading}</p>
          )}
          {options.status === 'error' && (
            <p role="alert">
              {text.failed}{' '}
              <button type="button" onClick={options.refresh}>
                {text.retry}
              </button>
            </p>
          )}
          <div className="discussion-picker-list">
            {options.items.map((issue) => (
              <label key={issue.id}>
                <input
                  type="checkbox"
                  checked={selected.some((item) => item.id === issue.id)}
                  disabled={
                    selected.length >= 50 &&
                    !selected.some((item) => item.id === issue.id)
                  }
                  onChange={() => toggle(issue)}
                />
                <span>
                  <small className="mono">
                    #{issue.id} · {issue.severity} ·{' '}
                    {issue.status === 'RESOLVED'
                      ? t.issues.statusLabels.RESOLVED
                      : t.issues.statusLabels.OPEN}
                  </small>
                  <strong>{issue.title}</strong>
                </span>
              </label>
            ))}
          </div>
          {options.status === 'ready' && options.items.length === 0 && (
            <p>{t.issues.list.emptyFiltered}</p>
          )}
          {options.moreFailed && <p role="alert">{text.failed}</p>}
          {options.hasMore && (
            <button
              type="button"
              disabled={options.loadingMore}
              onClick={() => void options.loadMore()}
            >
              {options.loadingMore ? text.loading : text.more}
            </button>
          )}
        </fieldset>
        <footer className="discussion-compose-footer">
          {error && <p role="alert">{error}</p>}
          <span>{text.sharedWith}</span>
          <button
            type="button"
            className="button button--secondary"
            disabled={pending}
            onClick={onClose}
          >
            {text.cancel}
          </button>
          <button
            className="button button--primary"
            disabled={pending || !title.trim() || !body.trim()}
          >
            {pending ? text.saving : editing ? text.save : text.publish}
          </button>
        </footer>
      </form>
    </Dialog>
  )
}
