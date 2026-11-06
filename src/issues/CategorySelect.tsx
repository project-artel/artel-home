import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { DiscussionIcon } from './discussions/discussionIcons'
import { createIssueCategory } from './issueCategoryApi'
import { CATEGORY_COLORS, type IssueCategory } from './issueTypes'
import { orderByRecent, touchCategories } from './recentCategories'

/**
 * 카테고리 여러 개 고르기(ARTEL-1114). 칸을 누르면 아래에 목록이 열리고, 찾기 · 체크 · 그 자리에서 새로 만들기를 한다.
 * 카테고리가 수십 개여도 칸은 한 줄이다 — 고른 것만 칩으로 보이고, 나머지는 열어서 찾는다.
 */
export function CategorySelect({
  projectId,
  categories,
  selected,
  onChange,
  onCreated,
  onManage,
  disabled = false,
}: {
  projectId: string
  categories: readonly IssueCategory[]
  selected: readonly string[]
  onChange: (ids: string[]) => void
  /** 새로 만든 뒤 목록을 다시 읽게 한다. */
  onCreated: () => void
  onManage: () => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  const b = t.issues.board
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function away(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open])

  const needle = query.trim().toLowerCase()
  const matches = orderByRecent(projectId, categories).filter((category) => category.name.toLowerCase().includes(needle))
  const exact = categories.some((category) => category.name.toLowerCase() === needle)
  const picked = categories.filter((category) => selected.includes(category.id))

  function toggle(id: string) {
    if (!selected.includes(id)) touchCategories(projectId, [id])
    onChange(selected.includes(id) ? selected.filter((one) => one !== id) : [...selected, id])
  }

  async function create() {
    const name = query.trim()
    if (!name || pending) return
    setPending(true)
    setError(null)
    try {
      const created = await createIssueCategory(projectId, {
        name,
        color: CATEGORY_COLORS[(categories.length + 1) % CATEGORY_COLORS.length],
      })
      onChange([...selected, created.id])
      onCreated()
      setQuery('')
    } catch (failure) {
      setError(failure instanceof ProjectApiError && failure.status === 409 ? b.categoryDuplicate : b.categoryFailed)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="icat-select" ref={box}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`icat-select-field${open ? ' is-open' : ''}`}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {picked.length === 0 ? (
          <span className="icat-select-placeholder">{b.pickCategories}</span>
        ) : (
          <span className="icat-select-chips">
            {picked.map((category) => (
              <span className={`icat-chip icat-chip--${category.color}`} key={category.id}>
                <span aria-hidden="true" className="icat-chip-dot" />
                {category.name}
              </span>
            ))}
          </span>
        )}
        <DiscussionIcon className="icat-select-caret" name="chevron" size={14} />
      </button>
      {open && (
        <div className="icat-select-panel" role="dialog" aria-label={b.categories}>
          <div className="dc-search dc-search--block">
            <DiscussionIcon className="dc-search-icon" name="search" size={14} />
            <input
              aria-label={b.searchCategories}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (matches.length === 1 && exact) toggle(matches[0].id)
                  else if (!exact) void create()
                }
                if (event.key === 'Escape') setOpen(false)
              }}
              placeholder={b.searchOrCreate}
              type="search"
              value={query}
            />
          </div>
          <ul className="icat-select-list" role="listbox" aria-multiselectable="true">
            {matches.map((category) => {
              const on = selected.includes(category.id)
              return (
                <li key={category.id}>
                  <button aria-selected={on} className="icat-select-option" onClick={() => toggle(category.id)} role="option" type="button">
                    <span aria-hidden="true" className="dc-check">
                      {on && <DiscussionIcon name="check" size={12} />}
                    </span>
                    <span aria-hidden="true" className={`icat-chip-dot icat-chip--${category.color}`} />
                    <span className="icat-more-name">{category.name}</span>
                    <span className="ib-seg-count">{category.issueCount + category.discussionCount}</span>
                  </button>
                </li>
              )
            })}
            {matches.length === 0 && !needle && <li className="icat-picker-empty">{b.noCategories}</li>}
          </ul>
          {needle && !exact && (
            <button className="icat-select-create" disabled={pending} onClick={() => void create()} type="button">
              <DiscussionIcon name="plus" size={14} />
              {b.createCategory(query.trim())}
            </button>
          )}
          {error && <p className="dc-error">{error}</p>}
          <div className="icat-select-foot">
            <span className="dc-quiet">{b.selectedCount(selected.length)}</span>
            <button
              className="icat-manage"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
              type="button"
            >
              {b.manageCategories}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
