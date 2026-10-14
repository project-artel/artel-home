import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import { ProjectApiError } from '../projects/projectApi'
import type { ExtrasStatus } from '../projects/workspace/workspaceContext'
import { ContextMenu, type ContextMenuItem } from '../testCases/ContextMenu'
import {
  arrangeVersions,
  hiddenVersions,
  versionName,
  type TestCaseVersionSummary,
} from '../testCases/testCaseVersions'
import { useTestCaseVersionList } from '../testCases/useTestCaseVersions'
import { VersionTreeDialog } from '../testCases/VersionTreeDialog'
import { ClipboardListIcon } from '../testScenarios/scenarioIcons'
import { NewRunDialog } from './NewRunDialog'
import { bucketOf, countRuns, initialBucket, NO_VERSION, runsIn, strayBuilds } from './runLibrary'
import {
  changeRunGameBuild,
  deleteTestRun,
  gameBuildName,
  getRunDeletionPreview,
  type RunDeletionPreview,
  type RunLastQa,
  type TestRun,
} from './testRunApi'

/** TR 을 끌어 다른 버전에 놓을 때 싣는 형식. 다른 끌기(파일 등)와 섞이지 않게 따로 둔다. */
const RUN_DRAG = 'application/x-artel-test-run'

/**
 * The project's TestRuns (ARTEL-1049). A run follows one case version — the game build whose test cases its scenarios
 * are written from — so the screen is a version tree on the left and the chosen version's runs as a table on the right,
 * the same split as the case library. Groups and hidden versions are the library's own, so a `1.X` group made there
 * shows here too.
 *
 * A run moves to another version by dragging its row onto the version, or from its menu. Its scenarios stay; authoring
 * follows the new version from the next turn.
 *
 * The list is handed in rather than read here: the workspace loads it once for the dashboard and this section together.
 */
export function RunListPanel({
  onChanged,
  onReload,
  projectId,
  runs,
  status,
}: {
  /** Re-read the list after this panel creates, moves or deletes a run. */
  onChanged: () => Promise<void>
  onReload: () => void
  projectId: string
  runs: TestRun[]
  status: ExtrasStatus
}) {
  const { t } = useI18n()
  const r = t.scenarios.runList
  const v = t.testCases.versions
  const navigate = useNavigate()
  // 대시보드의 "이 케이스로 시나리오 만들기"가 실어 보낸 요청문. 런을 여는 길에 함께 넘겨
  // 입력창까지 도달시킨다 — 여기서 잃으면 버튼이 목적지 없는 링크가 된다.
  const [searchParams, setSearchParams] = useSearchParams()
  const draft = searchParams.get('draft')
  const versionList = useTestCaseVersionList(projectId)
  const versions = versionList.versions
  const bucket = initialBucket(searchParams.get('version'), versions, runs)
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [creating, setCreating] = useState(false)
  const [moving, setMoving] = useState<TestRun | null>(null)
  const [menu, setMenu] = useState<{ run: TestRun; x: number; y: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // 틀이 화면 아래까지 꽉 차게, 이 틀이 시작하는 높이를 잰다(케이스 라이브러리의 --tcl-top 과 같은 방식).
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TestRun | null>(null)
  const [deleting, setDeleting] = useState(false)
  // 이 런을 지우면 무엇이 같이 없어지는지(ARTEL-487). 열 때 읽어 온다 — 목록의 런마다 미리
  // 세면 화면 하나에 질의가 런 수만큼 붙는데, 정작 읽는 것은 지우려는 한 건뿐이다.
  const [impact, setImpact] = useState<RunDeletionPreview | null>(null)
  // 함께 지울지. 기본은 지우는 쪽이다 — 남겨 두면 어느 런에도 없는 시나리오가 케이스 커버리지를
  // 계속 채워, 사용자는 지웠는데 숫자가 그대로인 것을 본다. 되돌리기는 체크 해제 한 번이다.
  const [dropScenarios, setDropScenarios] = useState(true)

  const counts = useMemo(() => countRuns(runs), [runs])
  const entries = useMemo(() => arrangeVersions(versions, versionList.groups), [versions, versionList.groups])
  const hidden = useMemo(() => hiddenVersions(versions), [versions])
  const strays = useMemo(() => strayBuilds(runs, versions), [runs, versions])
  const shown = useMemo(
    () => [...runsIn(runs, bucket)].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [runs, bucket],
  )
  const bucketLabel = bucketName(bucket)

  useEffect(() => {
    if (frame === null) return undefined
    const measure = () => frame.style.setProperty('--trl-top', `${Math.round(frame.getBoundingClientRect().top + window.scrollY)}px`)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [frame, notice, failure])

  useEffect(() => {
    if (pendingDelete === null) return
    const controller = new AbortController()
    setImpact(null)
    setDropScenarios(true)
    getRunDeletionPreview(projectId, pendingDelete.id, controller.signal)
      .then(setImpact)
      .catch(() => {
        // 못 세어도 삭제 자체는 할 수 있다. 그때는 체크박스 없이 런만 지운다.
      })
    return () => controller.abort()
  }, [pendingDelete, projectId])

  function bucketName(key: string): string {
    if (key === NO_VERSION) return v.unversioned
    const known = versions.find((version) => version.gameBuildId === key)
    if (known !== undefined) return versionName(known)
    const stray = strays.find((build) => build.gameBuildId === key)
    return stray === undefined ? key : gameBuildName(stray)
  }

  function selectBucket(key: string) {
    setSearchParams(
      (params) => {
        params.set('version', key)
        return params
      },
      { replace: true },
    )
  }

  async function confirmDelete() {
    if (pendingDelete === null || deleting) return
    setDeleting(true)
    try {
      const removable = impact?.removableScenarioCount ?? 0
      await deleteTestRun(projectId, pendingDelete.id, dropScenarios && removable > 0)
      setPendingDelete(null)
      await onChanged()
    } catch (error: unknown) {
      setFailure(error instanceof ProjectApiError ? error.message : r.deleteFailed)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  // Opening a run always lands in the run's edit entry, which decides between the
  // empty-run shell and the newest scenario's studio (see RunEditPage).
  function openRun(runId: string) {
    const base = `/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/edit`
    navigate(draft === null ? base : `${base}?draft=${encodeURIComponent(draft)}`)
  }

  /** TR 을 다른 TC 버전으로 옮긴다. 같은 칸이면 아무것도 하지 않는다. */
  async function moveRun(run: TestRun, target: string) {
    if (bucketOf(run) === target) return
    setFailure(null)
    try {
      await changeRunGameBuild(projectId, run.id, target === NO_VERSION ? null : target)
      await onChanged()
      setNotice(r.moved(run.name.length > 0 ? run.name : r.untitled, bucketName(target)))
    } catch (error: unknown) {
      setFailure(error instanceof ProjectApiError && error.status === 409 ? r.moveEditor : r.moveFailed)
    }
  }

  function menuItems(run: TestRun): ContextMenuItem[] {
    return [
      { label: r.menu.open, onSelect: () => openRun(run.id) },
      { label: r.menu.changeVersion, onSelect: () => setMoving(run) },
      { label: r.delete, onSelect: () => setPendingDelete(run), danger: true },
    ]
  }

  function lastQaText(lastQa: RunLastQa | null): string {
    if (lastQa === null) return r.lastQa.never
    if (lastQa.status === 'RUNNING' || lastQa.status === 'STARTING') return r.lastQa.running
    const result = r.lastQa.result(lastQa.passed, lastQa.failed, lastQa.total)
    return lastQa.status === 'CANCELLED' ? r.lastQa.cancelled(result) : result
  }

  const node = (key: string, label: string, options: { latest?: boolean; hidden?: boolean } = {}) => {
    const on = key === bucket
    const count = counts.get(key) ?? 0
    return (
      <li key={key}>
        <button
          aria-current={on ? 'true' : undefined}
          className={
            'trl-node' + (on ? ' is-current' : '') + (options.hidden === true ? ' is-hidden' : '') + (dropTarget === key ? ' is-drop' : '')
          }
          onClick={() => selectBucket(key)}
          onDragLeave={() => setDropTarget((current) => (current === key ? null : current))}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(RUN_DRAG)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setDropTarget(key)
          }}
          onDrop={(event) => {
            const runId = event.dataTransfer.getData(RUN_DRAG)
            setDropTarget(null)
            const dragged = runs.find((one) => one.id === runId)
            if (dragged === undefined) return
            event.preventDefault()
            void moveRun(dragged, key)
          }}
          type="button"
        >
          <FolderIcon open={on} />
          <span className="trl-node-text">
            <span className="trl-node-name">{label}</span>
            <span className="trl-muted">{r.runCount(count)}</span>
          </span>
          {options.latest === true && <span className="trl-badge">{v.latest}</span>}
        </button>
      </li>
    )
  }

  const versionNode = (version: TestCaseVersionSummary) =>
    node(version.gameBuildId, versionName(version), { latest: version.latest, hidden: version.hidden })

  const needle = query.trim().toLowerCase()
  const listed = needle === '' ? shown : shown.filter((run) => `${run.name} ${run.description ?? ''}`.toLowerCase().includes(needle))

  return (
    <section aria-labelledby="test-runs-title" className="trl-page">
      <header className="trl-page-head">
        {/* 위의 작업공간 제목이 이미 "테스트 런" 이다. 같은 말을 두 번 보이지 않고, 낭독기에만 남긴다. */}
        <h2 className="visually-hidden" id="test-runs-title">{r.title}</h2>
        <button className="button button--primary button--compact" onClick={() => setCreating(true)} type="button">
          {r.newButton}
        </button>
      </header>

      {notice !== null && (
        <p className="trl-notice">
          <span>{notice}</span>
          <button aria-label={r.dismiss} className="trl-notice-close" onClick={() => setNotice(null)} type="button">
            ✕
          </button>
        </p>
      )}
      {failure !== null && (
        <div className="inline-error" role="alert"><span aria-hidden="true">!</span>{failure}</div>
      )}

      {status === 'loading' && <p className="panel-empty">{r.loading}</p>}
      {status === 'failed' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>{r.loadFailed}
          <button className="button button--secondary button--compact" onClick={onReload} type="button">{r.retry}</button>
        </div>
      )}
      {status === 'ready' && (
        <div className="trl" ref={setFrame}>
          <nav aria-label={r.versionsTitle} className="trl-side">
            <div className="trl-side-head">
              <span>{r.versionsTitle}</span>
              <span className="trl-muted">{r.newestFirst}</span>
            </div>
            <div className="trl-scroll">
              <ul className="trl-tree">
                {strays.map((build) => node(build.gameBuildId, gameBuildName(build)))}
                {entries.map((entry) => {
                  if (entry.kind === 'version') return versionNode(entry.version)
                  const group = entry.group
                  const isFolded = folded.has(group.id)
                  return (
                    <li key={`group:${group.id}`}>
                      <button
                        aria-expanded={!isFolded}
                        className="trl-group"
                        onClick={() =>
                          setFolded((current) => {
                            const next = new Set(current)
                            if (next.has(group.id)) next.delete(group.id)
                            else next.add(group.id)
                            return next
                          })
                        }
                        type="button"
                      >
                        <Chevron open={!isFolded} />
                        <span className="trl-group-name">{group.name}</span>
                        <span className="trl-muted">
                          {r.runCount(entry.versions.reduce((sum, version) => sum + (counts.get(version.gameBuildId) ?? 0), 0))}
                        </span>
                      </button>
                      {!isFolded && entry.versions.length > 0 && (
                        <ul className="trl-tree trl-tree--nested">{entry.versions.map(versionNode)}</ul>
                      )}
                    </li>
                  )
                })}
                {node(NO_VERSION, v.unversioned)}
              </ul>
              {hidden.length > 0 && (
                <>
                  <button
                    aria-expanded={showHidden}
                    className="trl-group trl-group--hidden"
                    onClick={() => setShowHidden((value) => !value)}
                    type="button"
                  >
                    <Chevron open={showHidden} />
                    <span className="trl-group-name">{v.hiddenVersions(hidden.length)}</span>
                  </button>
                  {showHidden && <ul className="trl-tree trl-tree--nested">{hidden.map(versionNode)}</ul>}
                </>
              )}
            </div>
            <p className="trl-side-hint">{r.dragHint}</p>
          </nav>

          <main className="trl-main">
            <div className="trl-main-head">
              <div className="trl-main-title">
                <span className="trl-muted">{r.runsOfKicker}</span>
                <h3>{bucketLabel}</h3>
              </div>
              <span className="trl-chip">{r.runCount(shown.length)}</span>
            </div>
            {shown.length > 0 && (
              <>
                <label className="trl-search">
                  <SearchIcon />
                  <input
                    aria-label={r.search}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={r.searchPlaceholder}
                    type="search"
                    value={query}
                  />
                </label>
                <div aria-hidden="true" className="trl-cols">
                  <span />
                  <span>{r.columns.name}</span>
                  <span className="trl-num">{r.columns.scenarios}</span>
                  <span>{r.columns.lastQa}</span>
                  <span className="trl-date">{r.columns.created}</span>
                  <span />
                </div>
              </>
            )}
            <div className="trl-scroll">
              {shown.length === 0 ? (
                <div className="trl-empty">
                  <ClipboardListIcon size={40} />
                  <p>{runs.length === 0 ? r.empty : r.emptyVersion}</p>
                </div>
              ) : (
                <ul aria-label={r.columns.name} className="trl-list">
                  {listed.map((run) => (
                    <li key={run.id}>
                      <div
                        className="trl-row"
                        draggable
                        onClick={() => openRun(run.id)}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setMenu({ run, x: event.clientX, y: event.clientY })
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(RUN_DRAG, run.id)
                          event.dataTransfer.effectAllowed = 'move'
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') openRun(run.id)
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <ClipboardListIcon className="trl-row-icon" />
                        <span className="trl-row-title">
                          <span className="trl-row-name">{run.name.length > 0 ? run.name : r.untitled}</span>
                          {run.description !== null && run.description.length > 0 && (
                            <span className="trl-row-desc">{run.description}</span>
                          )}
                        </span>
                        <span className="trl-num">{run.scenarioCount ?? '—'}</span>
                        <span className={'trl-qa' + (run.lastQaRun !== null && run.lastQaRun.failed > 0 ? ' has-failed' : '')}>
                          {lastQaText(run.lastQaRun)}
                        </span>
                        <span className="trl-date">{formatDate(run.createdAt)}</span>
                        <button
                          aria-label={r.menu.label}
                          className="trl-more"
                          onClick={(event) => {
                            event.stopPropagation()
                            const box = event.currentTarget.getBoundingClientRect()
                            setMenu({ run, x: box.left, y: box.bottom + 4 })
                          }}
                          type="button"
                        >
                          ⋯
                        </button>
                      </div>
                    </li>
                  ))}
                  {listed.length === 0 && <li className="trl-nomatch">{r.noMatch(query.trim())}</li>}
                </ul>
              )}
            </div>
          </main>
        </div>
      )}

      {menu !== null && (
        <ContextMenu items={menuItems(menu.run)} label={r.menu.label} onClose={() => setMenu(null)} x={menu.x} y={menu.y} />
      )}

      {creating && (
        <NewRunDialog
          groups={versionList.groups}
          initialVersionId={bucket === NO_VERSION ? null : bucket}
          onClose={() => setCreating(false)}
          onCreated={(run) => openRun(run.id)}
          projectId={projectId}
          versions={versions}
        />
      )}

      {moving !== null && (
        <VersionTreeDialog
          allowNone
          confirmLabel={r.changeVersion.confirm}
          groups={versionList.groups}
          hint={r.changeVersion.hint}
          initialId={moving.gameBuild?.gameBuildId ?? null}
          onClose={() => setMoving(null)}
          onConfirm={async (gameBuildId) => {
            const run = moving
            setMoving(null)
            await moveRun(run, gameBuildId ?? NO_VERSION)
          }}
          title={r.changeVersion.title(moving.name.length > 0 ? moving.name : r.untitled)}
          versions={versions}
        />
      )}

      {pendingDelete !== null && (
        <div className="run-del-overlay" onClick={() => !deleting && setPendingDelete(null)}>
          <div aria-modal="true" className="run-del-modal" onClick={(event) => event.stopPropagation()} role="dialog">
            <h3>{r.deleteTitle}</h3>
            <p className="run-del-name">{pendingDelete.name.length > 0 ? pendingDelete.name : r.untitled}</p>
            <p className="run-del-copy">{r.deleteCopy}</p>
            {impact !== null && impact.removableScenarioCount > 0 && (
              <label className="run-del-option">
                <input
                  checked={dropScenarios}
                  disabled={deleting}
                  onChange={(event) => setDropScenarios(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  {r.deleteScenarios(impact.removableScenarioCount)}
                  <em className="run-del-note">{r.deleteScenariosWhy}</em>
                </span>
              </label>
            )}
            {impact !== null && impact.keptForQaHistoryCount > 0 && (
              <p className="run-del-note">{r.deleteKeptForHistory(impact.keptForQaHistoryCount)}</p>
            )}
            <div className="run-del-actions">
              <button className="button button--secondary" disabled={deleting} onClick={() => setPendingDelete(null)} type="button">{r.cancel}</button>
              <button className="button button--danger" disabled={deleting} onClick={confirmDelete} type="button">{deleting ? r.deleting : r.delete}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={'tcl-chevron' + (open ? ' is-open' : '')} viewBox="0 0 16 16">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  )
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className="trl-folder" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="22">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
      {open ? <path d="M9 13.5h6" /> : <path d="M9 13.5h6M12 10.5v6" />}
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </svg>
  )
}
