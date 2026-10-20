import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../design-system/primitives/Dialog'
import { useI18n } from '../../i18n/useI18n'
import { SeverityTag } from '../SeverityTag'
import type { IssueSeverity } from '../issueTypes'
import type { ProjectMember } from '../../projects/memberTypes'
import { ProjectApiError } from '../../projects/projectApi'
import { saveDiscussion } from './discussionApi'
import { versionName } from '../../testCases/testCaseVersions'
import { useTestCaseVersionList } from '../../testCases/useTestCaseVersions'
import { CategoryChip } from '../IssueCategories'
import { ComposeSettingsDrawer, type DrawerTab } from './ComposeSettingsDrawer'
import { CaseRefsProvider } from './CaseRefsProvider'
import { IssueLinkDialog } from './IssueLinkDialog'
import type { IssueCategory } from '../issueTypes'
import { DiscussionIcon } from './discussionIcons'
import { MarkdownEditor } from './MarkdownEditor'
import { Avatar } from './discussionParts'
import {
  PURPOSES,
  type DiscussionDetail,
  type LinkedIssue,
  type Purpose,
} from './discussionTypes'

/** 멘션할 멤버를 칩으로 고른다. 고른 사람은 강조되고, 다시 누르면 빠진다. */
/** 멤버를 칩으로 고른다. 고른 사람은 강조되고, 다시 누르면 빠진다. 검토자 고르기가 쓴다. */
export function MemberPicker({
  members,
  selected,
  onChange,
  label,
  icon = 'users',
  showLabel = true,
}: {
  members: ProjectMember[]
  selected: string[]
  onChange: (ids: string[]) => void
  label: string
  icon?: 'users' | 'at'
  /** 바깥에 이름표가 이미 있으면 끈다. */
  showLabel?: boolean
}) {
  return (
    <div className="dc-mentions" role="group" aria-label={label}>
      {showLabel && (
        <span className="dc-mentions-label">
          <DiscussionIcon name={icon} size={14} />
          {label}
        </span>
      )}
      {members.map((member) => {
        const on = selected.includes(member.userId)
        return (
          <button
            aria-pressed={on}
            className="dc-mention-chip"
            disabled={!on && selected.length >= 50}
            key={member.userId}
            onClick={() =>
              onChange(on ? selected.filter((id) => id !== member.userId) : [...selected, member.userId])
            }
            title={member.nickname}
            type="button"
          >
            <Avatar person={{ id: member.userId, displayName: member.nickname }} size="sm" />
            {member.nickname}
          </button>
        )
      })}
    </div>
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
  categories,
  onManageCategories,
  onCategoriesChanged,
  mode = 'dialog',
}: {
  /** 그 자리에서 카테고리를 새로 만들면 목록을 다시 읽게 한다. */
  onCategoriesChanged: () => void
  /** 새 글은 페이지(`page`), 수정은 창(`dialog`)으로 연다. */
  mode?: 'dialog' | 'page'
  projectId: string
  members: ProjectMember[]
  membersFailed: boolean
  initialIssues: LinkedIssue[]
  editing?: DiscussionDetail
  onClose: () => void
  onSaved: (post: DiscussionDetail) => void
  categories: readonly IssueCategory[]
  onManageCategories: () => void
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
  const [reviewers] = useState<string[]>(
    editing?.reviewers.map((reviewer) => reviewer.person.id) ?? [],
  )
  const [categoryIds, setCategoryIds] = useState<string[]>(
    editing?.categories.map((category) => category.id) ?? [],
  )
  // 고르기 전에는 수정이면 글의 버전, 새 글이면 프로젝트의 최근 버전이다. undefined 는 아직 고르지 않았다는 뜻이다.
  const [pickedBuild, setGameBuildId] = useState<string | null | undefined>(editing ? (editing.gameBuildId ?? null) : undefined)
  const versions = useTestCaseVersionList(projectId)
  const gameBuildId =
    pickedBuild !== undefined
      ? pickedBuild
      : (versions.versions.find((one) => one.latest && !one.hidden)?.gameBuildId ?? null)
  const version = versions.versions.find((one) => one.gameBuildId === gameBuildId)
  const pickedCategories = categories.filter((category) => categoryIds.includes(category.id))
  const caseScope = version ? text.caseScope(versionName(version)) : text.caseScopeAll
  const [pending, setPending] = useState(false)
  const [touched, setTouched] = useState({ title: false, body: false })
  const [linking, setLinking] = useState(false)
  const [drawer, setDrawer] = useState<DrawerTab | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestKey = useRef({ payload: '', id: crypto.randomUUID() })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  function toggle(issue: LinkedIssue) {
    setSelected((current) =>
      current.some((item) => item.id === issue.id)
        ? current.filter((item) => item.id !== issue.id)
        : current.length < 50
          ? [...current, issue]
          : current,
    )
  }
  async function submit(event: FormEvent, asDraft = false) {
    event.preventDefault()
    if (pending || !title.trim() || !body.trim()) return
    const draft = {
      title: title.trim(),
      body: body.trim(),
      purpose,
      issueIds: selected.map((issue) => issue.id),
      mentionedUserIds: mentions,
      // 검토자는 확인 요청에만 뜻이 있다.
      reviewerIds: purpose === 'QUESTION' ? reviewers : [],
      categoryIds,
      gameBuildId,
      ...(editing ? {} : { draft: asDraft }),
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
  const titleError = touched.title && !title.trim() ? text.titleRequired : null
  const bodyError = touched.body && !body.trim() ? text.bodyRequired : null
  const form = (
    <CaseRefsProvider gameBuildId={gameBuildId} projectId={projectId} scope={caseScope}>
    <form
      className={`dc-compose dc-compose--${mode}`}
      noValidate
      onSubmit={(event) => {
        setTouched({ title: true, body: true })
        if (!title.trim()) document.getElementById('discussion-compose-title-input')?.focus()
        else if (!body.trim()) document.getElementById('discussion-compose-body')?.focus()
        void submit(event)
      }}
    >
      {/* 왼쪽: 쓰는 자리. 제목과 본문만 둔다. 버전 · 카테고리 고르기는 이 위로 밀려 나온다. */}
      <div className="dc-canvas-wrap">
      <fieldset className="dc-canvas" disabled={pending}>
        <div className="dc-field">
          <label className="dc-cap" htmlFor="discussion-compose-title-input">
            {text.titleLabel}
          </label>
          <input
            aria-describedby={titleError ? 'discussion-compose-title-error' : undefined}
            aria-invalid={titleError !== null}
            className="dc-title-input"
            id="discussion-compose-title-input"
            maxLength={200}
            onBlur={() => setTouched((current) => ({ ...current, title: true }))}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={text.titlePlaceholder}
            value={title}
          />
          {titleError && (
            <p className="dc-field-error" id="discussion-compose-title-error" role="alert">
              {titleError}
            </p>
          )}
        </div>
        <div className="dc-field dc-field--grow" onBlur={() => setTouched((current) => ({ ...current, body: true }))}>
          <label className="dc-cap" htmlFor="discussion-compose-body">
            {text.bodyLabel}
          </label>
          <MarkdownEditor
            footer={
              <button className="dc-ghost" disabled title={text.attachSoon} type="button">
                <DiscussionIcon name="image" size={15} />
                {text.attach}
                <span className="dc-soon">{text.soon}</span>
              </button>
            }
            id="discussion-compose-body"
            invalid={bodyError !== null}
            maxLength={20000}
            members={membersFailed ? [] : members}
            mentions={mentions}
            onChange={setBody}
            onMentionsChange={setMentions}
            placeholder={text.bodyPlaceholder}
            rows={mode === 'page' ? 18 : 12}
            split={mode === 'page'}
            value={body}
          />
          {bodyError && (
            <p className="dc-field-error" role="alert">
              {bodyError}
            </p>
          )}
        </div>
      </fieldset>
      {drawer !== null && (
        <ComposeSettingsDrawer
          categories={categories}
          categoryIds={categoryIds}
          gameBuildId={gameBuildId}
          groups={versions.groups}
          onBuild={setGameBuildId}
          onCategories={setCategoryIds}
          onCategoryCreated={onCategoriesChanged}
          onClose={() => setDrawer(null)}
          onManageCategories={onManageCategories}
          onTab={setDrawer}
          projectId={projectId}
          tab={drawer}
          versions={versions.versions}
          versionsLoading={versions.status === 'loading'}
        />
      )}
      </div>

      {/* 오른쪽: 게시 설정과 내보내기. 쓰는 동안 따라 내려온다. */}
      <aside className="dc-rail">
        <fieldset className="dc-rail-section" disabled={pending}>
          <legend className="dc-cap">{text.purpose}</legend>
          <div className="dc-purposes" role="radiogroup" aria-label={text.purpose}>
            {PURPOSES.map((value) => (
              <button
                aria-checked={value === purpose}
                className={`dc-purpose-card dc-purpose-card--${value.toLowerCase()}`}
                key={value}
                onClick={() => setPurpose(value)}
                role="radio"
                type="button"
              >
                <span className="dc-purpose-card-icon" aria-hidden="true">
                  <DiscussionIcon name={value === 'RESOLUTION' ? 'wrench' : value === 'QUESTION' ? 'users' : 'seal'} size={16} />
                </span>
                <span className="dc-purpose-card-copy">
                  <strong>{text.purposes[value]}</strong>
                  <span>{text.purposeHelp[value]}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="dc-rail-section" disabled={pending}>
          <legend className="dc-cap">{text.buildVersion}</legend>
          <button
            aria-expanded={drawer === 'version'}
            aria-haspopup="dialog"
            className={`dc-trigger${drawer === 'version' ? ' is-open' : ''}`}
            onClick={() => setDrawer(drawer === 'version' ? null : 'version')}
            type="button"
          >
            <span className="dc-trigger-value">
              {version ? (
                <>
                  <span className="ib-version">{versionName(version)}</span>
                  {version.latest && <span className="csd-badge">{text.latestVersion}</span>}
                </>
              ) : (
                <span className="dc-trigger-placeholder">{text.noVersion}</span>
              )}
            </span>
            <DiscussionIcon className="dc-trigger-chevron" name="chevron" size={14} />
          </button>
          <p className="dc-quiet dc-help">{text.buildVersionHelp}</p>
        </fieldset>

        <fieldset className="dc-rail-section" disabled={pending}>
          <legend className="dc-cap">
            {text.categories} <span className="dc-tag">{pickedCategories.length}</span>
          </legend>
          <button
            aria-expanded={drawer === 'category'}
            aria-haspopup="dialog"
            className={`dc-trigger${drawer === 'category' ? ' is-open' : ''}`}
            onClick={() => setDrawer(drawer === 'category' ? null : 'category')}
            type="button"
          >
            <span className="dc-trigger-value">
              {pickedCategories.length === 0 ? (
                <span className="dc-trigger-placeholder">{text.pickCategory}</span>
              ) : (
                <>
                  {pickedCategories.slice(0, 3).map((category) => (
                    <CategoryChip key={category.id} small tag={category} />
                  ))}
                  {pickedCategories.length > 3 && <span className="dc-tag">{text.moreCategories(pickedCategories.length - 3)}</span>}
                </>
              )}
            </span>
            <DiscussionIcon className="dc-trigger-chevron" name="chevron" size={14} />
          </button>
        </fieldset>

        <fieldset className="dc-rail-section" disabled={pending}>
          <legend className="dc-cap">
            {text.linked} <span className="dc-tag">{selected.length}/50</span>
          </legend>
          {selected.length > 0 && (
            <ul className="dc-linked-mini">
              {selected.map((issue) => (
                <li key={issue.id}>
                  <span className="dc-tag">#{issue.number ?? issue.id}</span>
                  <SeverityTag severity={issue.severity as IssueSeverity} />
                  <span className="dc-linked-mini-title" title={issue.title}>
                    {issue.title}
                  </span>
                  <button
                    aria-label={`${text.unlink} #${issue.number ?? issue.id}`}
                    className="dc-mini"
                    onClick={() => toggle(issue)}
                    type="button"
                  >
                    <DiscussionIcon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="button button--secondary dc-with-icon" onClick={() => setLinking(true)} type="button">
            <DiscussionIcon name="link" size={15} />
            {text.linkButton}
          </button>
        </fieldset>

        <div className="dc-rail-actions">
          {error && (
            <p className="dc-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button--primary dc-publish" disabled={pending} type="submit">
            {pending ? text.saving : editing ? text.save : text.publish}
          </button>
          <div className="dc-rail-secondary">
            {!editing && (
              <button
                className="button button--secondary"
                disabled={pending}
                onClick={(event) => {
                  setTouched({ title: true, body: true })
                  void submit(event, true)
                }}
                title={text.draftHint}
                type="button"
              >
                {text.saveDraft}
              </button>
            )}
            <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">
              {text.cancel}
            </button>
          </div>
          <p className="dc-quiet">{text.sharedWith}</p>
        </div>
      </aside>
      {linking && (
        <IssueLinkDialog
          gameBuildId={gameBuildId}
          initial={selected}
          onClose={() => setLinking(false)}
          onDone={(issues) => {
            setSelected(issues)
            setLinking(false)
          }}
          projectId={projectId}
        />
      )}
    </form>
    </CaseRefsProvider>
  )
  if (mode === 'page')
    return (
      <section aria-labelledby="discussion-compose-title" className="dc-compose-page">
        <header className="dc-compose-page-head">
          <button className="dc-ghost" disabled={pending} onClick={onClose} type="button">
            <DiscussionIcon name="back" size={15} />
            {text.backToBoard}
          </button>
          <h2 className="dc-compose-page-title" id="discussion-compose-title">
            {text.newPost}
          </h2>
        </header>
        {form}
      </section>
    )
  return (
    <Dialog
      hint={text.sharedWith}
      labelledBy="discussion-compose-title"
      onClose={() => {
        if (!pending) onClose()
      }}
      title={editing ? text.editPost : text.newPost}
    >
{form}
    </Dialog>
  )
}
