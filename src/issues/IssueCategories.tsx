import { useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { DiscussionIcon } from './discussions/discussionIcons'
import { orderByRecent } from './recentCategories'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { createIssueCategory, deleteIssueCategory, updateIssueCategory } from './issueCategoryApi'
import { CATEGORY_COLORS, type IssueCategory, type IssueCategoryTag } from './issueTypes'

/*
 * 카테고리(ARTEL-1114) — 사용자가 프로젝트마다 정의하고 이슈와 공유 글에 붙인다. 칩 · 고르기 · 관리 창을 이 파일에
 * 모았다. 색은 이름 팔레트(`CATEGORY_COLORS`)에서만 고른다.
 */

export function CategoryChip({ tag, small = false }: { tag: IssueCategoryTag; small?: boolean }) {
  return (
    <span className={`icat-chip icat-chip--${tag.color}${small ? ' icat-chip--small' : ''}`} title={tag.name}>
      <span aria-hidden="true" className="icat-chip-dot" />
      {tag.name}
    </span>
  )
}

type Sort = 'recent' | 'name' | 'usage'

/**
 * 카테고리 관리(ARTEL-1114). 왼쪽은 목록 — 찾기 · 정렬(최근 · 이름 · 많이 쓴) · 안 쓰는 것만 보기 · 여러 개 골라 지우기.
 * 오른쪽은 고른 카테고리의 이름 · 색 · 어디에 쓰였는지와 지우기. 아무것도 고르지 않았으면 오른쪽이 새로 만들기다.
 * 지우면 붙어 있던 이슈 · 글에서 함께 빠지므로, 몇 건에서 빠지는지 보이고 한 번 더 묻는다.
 */
export function CategoryManager({
  projectId,
  categories,
  onChanged,
  onClose,
}: {
  projectId: string
  categories: readonly IssueCategory[]
  onChanged: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const b = t.issues.board
  return (
    <Dialog labelledBy="issue-category-manager" onClose={onClose} title={b.manageCategories}>
      <CategoryWorkbench categories={categories} onChanged={onChanged} projectId={projectId} variant="dialog" />
      <div className="cm2-foot">
        <button className="button button--secondary" onClick={onClose} type="button">
          {b.done}
        </button>
      </div>
    </Dialog>
  )
}

/**
 * 카테고리 목록 · 상세. 창(`dialog`)과 이슈 화면의 카테고리 탭(`page`)이 같이 쓴다. 탭에서는 이슈 수 · 글 수를 칸으로
 * 나눠 보이고, 상세에서 그 카테고리가 붙은 이슈 · 글 목록으로 바로 간다.
 */
export function CategoryWorkbench({
  projectId,
  categories,
  onChanged,
  variant,
  onShowIssues,
  onShowPosts,
}: {
  projectId: string
  categories: readonly IssueCategory[]
  onChanged: () => void
  variant: 'dialog' | 'page'
  onShowIssues?: (category: IssueCategory) => void
  onShowPosts?: (category: IssueCategory) => void
}) {
  const { t } = useI18n()
  const b = t.issues.board
  const page = variant === 'page'
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const [unusedOnly, setUnusedOnly] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState<string[] | null>(null)
  const [listNode, setListNode] = useState<HTMLUListElement | null>(null)

  const usage = (category: IssueCategory) => category.issueCount + category.discussionCount
  const shown = (sort === 'recent'
    ? orderByRecent(projectId, categories)
    : [...categories].sort((x, y) => (sort === 'name' ? x.name.localeCompare(y.name) : usage(y) - usage(x) || x.name.localeCompare(y.name)))
  ).filter((category) => (!unusedOnly || usage(category) === 0) && category.name.toLowerCase().includes(query.trim().toLowerCase()))
  const active = categories.find((category) => category.id === activeId) ?? null

  async function run(work: () => Promise<unknown>, done?: string) {
    setPending(true)
    setError(null)
    try {
      await work()
      onChanged()
      if (done) setNotice(done)
    } catch (failure) {
      setError(failure instanceof ProjectApiError && failure.status === 409 ? b.categoryDuplicate : b.categoryFailed)
    } finally {
      setPending(false)
    }
  }

  const sorts: { value: Sort; label: string }[] = [
    { value: 'recent', label: b.sortRecent },
    { value: 'name', label: b.sortName },
    { value: 'usage', label: b.sortUsage },
  ]
  const confirmTargets = confirming === null ? [] : categories.filter((category) => confirming.includes(category.id))
  const confirmIssues = confirmTargets.reduce((sum, category) => sum + category.issueCount, 0)
  const confirmPosts = confirmTargets.reduce((sum, category) => sum + category.discussionCount, 0)

  return (
      <div className={`cm2 cm2--${variant}`}>
        <section className="cm2-list" aria-label={b.categories}>
          <div className="cm2-tools">
            <div className="dc-search dc-search--block">
              <DiscussionIcon className="dc-search-icon" name="search" size={14} />
              <input
                aria-label={b.searchCategories}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={b.searchCategories}
                type="search"
                value={query}
              />
            </div>
            <div className="cm2-tools-row">
              <div className="dc-segments" role="group" aria-label={b.sortLabel}>
                {sorts.map((option) => (
                  <button aria-pressed={sort === option.value} className="dc-segment" key={option.value} onClick={() => setSort(option.value)} type="button">
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="cm2-toggle">
                <input checked={unusedOnly} onChange={(event) => setUnusedOnly(event.target.checked)} type="checkbox" />
                {b.unusedOnly}
              </label>
            </div>
          </div>
          {page && (
            <div aria-hidden="true" className="cm2-head">
              <span>{b.categoryName}</span>
              <span className="cm2-col">{b.usedByIssues}</span>
              <span className="cm2-col">{b.usedByPosts}</span>
            </div>
          )}
          <div className="cm2-scroll">
            <ul className="cm2-rows" ref={setListNode}>
              {shown.length === 0 && <li className="icat-picker-empty cm2-empty">{b.noCategories}</li>}
              {shown.map((category) => {
                const isChecked = checked.includes(category.id)
                return (
                  <li className={`cm2-row${activeId === category.id ? ' is-active' : ''}`} key={category.id}>
                    <label className="dc-row-select cm2-check" title={category.name}>
                      <input
                        checked={isChecked}
                        onChange={() => setChecked((current) => (isChecked ? current.filter((id) => id !== category.id) : [...current, category.id]))}
                        type="checkbox"
                      />
                      <span aria-hidden="true" className="dc-check" />
                      <span className="visually-hidden">{category.name}</span>
                    </label>
                    <button className="cm2-row-main" onClick={() => setActiveId(category.id)} type="button">
                      <span aria-hidden="true" className={`cm2-dot icat-chip--${category.color}`} />
                      <span className="cm2-name">{category.name}</span>
                      {page ? (
                        <>
                          <span className="cm2-usage cm2-col">{category.issueCount}</span>
                          <span className="cm2-usage cm2-col">{category.discussionCount}</span>
                        </>
                      ) : (
                        <span className="cm2-usage">{usage(category) === 0 ? b.unused : usage(category)}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            <EdgeScrollbar label={b.categories} scroller={listNode} side="right" />
          </div>
          <div className="cm2-list-foot">
            {shown.length > 0 ? (
              <label className="cm2-toggle">
                <input
                  checked={shown.every((category) => checked.includes(category.id))}
                  onChange={(event) => {
                    const ids = shown.map((category) => category.id)
                    setChecked((current) =>
                      event.target.checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)),
                    )
                  }}
                  type="checkbox"
                />
                {b.checkShown(shown.length, categories.length)}
              </label>
            ) : (
              <span className="dc-tag">{b.categoriesTotal(categories.length)}</span>
            )}
            {checked.length > 0 && (
              <button className="dc-mini dc-mini--danger" disabled={pending} onClick={() => setConfirming(checked)} type="button">
                <DiscussionIcon name="trash" size={13} />
                {b.deleteSelected(checked.length)}
              </button>
            )}
          </div>
        </section>

        <section className="cm2-detail" aria-live="polite">
          {active === null ? (
            <NewCategory
              disabled={pending}
              onCreate={(name, color) => run(() => createIssueCategory(projectId, { name, color }), b.created(name))}
            />
          ) : (
            <CategoryEditor
              category={active}
              disabled={pending}
              key={active.id}
              onBack={() => setActiveId(null)}
              onDelete={() => setConfirming([active.id])}
              onShowIssues={onShowIssues && (() => onShowIssues(active))}
              onShowPosts={onShowPosts && (() => onShowPosts(active))}
              onSave={(next) => run(() => updateIssueCategory(projectId, active.id, next), b.saved)}
            />
          )}
          {confirming !== null && (
            <div className="cm2-confirm" role="alertdialog" aria-label={b.deleteConfirmTitle(confirmTargets.length)}>
              <strong>{b.deleteConfirmTitle(confirmTargets.length)}</strong>
              <p>{b.deleteConfirmBody(confirmIssues, confirmPosts)}</p>
              <div className="cm2-confirm-actions">
                <button className="button button--secondary" disabled={pending} onClick={() => setConfirming(null)} type="button">
                  {t.discussions.cancel}
                </button>
                <button
                  className="button button--danger"
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      for (const id of confirming) await deleteIssueCategory(projectId, id)
                      setChecked((current) => current.filter((id) => !confirming.includes(id)))
                      if (activeId !== null && confirming.includes(activeId)) setActiveId(null)
                      setConfirming(null)
                    }, b.deleted(confirmTargets.length))
                  }
                  type="button"
                >
                  {b.deleteCategory}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="dc-error" role="alert">
              {error}
            </p>
          )}
          {notice && !error && <p className="dc-quiet" role="status">{notice}</p>}
        </section>

      </div>
  )
}

function Palette({ value, onPick, disabled }: { value: string; onPick: (color: string) => void; disabled: boolean }) {
  const { t } = useI18n()
  return (
    <span aria-label={t.issues.board.categoryColor} className="cm2-palette" role="radiogroup">
      {CATEGORY_COLORS.map((color) => (
        <button
          aria-checked={value === color}
          aria-label={color}
          className={`icat-swatch icat-chip--${color}`}
          disabled={disabled}
          key={color}
          onClick={() => onPick(color)}
          role="radio"
          type="button"
        />
      ))}
    </span>
  )
}

function NewCategory({ onCreate, disabled }: { onCreate: (name: string, color: string) => Promise<void>; disabled: boolean }) {
  const { t } = useI18n()
  const b = t.issues.board
  const [name, setName] = useState('')
  const [color, setColor] = useState('blue')
  return (
    <form
      className="cm2-form"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!name.trim()) return
        void onCreate(name.trim(), color).then(() => setName(''))
      }}
    >
      <h3 className="dc-cap">{b.newCategory}</h3>
      <label className="dc-field">
        <span className="dc-cap">{b.categoryName}</span>
        <input className="dc-input" disabled={disabled} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={b.categoryNamePlaceholder} value={name} />
      </label>
      <div className="dc-field">
        <span className="dc-cap">{b.categoryColor}</span>
        <Palette disabled={disabled} onPick={setColor} value={color} />
      </div>
      <div className="cm2-preview">
        <span className="dc-cap">{b.preview}</span>
        <span className={`icat-chip icat-chip--${color}`}>
          <span aria-hidden="true" className="icat-chip-dot" />
          {name.trim() || b.categoryNamePlaceholder}
        </span>
      </div>
      <button className="button button--primary" disabled={disabled || !name.trim()} type="submit">
        {b.addCategory}
      </button>
    </form>
  )
}

function CategoryEditor({
  category,
  onSave,
  onDelete,
  onBack,
  disabled,
  onShowIssues,
  onShowPosts,
}: {
  category: IssueCategory
  onSave: (next: { name: string; color: string }) => Promise<void>
  onDelete: () => void
  onBack: () => void
  disabled: boolean
  onShowIssues?: () => void
  onShowPosts?: () => void
}) {
  const { t } = useI18n()
  const b = t.issues.board
  const [name, setName] = useState(category.name)
  const [color, setColor] = useState(category.color)
  const dirty = name.trim() !== category.name || color !== category.color
  return (
    <form
      className="cm2-form"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (dirty && name.trim()) void onSave({ name: name.trim(), color })
      }}
    >
      <button className="dc-ghost cm2-back" onClick={onBack} type="button">
        <DiscussionIcon name="plus" size={14} />
        {b.newCategory}
      </button>
      <label className="dc-field">
        <span className="dc-cap">{b.categoryName}</span>
        <input className="dc-input" disabled={disabled} maxLength={60} onChange={(event) => setName(event.target.value)} value={name} />
      </label>
      <div className="dc-field">
        <span className="dc-cap">{b.categoryColor}</span>
        <Palette disabled={disabled} onPick={setColor} value={color} />
      </div>
      <dl className="cm2-usage-list">
        <dt>{b.usedByIssues}</dt>
        <dd>
          {onShowIssues && category.issueCount > 0 ? (
            <button className="dc-link-button" onClick={onShowIssues} type="button">
              {b.showCategoryIssues(category.issueCount)}
            </button>
          ) : (
            category.issueCount
          )}
        </dd>
        <dt>{b.usedByPosts}</dt>
        <dd>
          {onShowPosts && category.discussionCount > 0 ? (
            <button className="dc-link-button" onClick={onShowPosts} type="button">
              {b.showCategoryPosts(category.discussionCount)}
            </button>
          ) : (
            category.discussionCount
          )}
        </dd>
      </dl>
      <div className="cm2-form-actions">
        <button className="button button--primary" disabled={disabled || !dirty || !name.trim()} type="submit">
          {b.saveCategory}
        </button>
        <button className="button button--danger-quiet" disabled={disabled} onClick={onDelete} type="button">
          {b.deleteCategory}
        </button>
      </div>
    </form>
  )
}
