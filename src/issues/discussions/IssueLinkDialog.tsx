import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Dialog } from '../../design-system/primitives/Dialog'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../i18n/useI18n'
import { versionName } from '../../testCases/testCaseVersions'
import { useTestCaseVersionList } from '../../testCases/useTestCaseVersions'
import { getProjectIssueFacets } from '../issueApi'
import { ISSUE_SEVERITIES, issueNumber, type Issue, type IssueFacets, type IssueFilters, type IssueSeverity, type IssueStatus } from '../issueTypes'
import { SeverityTag } from '../SeverityTag'
import { useProjectIssues } from '../useIssues'
import { DiscussionIcon } from './discussionIcons'
import type { LinkedIssue } from './discussionTypes'

const LIMIT = 50
/** 이보다 많으면 빌드 · TR 목록 위에 찾기 칸을 둔다. */
const SEARCHABLE = 6

const toLinked = (issue: Issue): LinkedIssue => ({
  id: issue.id,
  title: issue.title,
  severity: issue.severity,
  status: issue.status,
  qaTryId: issue.qaTryId,
  qaRunId: issue.qaRunId,
  number: issue.number,
})

type Status = 'ALL' | IssueStatus

/**
 * 공유 글에 연결할 QA 이슈를 고르는 창(ARTEL-1114). 이슈는 수백 건, 빌드 · TR 은 수십 개가 된다 — 거르기마다 그 조건에서
 * 몇 건이 남는지를 고르기 전에 보인다. 빌드 · TR 목록은 이슈가 난 것만, 건수와 함께 나오고 길면 찾는다. 심각도 건수는
 * 고른 빌드 · TR 안에서 센다. 결과가 비면 왜 비었는지와 넓혀 볼 길("모든 빌드에서 N건")을 그 자리에 보인다.
 */
export function IssueLinkDialog({
  projectId,
  initial,
  gameBuildId,
  onClose,
  onDone,
}: {
  projectId: string
  initial: readonly LinkedIssue[]
  /** 글의 빌드 버전. 있으면 그 버전의 이슈로 연다. */
  gameBuildId: string | null
  onClose: () => void
  onDone: (issues: LinkedIssue[]) => void
}) {
  const { t } = useI18n()
  const text = t.discussions
  const b = t.issues.board
  const [picked, setPicked] = useState<LinkedIssue[]>([...initial])
  const [onlyPicked, setOnlyPicked] = useState(false)
  const [input, setInput] = useState('')
  const [build, setBuild] = useState<string | null>(gameBuildId)
  const [testRun, setTestRun] = useState<string | null>(null)
  const [severity, setSeverity] = useState<'ALL' | IssueSeverity>('ALL')
  const [status, setStatus] = useState<Status>('ALL')
  const [query, setQuery] = useState('')
  const [buildQuery, setBuildQuery] = useState('')
  const [runQuery, setRunQuery] = useState('')
  const [all, setAll] = useState<IssueFacets | null>(null)
  const [scoped, setScoped] = useState<{ key: string; facets: IssueFacets } | null>(null)
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null)
  const versions = useTestCaseVersionList(projectId)
  const filters: IssueFilters = { status, severity, gameBuildId: build, testRunId: testRun, query }
  const issues = useProjectIssues(projectId, filters, 0)
  const statusParam = status === 'ALL' ? undefined : status
  const scopeKey = `${build}|${testRun}|${status}`

  // 빌드 · TR 건수는 프로젝트 전체에서, 심각도 건수는 고른 빌드 · TR 안에서 센다.
  useEffect(() => {
    const controller = new AbortController()
    getProjectIssueFacets(projectId, statusParam, controller.signal)
      .then(setAll)
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId, statusParam])
  useEffect(() => {
    const controller = new AbortController()
    getProjectIssueFacets(projectId, statusParam, controller.signal, { gameBuildId: build, testRunId: testRun })
      .then((facets) => setScoped({ key: scopeKey, facets }))
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId, statusParam, build, testRun, scopeKey])
  const here = scoped?.key === scopeKey ? scoped.facets : null

  const nameOf = (id: string | null) => {
    if (id === null) return text.noVersion
    const version = versions.versions.find((one) => one.gameBuildId === id)
    if (version) return versionName(version)
    const facet = all?.builds.find((one) => one.gameBuildId === id)
    return facet?.label || facet?.version || id
  }
  const builds = useMemo(() => {
    const rows = (all?.builds ?? []).filter((one) => one.gameBuildId !== null)
    // 글의 버전은 이슈가 없어도 목록에 둔다 — 왜 비었는지 보이게.
    if (gameBuildId !== null && !rows.some((one) => one.gameBuildId === gameBuildId))
      rows.unshift({ gameBuildId, version: null, label: null, count: 0, openCount: 0 })
    return rows
  }, [all, gameBuildId])
  const needleBuild = buildQuery.trim().toLowerCase()
  const shownBuilds = builds.filter((one) => needleBuild === '' || nameOf(one.gameBuildId).toLowerCase().includes(needleBuild))
  const runs = (all?.testRuns ?? []).filter((run) => run.testRunId !== null && (build === null || run.gameBuildId === build))
  const needleRun = runQuery.trim().toLowerCase()
  const shownRuns = runs.filter((run) => needleRun === '' || (run.name ?? '').toLowerCase().includes(needleRun))
  const runName = (id: string | null) => all?.testRuns.find((run) => run.testRunId === id)?.name ?? id ?? ''

  const rows = useMemo(() => {
    if (!onlyPicked) return issues.items
    const ids = new Set(picked.map((issue) => issue.id))
    return issues.items.filter((issue) => ids.has(issue.id))
  }, [onlyPicked, issues.items, picked])
  const pickedIds = new Set(picked.map((issue) => issue.id))
  const pageAllPicked = rows.length > 0 && rows.every((issue) => pickedIds.has(issue.id))

  function toggle(issue: Issue) {
    setPicked((current) =>
      current.some((item) => item.id === issue.id)
        ? current.filter((item) => item.id !== issue.id)
        : current.length < LIMIT
          ? [...current, toLinked(issue)]
          : current,
    )
  }
  function togglePage() {
    if (pageAllPicked) setPicked((current) => current.filter((item) => !rows.some((issue) => issue.id === item.id)))
    else
      setPicked((current) => {
        const next = [...current]
        for (const issue of rows) if (!next.some((item) => item.id === issue.id) && next.length < LIMIT) next.push(toLinked(issue))
        return next
      })
  }
  function pickBuild(next: string | null) {
    setBuild(next)
    setTestRun(null)
    setRunQuery('')
  }
  function reset() {
    pickBuild(null)
    setSeverity('ALL')
    setStatus('ALL')
    setQuery('')
    setInput('')
  }

  // 지금 걸린 거르기. 표 위에 칩으로 보이고 하나씩 풀 수 있다.
  const active: { key: string; label: string; clear: () => void }[] = [
    ...(build !== null ? [{ key: 'build', label: `${b.build} ${nameOf(build)}`, clear: () => pickBuild(null) }] : []),
    ...(testRun !== null ? [{ key: 'run', label: `${b.testRun} ${runName(testRun)}`, clear: () => setTestRun(null) }] : []),
    ...(severity !== 'ALL' ? [{ key: 'sev', label: t.issues.severityLabels[severity], clear: () => setSeverity('ALL') }] : []),
    ...(status !== 'ALL' ? [{ key: 'status', label: t.issues.statusLabels[status], clear: () => setStatus('ALL') }] : []),
    ...(query !== ''
      ? [
          {
            key: 'q',
            label: `"${query}"`,
            clear: () => {
              setQuery('')
              setInput('')
            },
          },
        ]
      : []),
  ]
  // 빌드만 풀었을 때 남는 수. 심각도는 그대로 둔다. 제목 검색은 셀 수 없어 수를 빼고 보인다.
  const widerCount =
    build === null || all === null ? 0 : severity === 'ALL' ? all.total : (all.severities[severity] ?? 0)
  const changed = picked.length !== initial.length || picked.some((issue) => !initial.some((one) => one.id === issue.id))
  const doneLabel =
    picked.length > 0 ? text.linkDone(picked.length) : initial.length > 0 ? text.unlinkAll : text.pickIssuesFirst

  return (
    <Dialog labelledBy="issue-link-dialog" onClose={onClose} title={text.linkIssues}>
      <div className="il2">
        <aside className="il2-filters" aria-label={b.filters}>
          <FilterBlock title={b.build}>
            {builds.length > SEARCHABLE && <MiniSearch label={text.searchVersions} onChange={setBuildQuery} value={buildQuery} />}
            <div className="il2-runs il2-runs--scroll">
              <FacetButton active={build === null} count={all?.total} label={text.allVersions} onClick={() => pickBuild(null)} />
              {shownBuilds.map((one) => (
                <FacetButton
                  active={build === one.gameBuildId}
                  badge={one.gameBuildId === gameBuildId ? text.thisPostVersion : undefined}
                  count={one.count}
                  key={one.gameBuildId}
                  label={nameOf(one.gameBuildId)}
                  mono
                  onClick={() => pickBuild(one.gameBuildId)}
                />
              ))}
              {shownBuilds.length === 0 && <p className="dc-quiet il2-none">{text.noMatchingVersions}</p>}
            </div>
          </FilterBlock>
          <FilterBlock title={b.testRun}>
            {runs.length > SEARCHABLE && <MiniSearch label={text.searchTestRuns} onChange={setRunQuery} value={runQuery} />}
            <div className="il2-runs il2-runs--scroll">
              <FacetButton
                active={testRun === null}
                count={build === null ? all?.total : builds.find((one) => one.gameBuildId === build)?.count}
                label={b.allTestRuns}
                onClick={() => setTestRun(null)}
              />
              {shownRuns.map((run) => (
                <FacetButton
                  active={testRun === run.testRunId}
                  count={run.count}
                  key={run.testRunId}
                  label={run.name ?? run.testRunId ?? ''}
                  onClick={() => setTestRun(run.testRunId)}
                />
              ))}
              {runs.length === 0 && <p className="dc-quiet il2-none">{build === null ? text.noRunIssues : text.noRunIssuesInBuild}</p>}
            </div>
          </FilterBlock>
          <FilterBlock title={b.severity}>
            <div className="il2-chips">
              {(['ALL', ...ISSUE_SEVERITIES] as const).map((value) => {
                const count = value === 'ALL' ? here?.total : here === null ? undefined : (here.severities[value] ?? 0)
                return (
                  <button
                    aria-pressed={severity === value}
                    className={`il2-run il2-run--chip${count === 0 && severity !== value ? ' is-empty' : ''}`}
                    key={value}
                    onClick={() => setSeverity(value)}
                    type="button"
                  >
                    {value === 'ALL' ? b.all : t.issues.severityLabels[value]}
                    {count !== undefined && <span className="ib-seg-count">{count}</span>}
                  </button>
                )
              })}
            </div>
          </FilterBlock>
          <FilterBlock title={t.issues.filters.status}>
            <div className="dc-segments il2-status">
              {(['ALL', 'OPEN', 'RESOLVED'] as const).map((value) => (
                <button aria-pressed={status === value} className="dc-segment" key={value} onClick={() => setStatus(value)} type="button">
                  {value === 'ALL' ? t.issues.filters.all : t.issues.statusLabels[value]}
                </button>
              ))}
            </div>
          </FilterBlock>
        </aside>

        <section className="il2-main">
          <div className="il2-bar">
            <form
              className="dc-search il2-search"
              onSubmit={(event) => {
                // 창은 글 작성 form 안에서 열린다. React 이벤트는 portal 을 넘어 올라가므로 막지 않으면 글이 게시된다.
                event.preventDefault()
                event.stopPropagation()
                setQuery(input.trim())
              }}
              role="search"
            >
              <DiscussionIcon className="dc-search-icon" name="search" size={15} />
              <input
                aria-label={text.searchIssues}
                autoFocus
                maxLength={200}
                onChange={(event) => setInput(event.target.value)}
                placeholder={text.searchIssuesEnter}
                type="search"
                value={input}
              />
            </form>
            <label className="cm2-toggle">
              <input checked={onlyPicked} onChange={(event) => setOnlyPicked(event.target.checked)} type="checkbox" />
              {text.onlyPicked(picked.length)}
            </label>
          </div>
          {active.length > 0 && (
            <div className="il2-active" aria-label={text.activeFilters}>
              {active.map((one) => (
                <button aria-label={`${text.unpick} ${one.label}`} className="il2-active-chip" key={one.key} onClick={one.clear} type="button">
                  {one.label}
                  <DiscussionIcon name="close" size={11} />
                </button>
              ))}
              <button className="dc-link-button" onClick={reset} type="button">
                {text.resetFilters}
              </button>
            </div>
          )}
          <div className="il2-table-wrap">
            <div className="il2-table" ref={setListNode}>
              <div className="il2-head">
                <label className="dc-row-select il2-check" title={text.pickPage}>
                  <input checked={pageAllPicked} disabled={rows.length === 0} onChange={togglePage} type="checkbox" />
                  <span aria-hidden="true" className="dc-check" />
                  <span className="visually-hidden">{text.pickPage}</span>
                </label>
                <span>{b.colIssue}</span>
                <span>{b.colBuild}</span>
                <span>{b.colTestRun}</span>
                <span>{b.colStatus}</span>
              </div>
              {issues.status === 'loading' && <p className="dc-quiet dc-pad">{text.loading}</p>}
              {issues.status === 'error' && <p className="dc-error dc-pad">{text.failed}</p>}
              {issues.status === 'ready' && rows.length === 0 && (
                <div className="il2-empty">
                  <DiscussionIcon name="search" size={20} />
                  <strong>
                    {onlyPicked
                      ? text.noPickedHere
                      : build !== null && active.length === 1
                        ? text.noIssuesInBuild(nameOf(build))
                        : t.issues.list.emptyFiltered}
                  </strong>
                  {!onlyPicked && widerCount > 0 && <span className="dc-quiet">{text.noIssuesInBuildHelp}</span>}
                  {!onlyPicked && (
                    <span className="il2-empty-actions">
                      {widerCount > 0 && (
                        <button className="button button--secondary" onClick={() => pickBuild(null)} type="button">
                          {query === '' ? text.searchAllBuilds(widerCount) : text.searchAllBuildsPlain}
                        </button>
                      )}
                      {active.length > 1 && (
                        <button className="button button--secondary" onClick={reset} type="button">
                          {text.resetFilters}
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )}
              {rows.map((issue) => {
                const on = pickedIds.has(issue.id)
                return (
                  <button
                    aria-pressed={on}
                    className="il2-row"
                    disabled={!on && picked.length >= LIMIT}
                    key={issue.id}
                    onClick={() => toggle(issue)}
                    type="button"
                  >
                    <span aria-hidden="true" className="dc-check il2-check">
                      {on && <DiscussionIcon name="check" size={12} />}
                    </span>
                    <span className="il2-issue">
                      <span className="il2-issue-top">
                        <span className="dc-tag">#{issueNumber(issue)}</span>
                        <SeverityTag severity={issue.severity} />
                        <span className="il2-title">{issue.title}</span>
                      </span>
                      <span className="il2-scenario">{issue.origin?.testScenarioTitle}</span>
                    </span>
                    <span className="ib-version">{issue.origin?.buildVersion ?? '—'}</span>
                    <span className="il2-tr" title={issue.origin?.testRunName ?? undefined}>
                      {issue.origin?.testRunName ?? '—'}
                    </span>
                    <span className={`ib-status ib-status--${issue.status.toLowerCase()}`}>{t.issues.statusLabels[issue.status]}</span>
                  </button>
                )
              })}
              {issues.hasMore && !onlyPicked && (
                <div className="ib-more">
                  <button className="button button--secondary" disabled={issues.loadingMore} onClick={issues.loadMore} type="button">
                    {issues.loadingMore ? text.loading : text.more}
                  </button>
                </div>
              )}
            </div>
            <EdgeScrollbar label={text.linked} scroller={listNode} side="right" />
          </div>
        </section>

        <footer className="il2-foot">
          <span className="il2-foot-picked">
            <span className="dc-quiet">{text.pickedCount(picked.length, LIMIT)}</span>
            {picked.slice(0, 4).map((issue) => (
              <span className="il2-foot-chip" key={issue.id} title={issue.title}>
                #{issue.number ?? issue.id}
              </span>
            ))}
            {picked.length > 4 && <span className="dc-tag">+{picked.length - 4}</span>}
            {picked.length > 0 && (
              <button className="dc-link-button il2-clear" onClick={() => setPicked([])} type="button">
                {text.clearPicked}
              </button>
            )}
          </span>
          <span className="il2-foot-actions">
            <button className="button button--secondary" onClick={onClose} type="button">
              {text.cancel}
            </button>
            <button
              className={`button ${picked.length === 0 && initial.length > 0 ? 'button--danger-quiet' : 'button--primary'}`}
              disabled={!changed}
              onClick={() => onDone(picked)}
              type="button"
            >
              {doneLabel}
            </button>
          </span>
        </footer>
      </div>
    </Dialog>
  )
}

function FilterBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="dc-field il2-block">
      <span className="dc-cap">{title}</span>
      {children}
    </div>
  )
}

function MiniSearch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="dc-search dc-search--block il2-mini-search">
      <DiscussionIcon className="dc-search-icon" name="search" size={13} />
      <input aria-label={label} onChange={(event) => onChange(event.target.value)} placeholder={label} type="search" value={value} />
    </label>
  )
}

function FacetButton({
  active,
  label,
  count,
  onClick,
  badge,
  mono = false,
}: {
  active: boolean
  label: string
  count: number | undefined
  onClick: () => void
  badge?: string
  mono?: boolean
}) {
  return (
    <button aria-pressed={active} className={`il2-run${count === 0 && !active ? ' is-empty' : ''}`} onClick={onClick} title={label} type="button">
      <span className={`il2-run-name${mono ? ' il2-run-name--mono' : ''}`}>{label}</span>
      {badge && <span className="csd-badge">{badge}</span>}
      {count !== undefined && <span className="ib-seg-count">{count}</span>}
    </button>
  )
}
