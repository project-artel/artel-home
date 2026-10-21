import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { formatDate } from '../../projects/formatters'
import { ProjectApiError } from '../../projects/projectApi'
import { versionName, type TestCaseVersionSummary, type VersionGroup } from '../../testCases/testCaseVersions'
import { createIssueCategory } from '../issueCategoryApi'
import { CATEGORY_COLORS, type IssueCategory } from '../issueTypes'
import { orderByRecent, touchCategories } from '../recentCategories'
import { DiscussionIcon } from './discussionIcons'

export type DrawerTab = 'version' | 'category'

const RECENT = 8

/**
 * 글 작성의 빌드 버전 · 카테고리 고르기(ARTEL-1114). 오른쪽 칸의 칸을 누르면 쓰는 자리 위로 왼쪽에서 밀려 나온다.
 * 버전과 카테고리는 계속 늘어난다 — 작은 드롭다운으로는 찾을 수 없어, 쓰는 자리 넓이를 빌려 찾기 · 묶음 · 최근 쓴 것을
 * 한 번에 보인다. 고르는 즉시 글에 반영되고, 닫기는 Esc · 바깥 누르기 · "완료" 다.
 */
export function ComposeSettingsDrawer({
  projectId,
  tab,
  onTab,
  onClose,
  versions,
  groups,
  versionsLoading,
  gameBuildId,
  onBuild,
  categories,
  categoryIds,
  onCategories,
  onCategoryCreated,
  onManageCategories,
}: {
  projectId: string
  tab: DrawerTab
  onTab: (tab: DrawerTab) => void
  onClose: () => void
  versions: readonly TestCaseVersionSummary[]
  groups: readonly VersionGroup[]
  versionsLoading: boolean
  gameBuildId: string | null
  onBuild: (gameBuildId: string | null) => void
  categories: readonly IssueCategory[]
  categoryIds: readonly string[]
  onCategories: Dispatch<SetStateAction<string[]>>
  onCategoryCreated: () => void
  onManageCategories: () => void
}) {
  const { t } = useI18n()
  const text = t.discussions
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 열리면 찾기 칸으로, 닫히면 연 칸으로 돌아간다.
    const opener = document.activeElement as HTMLElement | null
    return () => opener?.focus()
  }, [])
  useEffect(() => {
    panel.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
  }, [tab])
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tabs: { value: DrawerTab; label: string; count: string }[] = [
    {
      value: 'version',
      label: text.buildVersion,
      count: versionName(versions.find((one) => one.gameBuildId === gameBuildId) ?? { label: null, version: text.noVersion }),
    },
    { value: 'category', label: text.categories, count: String(categoryIds.length) },
  ]

  return (
    <div className="csd" role="presentation">
      <button aria-label={text.drawerClose} className="csd-scrim" onClick={onClose} tabIndex={-1} type="button" />
      <div aria-label={text.drawerTitle} aria-modal="true" className="csd-panel" ref={panel} role="dialog">
        <header className="csd-head">
          <div className="dc-segments csd-tabs" role="tablist">
            {tabs.map((option) => (
              <button
                aria-selected={tab === option.value}
                className="dc-segment csd-tab"
                key={option.value}
                onClick={() => onTab(option.value)}
                role="tab"
                type="button"
              >
                {option.label}
                <span className="csd-tab-value">{option.count}</span>
              </button>
            ))}
          </div>
          <button aria-label={text.drawerClose} className="dc-ghost dc-ghost--icon" onClick={onClose} title={text.drawerClose} type="button">
            <DiscussionIcon name="close" size={16} />
          </button>
        </header>
        {tab === 'version' ? (
          <VersionPane
            gameBuildId={gameBuildId}
            groups={groups}
            loading={versionsLoading}
            onBuild={onBuild}
            versions={versions}
          />
        ) : (
          <CategoryPane
            categories={categories}
            categoryIds={categoryIds}
            onCategories={onCategories}
            onCreated={onCategoryCreated}
            onManage={onManageCategories}
            projectId={projectId}
          />
        )}
        <footer className="csd-foot">
          <span className="dc-quiet">{text.drawerHint}</span>
          <button className="button button--primary" onClick={onClose} type="button">
            {text.drawerDone}
          </button>
        </footer>
      </div>
    </div>
  )
}

/** 버전: 왼쪽은 묶음, 오른쪽은 그 묶음의 버전. 케이스 라이브러리의 버전 목록과 같은 이름 · 묶음이다. */
function VersionPane({
  versions,
  groups,
  loading,
  gameBuildId,
  onBuild,
}: {
  versions: readonly TestCaseVersionSummary[]
  groups: readonly VersionGroup[]
  loading: boolean
  gameBuildId: string | null
  onBuild: (gameBuildId: string | null) => void
}) {
  const { t } = useI18n()
  const text = t.discussions
  const [query, setQuery] = useState('')
  // null 은 모든 묶음, '' 는 묶음 없는 버전.
  const [group, setGroup] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const needle = query.trim().toLowerCase()
  const visible = versions.filter((one) => showHidden || !one.hidden || one.gameBuildId === gameBuildId)
  const shown = visible.filter(
    (one) =>
      (group === null || (group === '' ? one.groupId === null : one.groupId === group)) &&
      (needle === '' || versionName(one).toLowerCase().includes(needle) || one.version.toLowerCase().includes(needle)),
  )
  const ungrouped = visible.filter((one) => one.groupId === null).length
  const hiddenCount = versions.filter((one) => one.hidden).length

  return (
    <div className="csd-body csd-body--split">
      <nav aria-label={text.versionGroups} className="csd-groups">
        <GroupButton active={group === null} count={visible.length} label={text.allVersions} onClick={() => setGroup(null)} />
        {groups.map((one) => (
          <GroupButton
            active={group === one.id}
            count={visible.filter((version) => version.groupId === one.id).length}
            key={one.id}
            label={one.name}
            onClick={() => setGroup(one.id)}
          />
        ))}
        {groups.length > 0 && ungrouped > 0 && (
          <GroupButton active={group === ''} count={ungrouped} label={text.ungrouped} onClick={() => setGroup('')} />
        )}
      </nav>
      <section className="csd-main">
        <div className="csd-tools">
          <label className="dc-search csd-search">
            <DiscussionIcon className="dc-search-icon" name="search" size={14} />
            <input aria-label={text.searchVersions} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchVersions} type="search" value={query} />
          </label>
          {hiddenCount > 0 && (
            <label className="cm2-toggle">
              <input checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} type="checkbox" />
              {text.showHiddenVersions(hiddenCount)}
            </label>
          )}
        </div>
        <ul aria-label={text.buildVersion} className="csd-list" role="listbox">
          {group === null && needle === '' && (
            <OptionRow onClick={() => onBuild(null)} selected={gameBuildId === null} single>
              <span className="csd-row-name">{text.noVersion}</span>
              <span className="csd-row-meta">{text.noVersionHelp}</span>
            </OptionRow>
          )}
          {loading && <li className="dc-quiet dc-pad">{text.loading}</li>}
          {!loading && shown.length === 0 && <li className="dc-quiet dc-pad">{text.noMatchingVersions}</li>}
          {shown.map((one) => (
            <OptionRow key={one.gameBuildId} onClick={() => onBuild(one.gameBuildId)} selected={gameBuildId === one.gameBuildId} single>
              <span className="csd-row-name">
                <span className="ib-version">{versionName(one)}</span>
                {one.latest && <span className="csd-badge">{text.latestVersion}</span>}
                {one.hidden && <span className="csd-badge csd-badge--muted">{text.hiddenVersion}</span>}
              </span>
              <span className="csd-row-meta">
                {text.versionCases(one.total)} · {formatDate(one.createdAt)}
              </span>
            </OptionRow>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** 카테고리: 고른 것 · 최근 쓴 것 · 전부(이름순). 찾는 이름이 없으면 그 자리에서 만든다. */
function CategoryPane({
  projectId,
  categories,
  categoryIds,
  onCategories,
  onCreated,
  onManage,
}: {
  projectId: string
  categories: readonly IssueCategory[]
  categoryIds: readonly string[]
  onCategories: Dispatch<SetStateAction<string[]>>
  onCreated: () => void
  onManage: () => void
}) {
  const { t } = useI18n()
  const text = t.discussions
  const b = t.issues.board
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needle = query.trim().toLowerCase()
  // 최근 순서는 연 순간의 것으로 둔다. 고를 때마다 앞으로 당기면 누르려던 줄이 손 밑에서 움직인다.
  const [recentIds] = useState(() => orderByRecent(projectId, categories).slice(0, RECENT).map((one) => one.id))
  const recent = recentIds.flatMap((id) => categories.filter((one) => one.id === id))
  const byName = useMemo(() => [...categories].sort((x, y) => x.name.localeCompare(y.name)), [categories])
  const matches = byName.filter((one) => one.name.toLowerCase().includes(needle))
  const exact = categories.some((one) => one.name.toLowerCase() === needle)
  const picked = categories.filter((one) => categoryIds.includes(one.id))

  function toggle(id: string) {
    onCategories((current) => {
      if (current.includes(id)) return current.filter((one) => one !== id)
      touchCategories(projectId, [id])
      return [...current, id]
    })
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
      touchCategories(projectId, [created.id])
      onCategories((current) => [...current, created.id])
      onCreated()
      setQuery('')
    } catch (failure) {
      setError(failure instanceof ProjectApiError && failure.status === 409 ? b.categoryDuplicate : b.categoryFailed)
    } finally {
      setPending(false)
    }
  }
  const row = (category: IssueCategory) => (
    <OptionRow key={category.id} onClick={() => toggle(category.id)} selected={categoryIds.includes(category.id)}>
      <span className="csd-row-name">
        <span aria-hidden="true" className={`cm2-dot icat-chip--${category.color}`} />
        {category.name}
      </span>
      <span className="csd-row-meta">{category.issueCount + category.discussionCount}</span>
    </OptionRow>
  )

  return (
    <div className="csd-body">
      <div className="csd-tools">
        <label className="dc-search csd-search">
          <DiscussionIcon className="dc-search-icon" name="search" size={14} />
          <input
            aria-label={b.searchOrCreate}
            maxLength={60}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
              event.preventDefault()
              if (matches.length === 1) toggle(matches[0].id)
              else if (needle && !exact) void create()
            }}
            placeholder={b.searchOrCreate}
            type="search"
            value={query}
          />
        </label>
        <button className="dc-link-button" onClick={onManage} type="button">
          {b.manageCategories}
        </button>
      </div>
      <div className="csd-picked" aria-live="polite">
        <span className="dc-cap">{text.pickedCategories(picked.length)}</span>
        {picked.length === 0 ? (
          <span className="dc-quiet">{text.noPickedCategories}</span>
        ) : (
          picked.map((category) => (
            <button
              aria-label={`${text.unpick} ${category.name}`}
              className={`icat-chip icat-chip--${category.color} csd-picked-chip`}
              key={category.id}
              onClick={() => toggle(category.id)}
              type="button"
            >
              <span aria-hidden="true" className="icat-chip-dot" />
              {category.name}
              <DiscussionIcon name="close" size={11} />
            </button>
          ))
        )}
      </div>
      {error && (
        <p className="dc-error" role="alert">
          {error}
        </p>
      )}
      <div className="csd-scroll">
        {needle !== '' && !exact && (
          <button className="csd-create" disabled={pending} onClick={() => void create()} type="button">
            <DiscussionIcon name="plus" size={14} />
            {b.createCategory(query.trim())}
          </button>
        )}
        {needle === '' && recent.length > 0 && (
          <CategorySection title={text.recentCategories}>{recent.map(row)}</CategorySection>
        )}
        <CategorySection title={needle === '' ? text.allCategoriesByName(categories.length) : text.matchingCategories(matches.length)}>
          {matches.length === 0 ? <li className="dc-quiet dc-pad">{b.noCategories}</li> : matches.map(row)}
        </CategorySection>
      </div>
    </div>
  )
}

function CategorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="csd-section">
      <h4 className="dc-cap">{title}</h4>
      <ul className="csd-grid" role="listbox" aria-multiselectable="true" aria-label={title}>
        {children}
      </ul>
    </section>
  )
}

function OptionRow({
  selected,
  onClick,
  single = false,
  children,
}: {
  selected: boolean
  onClick: () => void
  single?: boolean
  children: ReactNode
}) {
  return (
    <li>
      <button aria-selected={selected} className={`csd-row${selected ? ' is-on' : ''}`} onClick={onClick} role="option" type="button">
        <span aria-hidden="true" className={single ? 'csd-radio' : 'dc-check'}>
          {selected && !single && <DiscussionIcon name="check" size={12} />}
        </span>
        {children}
      </button>
    </li>
  )
}

function GroupButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button aria-pressed={active} className="il2-run" onClick={onClick} type="button">
      <span className="il2-run-name">{label}</span>
      <span className="ib-seg-count">{count}</span>
    </button>
  )
}
