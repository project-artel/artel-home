import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { useActionBinding, useFieldBinding } from '../projectAgent/bindings'
import { tasksCopy } from '../projectAgent/tasksCopy'
import { requireKnownId } from '../projectAgent/specs/fieldWriters'
import { listedOptions, readOnlyListWrite } from '../projectAgent/specs/listedOptions'
import {
  TEST_RUNS_CREATE_ACTION,
  TEST_RUNS_LISTED_FIELD,
  TEST_RUNS_OPEN_ACTION,
  TEST_RUNS_OPEN_MAP_ACTION,
  TEST_RUNS_SEARCH_FIELD,
  TEST_RUNS_VERSION_FIELD,
} from '../projectAgent/specs/testRuns'
import { formatDate } from '../projects/formatters'
import { ProjectApiError } from '../projects/projectApi'
import type { ExtrasStatus } from '../projects/workspace/workspaceContext'
import { ContextMenu, type ContextMenuItem } from '../testCases/ContextMenu'
import {
  arrangeVersions,
  hiddenVersions,
  setVersionHidden,
  versionName,
  type TestCaseVersionSummary,
} from '../testCases/testCaseVersions'
import { useTestCaseVersionList } from '../testCases/useTestCaseVersions'
import { VersionTreeDialog } from '../testCases/VersionTreeDialog'
import { ClipboardListIcon } from '../testScenarios/scenarioIcons'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { NameDialog } from '../testCases/NameDialog'
import { NewRunDialog } from './NewRunDialog'
import {
  bucketOf,
  childFolders,
  countRuns,
  countRunsUnder,
  folderBucket,
  folderPath,
  initialBucket,
  NO_VERSION,
  runsAt,
  strayBuilds,
} from './runLibrary'
import {
  createRunFolder,
  deleteRunFolder,
  listRunFolders,
  renameRunFolder,
  type RunFolder,
} from './testRunFolders'
import {
  changeRunGameBuild,
  createTestRun,
  deleteTestRun,
  gameBuildName,
  getRunDeletionPreview,
  updateTestRun,
  type RunDeletionPreview,
  type RunLastQa,
  type TestRun,
} from './testRunApi'
import { InfoHint } from '../design-system/primitives/InfoHint'

/** TR 을 끌어 다른 버전에 놓을 때 싣는 형식. 다른 끌기(파일 등)와 섞이지 않게 따로 둔다. */
const RUN_DRAG = 'application/x-artel-test-run'

/**
 * The project's TestRuns (ARTEL-1049). A run follows one build version — the game build whose test cases its scenarios
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
  // 빌드 버전 안의 폴더(ARTEL-1049). 폴더를 고르면 칸(버전)도 그 폴더의 것이다.
  const [folders, setFolders] = useState<RunFolder[]>([])
  const [foldersKey, setFoldersKey] = useState(0)
  const selectedFolder = folders.find((folder) => folder.id === searchParams.get('folder')) ?? null
  const bucket = selectedFolder !== null ? folderBucket(selectedFolder) : initialBucket(searchParams.get('version'), versions, runs)
  const [naming, setNaming] = useState<
    | { kind: 'createFolder'; bucket: string; parentId: string | null }
    | { kind: 'renameFolder'; folder: RunFolder }
    | { kind: 'renameRun'; run: TestRun }
    | null
  >(null)
  const [deletingFolder, setDeletingFolder] = useState<RunFolder | null>(null)
  const [folderMenu, setFolderMenu] = useState<{ folder: RunFolder; x: number; y: number } | null>(null)
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [creating, setCreating] = useState(false)
  const newRunButton = useRef<HTMLButtonElement>(null)
  const [moving, setMoving] = useState<TestRun | null>(null)
  const [menu, setMenu] = useState<{ run: TestRun; x: number; y: number } | null>(null)
  // 버전 칸의 우클릭 메뉴. 숨기기는 케이스 라이브러리와 같은 설정이라 거기서도 숨는다.
  const [versionMenu, setVersionMenu] = useState<{ bucket: string; version: TestCaseVersionSummary | null; x: number; y: number } | null>(null)
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
    () => [...runsAt(runs, bucket, selectedFolder?.id ?? null)].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [runs, bucket, selectedFolder],
  )
  const shownFolders = useMemo(() => childFolders(folders, bucket, selectedFolder?.id ?? null), [folders, bucket, selectedFolder])
  const bucketLabel = bucketName(bucket)

  useEffect(() => {
    const controller = new AbortController()
    listRunFolders(projectId, controller.signal)
      .then(setFolders)
      .catch(() => {
        // 폴더를 못 읽어도 런은 버전 칸으로 보인다. 폴더만 빈다.
      })
    return () => controller.abort()
  }, [projectId, foldersKey])

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
        params.delete('folder')
        return params
      },
      { replace: true },
    )
  }

  function selectFolder(folder: RunFolder) {
    setSearchParams(
      (params) => {
        params.set('version', folderBucket(folder))
        params.set('folder', folder.id)
        return params
      },
      { replace: true },
    )
  }

  async function refreshAll() {
    setFoldersKey((key) => key + 1)
    await onChanged()
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

  // agent 가 런을 만드는 길. 새 런 대화상자와 같은 `createTestRun` 을 부르고, 대화상자와 달리 런을 열지
  // 않는다 — 대화창이 이어서 시나리오를 쓰게 하려면 사용자가 이 페이지에 남아 있어야 한다.
  useActionBinding(TEST_RUNS_CREATE_ACTION, {
    target: () => newRunButton.current,
    blocked: () => null,
    run: async (args) => {
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      if (name.length === 0) throw new Error(tasksCopy().errors.nameRequired)
      const run = await createTestRun(projectId, {
        name,
        ...(typeof args.gameBuildId === 'string' && args.gameBuildId.length > 0 ? { gameBuildId: args.gameBuildId } : {}),
        ...(typeof args.description === 'string' && args.description.length > 0 ? { description: args.description } : {}),
      })
      await onChanged()
      return { runId: run.id }
    },
  })

  // Opening a run always lands in the run's edit entry, which decides between the
  // empty-run shell and the newest scenario's studio (see RunEditPage).
  function openRun(runId: string) {
    const base = `/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/edit`
    navigate(draft === null ? base : `${base}?draft=${encodeURIComponent(draft)}`)
  }

  /** 런을 다른 빌드 버전 바로 아래, 또는 폴더 안으로 옮긴다. 이미 거기 있으면 아무것도 하지 않는다. */
  async function moveRun(run: TestRun, target: string, folder: RunFolder | null = null) {
    if (bucketOf(run) === target && (run.folderId ?? null) === (folder?.id ?? null)) return
    setFailure(null)
    try {
      await changeRunGameBuild(projectId, run.id, target === NO_VERSION ? null : target, folder?.id ?? null)
      await onChanged()
      const name = run.name.length > 0 ? run.name : r.untitled
      const place = folder === null ? bucketName(target) : `${bucketName(target)} › ${folder.name}`
      // 같은 빌드 버전 안에서 폴더만 바꿨으면 저작이 보는 것은 그대로다. 그 말은 버전이 바뀔 때만 한다.
      setNotice(bucketOf(run) === target ? r.movedWithin(name, place) : r.moved(name, place))
    } catch (error: unknown) {
      if (error instanceof ProjectApiError && error.status === 404 && folder !== null) {
        // 다른 화면(다른 사람 · 다른 탭)이 그새 그 폴더를 지웠다. 들고 있던 폴더 목록이 낡은 것이니 다시 읽는다.
        setFoldersKey((key) => key + 1)
        setFailure(r.folders.gone(folder.name))
        return
      }
      setFailure(error instanceof ProjectApiError && error.status === 409 ? r.moveEditor : r.moveFailed)
    }
  }

  function menuItems(run: TestRun): ContextMenuItem[] {
    return [
      { label: r.menu.open, onSelect: () => openRun(run.id) },
      { label: r.menu.rename, onSelect: () => setNaming({ kind: 'renameRun', run }) },
      { label: r.menu.changeVersion, onSelect: () => setMoving(run) },
      { label: r.delete, onSelect: () => setPendingDelete(run), danger: true },
    ]
  }

  async function toggleHidden(version: TestCaseVersionSummary) {
    setFailure(null)
    try {
      await setVersionHidden(projectId, version.gameBuildId, !version.hidden)
      versionList.refresh()
      if (!version.hidden) setShowHidden(true)
    } catch {
      setFailure(r.hideFailed)
    }
  }

  function versionMenuItems(target: { bucket: string; version: TestCaseVersionSummary | null }): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      { label: r.folders.newFolder, onSelect: () => setNaming({ kind: 'createFolder', bucket: target.bucket, parentId: null }) },
    ]
    const version = target.version
    if (version !== null) {
      items.push({ label: version.hidden ? v.menu.show : v.menu.hide, onSelect: () => void toggleHidden(version) })
    }
    return items
  }

  function folderMenuItems(folder: RunFolder): ContextMenuItem[] {
    return [
      { label: r.folders.newSubfolder, onSelect: () => setNaming({ kind: 'createFolder', bucket: folderBucket(folder), parentId: folder.id }) },
      { label: r.folders.rename, onSelect: () => setNaming({ kind: 'renameFolder', folder }) },
      { label: r.folders.delete, onSelect: () => setDeletingFolder(folder), danger: true },
    ]
  }

  /** 끌어 온 런을 이 자리(버전 바로 아래 또는 폴더)에 놓는 핸들러. */
  function dropProps(key: string, target: string, folder: RunFolder | null) {
    return {
      onDragLeave: () => setDropTarget((current) => (current === key ? null : current)),
      onDragOver: (event: DragEvent) => {
        if (!event.dataTransfer.types.includes(RUN_DRAG)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setDropTarget(key)
      },
      onDrop: (event: DragEvent) => {
        const runId = event.dataTransfer.getData(RUN_DRAG)
        setDropTarget(null)
        const dragged = runs.find((one) => one.id === runId)
        if (dragged === undefined) return
        event.preventDefault()
        void moveRun(dragged, target, folder)
      },
    }
  }

  const folderNodes = (target: string, parentId: string | null): ReactNode => {
    const children = childFolders(folders, target, parentId)
    if (children.length === 0) return null
    return (
      <ul className="trl-tree trl-tree--folders">
        {children.map((folder) => {
          const key = `folder:${folder.id}`
          const on = selectedFolder?.id === folder.id
          return (
            <li key={key}>
              <button
                aria-current={on ? 'true' : undefined}
                className={'trl-fnode' + (on ? ' is-current' : '') + (dropTarget === key ? ' is-drop' : '')}
                onClick={() => selectFolder(folder)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setFolderMenu({ folder, x: event.clientX, y: event.clientY })
                }}
                type="button"
                {...dropProps(key, target, folder)}
              >
                <SmallFolderIcon />
                <span className="trl-fnode-name">{folder.name}</span>
                <span className="trl-muted">{countRunsUnder(runs, folders, folder.id)}</span>
              </button>
              {folderNodes(target, folder.id)}
            </li>
          )
        })}
      </ul>
    )
  }

  function lastQaText(lastQa: RunLastQa | null): string {
    if (lastQa === null) return r.lastQa.never
    if (lastQa.status === 'RUNNING' || lastQa.status === 'STARTING') return r.lastQa.running
    const result = r.lastQa.result(lastQa.passed, lastQa.failed, lastQa.total)
    return lastQa.status === 'CANCELLED' ? r.lastQa.cancelled(result) : result
  }

  const node = (key: string, label: string, options: { latest?: boolean; hidden?: boolean; version?: TestCaseVersionSummary } = {}) => {
    const on = key === bucket && selectedFolder === null
    const count = counts.get(key) ?? 0
    return (
      <li key={key}>
        <button
          aria-current={on ? 'true' : undefined}
          className={
            'trl-node' + (on ? ' is-current' : '') + (options.hidden === true ? ' is-hidden' : '') + (dropTarget === key ? ' is-drop' : '')
          }
          onClick={() => selectBucket(key)}
          onContextMenu={(event) => {
            event.preventDefault()
            setVersionMenu({ bucket: key, version: options.version ?? null, x: event.clientX, y: event.clientY })
          }}
          type="button"
          {...dropProps(key, key, null)}
        >
          <FolderIcon open={key === bucket} />
          <span className="trl-node-text">
            <span className="trl-node-name">{label}</span>
            <span className="trl-muted">{r.runCount(count)}</span>
          </span>
          {options.latest === true && <span className="trl-badge">{v.latest}</span>}
        </button>
        {folderNodes(key, null)}
      </li>
    )
  }

  const versionNode = (version: TestCaseVersionSummary) =>
    node(version.gameBuildId, versionName(version), { latest: version.latest, hidden: version.hidden, version })

  const needle = query.trim().toLowerCase()
  const listed = needle === '' ? shown : shown.filter((run) => `${run.name} ${run.description ?? ''}`.toLowerCase().includes(needle))
  const listedFolders = needle === '' ? shownFolders : shownFolders.filter((folder) => folder.name.toLowerCase().includes(needle))

  // agent 가 목록을 읽고 런을 여는 길. 보이는 줄과 같은 `listed` 를 읽고, 줄을 누르는 것과 같은 `openRun` 을 부른다.
  const searchBox = useRef<HTMLLabelElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const bucketIds = [NO_VERSION, ...versions.map((version) => version.gameBuildId), ...strays.map((build) => build.gameBuildId)]
  const listedRun = (runId: unknown): TestRun => {
    const run = listed.find((one) => one.id === runId)
    if (run === undefined) throw new Error(`Test run ${JSON.stringify(runId)} is not listed now. Check testRuns.version and testRuns.search, then pick it from the options of testRuns.listed.`)
    return run
  }
  useFieldBinding(TEST_RUNS_VERSION_FIELD, {
    target: () => frame,
    read: () => bucket,
    options: () => bucketIds.map((key) => ({ value: key, label: bucketName(key) })),
    write: (value) => selectBucket(requireKnownId(TEST_RUNS_VERSION_FIELD.name, value, bucketIds)),
  })
  useFieldBinding(TEST_RUNS_SEARCH_FIELD, {
    target: () => searchBox.current,
    read: () => query,
    write: (value) => {
      if (typeof value !== 'string') throw new Error('testRuns.search must be a string.')
      setQuery(value)
    },
  })
  useFieldBinding(TEST_RUNS_LISTED_FIELD, {
    target: () => listRef.current,
    read: () => listed.length,
    options: () =>
      listedOptions(listed, (run) => ({
        value: run.id,
        label: `${run.name.length > 0 ? run.name : r.untitled} · ${bucketName(bucketOf(run))} · ${run.scenarioCount ?? 0}`,
      })),
    write: readOnlyListWrite(TEST_RUNS_LISTED_FIELD.name, 'use testRuns.open or testRuns.openMap.'),
  })
  useActionBinding(TEST_RUNS_OPEN_ACTION, {
    target: () => listRef.current,
    blocked: () => null,
    run: async (args) => {
      const run = listedRun(args.runId)
      openRun(run.id)
      return { runId: run.id }
    },
  })
  useActionBinding(TEST_RUNS_OPEN_MAP_ACTION, {
    target: () => listRef.current,
    blocked: () => null,
    run: async (args) => {
      const run = listedRun(args.runId)
      navigate(`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(run.id)}`)
      return { runId: run.id }
    },
  })

  return (
    <section aria-labelledby="test-runs-title" className="trl-page">
      {/* 위의 작업공간 제목이 이미 "테스트 런" 이다. 같은 말을 두 번 보이지 않고, 낭독기에만 남긴다. */}
      <h2 className="visually-hidden" id="test-runs-title">{r.title}</h2>

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
              <span>{r.versionsTitle}<InfoHint>{r.dragHint}</InfoHint></span>
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
          </nav>

          <main className="trl-main">
            <div className="trl-main-head">
              <div className="trl-main-title">
                {/* 폴더 안이면 위의 버전과 폴더를 길로 보이고 누르면 그리로 간다. 버전이면 이 칸이 무엇인지만 말한다. */}
                {selectedFolder === null ? (
                  <span className="trl-muted">{r.runsOfKicker}</span>
                ) : (
                  <span className="trl-crumbs">
                    <button className="trl-crumb" onClick={() => selectBucket(bucket)} type="button">{bucketLabel}</button>
                    {folderPath(folders, selectedFolder.id).map((folder) => (
                      <span key={folder.id}>
                        {' › '}
                        <button className="trl-crumb" onClick={() => selectFolder(folder)} type="button">{folder.name}</button>
                      </span>
                    ))}
                  </span>
                )}
                <h3>{selectedFolder?.name ?? bucketLabel}</h3>
              </div>
              <span className="trl-chip">{r.runCount(shown.length)}</span>
              <button
                className="button button--secondary button--compact"
                onClick={() => setNaming({ kind: 'createFolder', bucket, parentId: selectedFolder?.id ?? null })}
                type="button"
              >
                {r.folders.newFolder}
              </button>
              <button className="button button--primary button--compact" onClick={() => setCreating(true)} ref={newRunButton} type="button">
                {r.newButton}
              </button>
            </div>
            {shown.length + shownFolders.length > 0 && (
              <>
                <label className="trl-search" ref={searchBox}>
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
              {shown.length + shownFolders.length === 0 ? (
                <div className="trl-empty">
                  <ClipboardListIcon size={40} />
                  <p>{runs.length === 0 ? r.empty : selectedFolder === null ? r.emptyVersion : r.folders.empty}</p>
                </div>
              ) : (
                <ul aria-label={r.columns.name} className="trl-list" ref={listRef}>
                  {listedFolders.map((folder) => (
                    <li key={`folder:${folder.id}`}>
                      <div
                        className={'trl-row trl-row--folder' + (dropTarget === `row:${folder.id}` ? ' is-drop' : '')}
                        onClick={() => selectFolder(folder)}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setFolderMenu({ folder, x: event.clientX, y: event.clientY })
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') selectFolder(folder)
                        }}
                        role="button"
                        tabIndex={0}
                        {...dropProps(`row:${folder.id}`, bucket, folder)}
                      >
                        <SmallFolderIcon />
                        <span className="trl-row-title">
                          <span className="trl-row-name">{folder.name}</span>
                        </span>
                        <span className="trl-num">{countRunsUnder(runs, folders, folder.id)}</span>
                        <span className="trl-qa">{r.folders.rowKind}</span>
                        <span className="trl-date" />
                        <button
                          aria-label={r.folders.menuLabel}
                          className="trl-more"
                          onClick={(event) => {
                            event.stopPropagation()
                            const box = event.currentTarget.getBoundingClientRect()
                            setFolderMenu({ folder, x: box.left, y: box.bottom + 4 })
                          }}
                          type="button"
                        >
                          ⋯
                        </button>
                      </div>
                    </li>
                  ))}
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
                  {listed.length + listedFolders.length === 0 && <li className="trl-nomatch">{r.noMatch(query.trim())}</li>}
                </ul>
              )}
            </div>
          </main>
        </div>
      )}

      {versionMenu !== null && (
        <ContextMenu
          items={versionMenuItems(versionMenu)}
          label={r.versionMenuLabel}
          onClose={() => setVersionMenu(null)}
          x={versionMenu.x}
          y={versionMenu.y}
        />
      )}

      {folderMenu !== null && (
        <ContextMenu
          items={folderMenuItems(folderMenu.folder)}
          label={r.folders.menuLabel}
          onClose={() => setFolderMenu(null)}
          x={folderMenu.x}
          y={folderMenu.y}
        />
      )}

      {naming !== null && (
        <NameDialog
          initialName={naming.kind === 'createFolder' ? r.folders.defaultName : naming.kind === 'renameFolder' ? naming.folder.name : naming.run.name}
          messages={naming.kind === 'renameRun' ? r.renameRun.messages : r.folders.messages}
          onClose={() => {
            setNaming(null)
            // 실패한 채 닫았을 수도 있다. 폴더가 그새 지워졌으면 목록을 맞춘다.
            setFoldersKey((key) => key + 1)
          }}
          onSubmit={async (name) => {
            if (naming.kind === 'createFolder') {
              const folder = await createRunFolder(projectId, {
                name,
                gameBuildId: naming.bucket === NO_VERSION ? null : naming.bucket,
                parentId: naming.parentId,
              })
              setNaming(null)
              setFoldersKey((key) => key + 1)
              selectFolder(folder)
            } else if (naming.kind === 'renameFolder') {
              await renameRunFolder(projectId, naming.folder.id, name)
              setNaming(null)
              setFoldersKey((key) => key + 1)
            } else {
              await updateTestRun(projectId, naming.run.id, { name })
              setNaming(null)
              await onChanged()
            }
          }}
          submitLabel={naming.kind === 'createFolder' ? r.folders.create : r.folders.renameConfirm}
          title={
            naming.kind === 'createFolder'
              ? r.folders.createTitle
              : naming.kind === 'renameFolder'
                ? r.folders.renameTitle
                : r.renameRun.title
          }
        />
      )}

      {deletingFolder !== null && (
        <ConfirmActionDialog
          body={<p>{r.folders.deleteCopy(deletingFolder.name, countRunsUnder(runs, folders, deletingFolder.id))}</p>}
          cancelLabel={r.cancel}
          confirmLabel={r.folders.delete}
          onClose={() => setDeletingFolder(null)}
          onConfirm={async () => {
            const folder = deletingFolder
            await deleteRunFolder(projectId, folder.id)
            setDeletingFolder(null)
            if (selectedFolder !== null && (selectedFolder.id === folder.id || folderPath(folders, selectedFolder.id).some((one) => one.id === folder.id))) {
              selectBucket(folderBucket(folder))
            }
            await refreshAll()
          }}
          pendingLabel={r.deleting}
          title={r.folders.deleteTitle}
          toFailureMessage={() => r.folders.deleteFailed}
        />
      )}

      {menu !== null && (
        <ContextMenu items={menuItems(menu.run)} label={r.menu.label} onClose={() => setMenu(null)} x={menu.x} y={menu.y} />
      )}

      {creating && (
        <NewRunDialog
          folder={selectedFolder}
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

function SmallFolderIcon() {
  return (
    <svg aria-hidden="true" className="trl-folder trl-folder--small" fill="none" height="17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="17">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
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
