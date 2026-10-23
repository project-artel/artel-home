import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { DiscussionIcon } from './discussions/discussionIcons'
import type { IssueCategory } from './issueTypes'
import { orderByRecent, touchCategories } from './recentCategories'

/** 줄에 바로 보이는 카테고리 수. 최근에 쓴 것부터이고, 나머지는 "+N" 안에서 찾는다. */
const VISIBLE = 5

/**
 * 카테고리로 거르기(ARTEL-1114). 카테고리가 많아지면 한 줄이 넘치므로, 앞의 몇 개(고른 것은 늘 보인다)만 칩으로
 * 두고 나머지는 "+N" 을 눌러 검색해 고른다.
 */
export function CategoryFilter({
  categories,
  selected,
  onChange,
  allLabel,
  countOf,
  onManage,
  projectId,
}: {
  projectId: string
  categories: readonly IssueCategory[]
  selected: string | null
  onChange: (categoryId: string | null) => void
  allLabel: string
  countOf: (category: IssueCategory) => number
  onManage?: () => void
}) {
  const { t } = useI18n()
  const b = t.issues.board
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function away(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open])

  if (categories.length === 0 && !onManage) return null
  const ordered = orderByRecent(projectId, categories)
  const visible = ordered.slice(0, VISIBLE)
  const picked = categories.find((category) => category.id === selected)
  if (picked && !visible.includes(picked)) visible.push(picked)
  const hidden = categories.length - visible.length
  const matches = ordered.filter((category) => category.name.toLowerCase().includes(query.trim().toLowerCase()))
  const choose = (categoryId: string | null) => {
    if (categoryId !== null) touchCategories(projectId, [categoryId])
    onChange(categoryId)
  }

  const chip = (category: IssueCategory) => (
    <button
      aria-pressed={selected === category.id}
      className={`icat-chip icat-chip--${category.color} icat-chip--toggle`}
      key={category.id}
      onClick={() => choose(selected === category.id ? null : category.id)}
      type="button"
    >
      <span aria-hidden="true" className="icat-chip-dot" />
      {category.name}
      <span className="ib-seg-count">{countOf(category)}</span>
    </button>
  )

  return (
    <div aria-label={b.categories} className="icat-filter" role="group">
      <span className="dc-label">{b.categories}</span>
      <button aria-pressed={selected === null} className="ib-run-chip" onClick={() => onChange(null)} type="button">
        {allLabel}
      </button>
      {visible.map(chip)}
      {hidden > 0 && (
        <div className="icat-more" ref={box}>
          <button aria-expanded={open} className="ib-run-chip" onClick={() => setOpen((value) => !value)} type="button">
            {b.moreCategories(hidden)}
          </button>
          {open && (
            <div className="icat-more-panel" role="dialog" aria-label={b.categories}>
              <div className="dc-search dc-search--block">
                <DiscussionIcon className="dc-search-icon" name="search" size={14} />
                <input
                  aria-label={b.searchCategories}
                  autoFocus
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={b.searchCategories}
                  type="search"
                  value={query}
                />
              </div>
              <ul className="icat-more-list">
                {matches.length === 0 && <li className="icat-picker-empty">{b.noCategories}</li>}
                {matches.map((category) => (
                  <li key={category.id}>
                    <button
                      aria-pressed={selected === category.id}
                      className="icat-more-option"
                      onClick={() => {
                        choose(category.id)
                        setOpen(false)
                      }}
                      type="button"
                    >
                      <span aria-hidden="true" className={`icat-chip-dot icat-chip--${category.color}`} />
                      <span className="icat-more-name">{category.name}</span>
                      <span className="ib-seg-count">{countOf(category)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {onManage && (
        <button className="icat-manage" onClick={onManage} type="button">
          {b.manageCategories}
        </button>
      )}
    </div>
  )
}
