import { useBuildDisplayName } from '../projects/useBuildDisplayName'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import { qaRunPath } from '../qa/qaTypes'
import { CaseIssueHistoryPanel } from '../qa/evaluation/CaseIssueHistoryPanel'
import { writeCasesDrag } from '../testCases/folderDrag'
import { FolderPane, type FolderOperations, type FolderPaneMessages } from '../testCases/FolderPane'
import { collectDescendantIds, type FolderCounts, type FolderSelection } from '../testCases/testCaseFolders'
import type { TestCaseFolder } from '../testCases/testCaseFolderApi'
import { UNVERSIONED, versionName } from '../testCases/testCaseVersions'
import { useFolderHistory } from '../testCases/useFolderHistory'
import { useTestCaseVersionList } from '../testCases/useTestCaseVersions'
import {
  assignGroupCommand,
  createGroupCommand,
  deleteGroupCommand,
  hideVersionCommand,
  renameGroupCommand,
} from '../testCases/versionCommands'
import { VersionList, type VersionOperations } from '../testCases/VersionList'
import { useTrackerSync } from '../tracker/useTrackerSync'
import { getProjectIssueFacets, parseIssueDetail, setIssueArchived } from './issueApi'
import { setIssueCategories } from './issueCategoryApi'
import { CategoryFilter } from './CategoryFilter'
import { CategorySelect } from './CategorySelect'
import { CategoryChip } from './IssueCategories'
import { DiscussionIcon } from './discussions/discussionIcons'
import {
  addIssuesCommand,
  cloneIssueFolderCommand,
  copyIssueVersionCommand,
  createIssueFolderCommand,
  deleteIssueFolderCommand,
  removeIssuesCommand,
  updateIssueFolderCommand,
} from './issueFolderCommands'
import { listIssueFolders } from './issueFolderApi'
import { IssueTrackerStatus } from './IssueTrackerStatus'
import { useActionBinding, useFieldBinding } from '../projectAgent/bindings'
import { requireKnownId } from '../projectAgent/specs/fieldWriters'
import {
  createIssueStatusRunner,
  createTrackerTicketRunner,
  findListedIssue,
  ISSUES_CREATE_TRACKER_TICKET_ACTION,
  ISSUES_ISSUE_FIELD,
  ISSUES_OPEN_ACTION,
  ISSUES_OPEN_TRACKER_ACTION,
  ISSUES_SET_STATUS_ACTION,
  ISSUES_SEVERITY_FIELD,
  ISSUES_STATUS_FIELD,
  issueIdArg,
  issueOptionLabel,
  trackerUrlOf,
} from '../projectAgent/specs/issues'
import { IssuesSketch } from './issueSketches'
import {
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  issueNumber,
  type Issue,
  type IssueCategory,
  type IssueFacets,
  type IssueFilters,
} from './issueTypes'
import { SeverityTag } from './SeverityTag'
import { useIssueResolution } from './useIssueResolution'
import { useProjectIssues } from './useIssues'
import './issueBoard.css'

/** 버전 목록 위 "모든 버전" 줄이 고른 상태. 케이스 라이브러리와 달리 이슈는 버전을 가로질러 볼 일이 많다. */
const ALL_VERSIONS = 'all'

/**
 * 프로젝트의 QA 이슈 전부를 한 화면에서 훑는 자리(ARTEL-1114).
 *
 * 왼쪽은 케이스 라이브러리와 **같은 사이드바**다 — 버전 목록(묶음 · 숨기기 · 새 폴더로 복제) 아래 사용자 폴더 tree.
 * 폴더를 우클릭해 만들고 · 이름을 바꾸고 · 옮기고 · 복제하고 · 지우며, 표의 이슈를 폴더로 끌어 놓으면 담긴다.
 * ⌘Z 로 되돌린다. 가운데 표는 줄마다 빌드 · 테스트 런 · 시나리오를 열로 싣고, 줄을 누르면 상세가 모달로 뜬다.
 */
export function IssueBoard({
  projectId,
  trackerConnected,
  focusId,
  initialCategoryId = null,
  selectedIds,
  onToggleSelected,
  onClearSelected,
  categories,
  onManageCategories,
  onCategoriesChanged,
}: {
  categories: readonly IssueCategory[]
  onManageCategories: () => void
  /** 이슈에 카테고리를 붙이거나 떼면 개수가 바뀐다. */
  onCategoriesChanged: () => void
  projectId: string
  trackerConnected: boolean
  /** 다른 화면이 가리켜 연 이슈(`?issue=`). 있으면 그 이슈의 상세를 연 채 시작한다. */
  focusId: string | null
  /** 카테고리 탭의 "목록 보기" 로 열면 그 카테고리. 해결된 것까지 보인다(탭의 건수와 같게). */
  initialCategoryId?: string | null
  selectedIds: string[]
  onToggleSelected: (issue: Issue) => void
  onClearSelected: () => void
}) {
  const { t } = useI18n()
  const buildName = useBuildDisplayName()
  const b = t.issues.board
  const fm = t.testCases.folders
  const h = fm.history
  // 가리킨 이슈가 이미 해결됐을 수 있다. 기본(미해결)으로 열면 안 보이므로 그때는 전체로 연다.
  const [filters, setFilters] = useState<IssueFilters>({
    status: focusId === null && initialCategoryId === null ? 'OPEN' : 'ALL',
    severity: 'ALL',
    gameBuildId: null,
    testRunId: null,
    folderId: null,
    unversioned: false,
    categoryId: initialCategoryId,
    archived: false,
  })
  const [reloadToken, setReloadToken] = useState(0)
  const [facetToken, setFacetToken] = useState(0)
  const issues = useProjectIssues(projectId, filters, reloadToken, true)
  const [openId, setOpenId] = useState<string | null>(focusId)
  const [facets, setFacets] = useState<IssueFacets | null>(null)
  const [sideCollapsed, setSideCollapsed] = useState(false)
  // 칸을 화면 아래까지 채우되 넘치지 않게, 칸이 시작하는 높이를 재서 남은 높이를 준다(바닥 여백 24px).
  const rootRef = useRef<HTMLDivElement>(null)
  const [fill, setFill] = useState<number | null>(null)
  useLayoutEffect(() => {
    function measure() {
      const root = rootRef.current
      if (root === null) return
      // 스크롤하는 칸은 창이 아니라 워크스페이스 본문이다. 그 칸의 바닥과, 칸 안의 아래쪽 여백(본문 · 섹션 패딩)을 뺀다.
      const scroller = root.closest<HTMLElement>('.workspace-body') ?? document.documentElement
      const bottom = scroller === document.documentElement ? window.innerHeight : scroller.getBoundingClientRect().bottom
      let trailing = 0
      for (let node: HTMLElement | null = root.parentElement; node !== null && node !== scroller.parentElement; node = node.parentElement)
        trailing += Number.parseFloat(getComputedStyle(node).paddingBottom) || 0
      const top = root.getBoundingClientRect().top + (scroller === document.documentElement ? 0 : scroller.scrollTop)
      setFill(Math.max(360, Math.floor(bottom - top - trailing)))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const [announcement, setAnnouncement] = useState('')

  // ---- 폴더 ----
  const [folders, setFolders] = useState<TestCaseFolder[]>([])
  const [folderStatus, setFolderStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [folderToken, setFolderToken] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    listIssueFolders(projectId, controller.signal)
      .then((loaded) => {
        setFolders(loaded)
        setFolderStatus('ready')
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setFolderStatus('failed')
      })
    return () => controller.abort()
  }, [projectId, folderToken])
  const versionList = useTestCaseVersionList(projectId)
  const refreshAll = useCallback(() => {
    setFolderToken((value) => value + 1)
    setFacetToken((value) => value + 1)
    setReloadToken((value) => value + 1)
    versionList.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionList.refresh])
  const history = useFolderHistory(projectId, refreshAll, () => setAnnouncement(fm.failed))

  // ---- 개수 ----
  const statusParam = filters.status === 'ALL' ? undefined : filters.status
  useEffect(() => {
    const controller = new AbortController()
    getProjectIssueFacets(projectId, statusParam, controller.signal)
      .then(setFacets)
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId, statusParam, facetToken])

  // 해결 · 되돌리기는 개수도 바꾼다. 줄을 고친 뒤 개수를 다시 읽는다.
  const { patch } = issues
  const patchAndRecount = useCallback<typeof patch>(
    (issueId, next) => {
      patch(issueId, next)
      setFacetToken((value) => value + 1)
    },
    [patch],
  )
  const { toggle, pending, failedId } = useIssueResolution(patchAndRecount)
  const { sync, pending: syncPending, failedId: syncFailedId } = useTrackerSync(patch)

  // ── project agent 배선(ARTEL-1139) ──────────────────────────────────────────
  //
  // 전에는 `IssuesSection` 이 필터 · 목록 · 해결 · tracker 를 쥐고 여기 배선을 걸었다.
  // ARTEL-1114 에서 그 넷이 전부 이 파일로 왔으므로 배선도 따라왔다. `catalog.ts` 가
  // 이 일곱을 agent 에게 광고하는데, 배선만 빠지면 **테스트는 통과하면서** 런타임에
  // agent 가 못 하는 일을 하겠다고 나선다.
  //
  // `target` 은 강조할 자리일 뿐이고 실제 일은 `run` 이 한다. 새 화면은 조작 버튼이
  // 행이 아니라 상세 모달에 있으므로, 칸을 못 찾으면 그 이슈의 행으로, 행도 없으면
  // 표 전체로 내려간다.

  /** 강조할 자리. `target` 은 args 를 못 받으므로 가리킨 이슈를, 없으면 첫 행을 보인다. */
  function issueTarget(control: string): HTMLElement | null {
    const issueId = openId ?? focusId ?? issues.items[0]?.id ?? null
    if (issueId === null) return rootRef.current
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-issue-id="${CSS.escape(issueId)}"]`) ?? null
    return row?.querySelector<HTMLElement>(`[data-issue-action="${control}"]`) ?? row ?? rootRef.current
  }

  /** 목록이 읽히기 전에는 행이 없다. 화면이 그 자리에 보이는 문구를 그대로 쓴다. */
  function listBlocked(): string | null {
    if (issues.status === 'loading') return t.issues.list.loading
    if (issues.status === 'error') return t.issues.list.loadFailed
    return null
  }

  /**
   * 줄을 누른 것과 같은 결과 — 그 이슈의 상세를 연다.
   *
   * 예전 화면은 행을 펼치는 방식이라 이미 펼친 행을 다시 펼치려고 `focusToken` 을 올렸다.
   * 여기는 모달이라 열렸거나 닫혔거나 둘뿐이고, `openId` 하나로 끝난다.
   */
  function openIssue(issueId: string) {
    findListedIssue(issues.items, issueId)
    setOpenId(issueId)
  }

  useFieldBinding(ISSUES_STATUS_FIELD, {
    target: () => rootRef.current?.querySelector<HTMLElement>('[data-issue-filter="status"]') ?? null,
    read: () => filters.status,
    options: () => [
      { value: 'ALL', label: t.issues.filters.all },
      ...ISSUE_STATUSES.map((status) => ({ value: status, label: t.issues.statusLabels[status] })),
    ],
    write: (value) => {
      const status = requireKnownId(ISSUES_STATUS_FIELD.name, value, ['ALL', ...ISSUE_STATUSES])
      setFilters((current) => ({ ...current, status: status as IssueFilters['status'] }))
    },
  })

  useFieldBinding(ISSUES_SEVERITY_FIELD, {
    target: () => rootRef.current?.querySelector<HTMLElement>('[data-issue-filter="severity"]') ?? null,
    read: () => filters.severity,
    options: () => [
      { value: 'ALL', label: t.issues.filters.all },
      ...ISSUE_SEVERITIES.map((severity) => ({ value: severity, label: t.issues.severityLabels[severity] })),
    ],
    write: (value) => {
      const severity = requireKnownId(ISSUES_SEVERITY_FIELD.name, value, ['ALL', ...ISSUE_SEVERITIES])
      setFilters((current) => ({ ...current, severity: severity as IssueFilters['severity'] }))
    },
  })

  useFieldBinding(ISSUES_ISSUE_FIELD, {
    target: () => issueTarget('detail'),
    read: () => openId ?? focusId,
    options: () => issues.items.map((issue) => ({ value: issue.id, label: issueOptionLabel(issue) })),
    write: (value) => {
      openIssue(
        requireKnownId(
          ISSUES_ISSUE_FIELD.name,
          value,
          issues.items.map((issue) => issue.id),
        ),
      )
    },
  })

  useActionBinding(ISSUES_OPEN_ACTION, {
    target: () => issueTarget('detail'),
    blocked: listBlocked,
    run: async (args) => {
      const issueId = issueIdArg(args)
      openIssue(issueId)
      return { issueId }
    },
  })

  useActionBinding(ISSUES_SET_STATUS_ACTION, {
    target: () => issueTarget('resolve'),
    blocked: listBlocked,
    run: createIssueStatusRunner({ items: () => issues.items, toggle }),
  })

  useActionBinding(ISSUES_OPEN_TRACKER_ACTION, {
    target: () => issueTarget('tracker'),
    blocked: listBlocked,
    run: async (args) => {
      const url = trackerUrlOf(findListedIssue(issues.items, issueIdArg(args)))
      window.open(url, '_blank', 'noopener,noreferrer')
      return { url }
    },
  })

  useActionBinding(ISSUES_CREATE_TRACKER_TICKET_ACTION, {
    target: () => issueTarget('export'),
    blocked: listBlocked,
    run: createTrackerTicketRunner({
      items: () => issues.items,
      sync,
      trackerConnected: () => trackerConnected,
    }),
  })

  // 버전 목록은 케이스 라이브러리의 것을 그대로 쓰고, 줄의 수만 이슈 수로 바꾼다.
  const versions = useMemo(() => {
    const counts = new Map((facets?.builds ?? []).map((build) => [build.gameBuildId, build.count]))
    return versionList.versions.map((version) => ({ ...version, total: counts.get(version.gameBuildId) ?? 0 }))
  }, [versionList.versions, facets])
  const unversionedTotal = facets?.builds.find((build) => build.gameBuildId === null)?.count ?? 0

  const folderCounts = useMemo<FolderCounts>(() => {
    const byFolder = new Map<string, number>()
    for (const folder of folders) {
      const ids = collectDescendantIds(folders, folder.id)
      ids.add(folder.id)
      byFolder.set(folder.id, folders.filter((one) => ids.has(one.id)).reduce((sum, one) => sum + one.caseCount, 0))
    }
    return { total: facets?.total ?? 0, unfiled: 0, byFolder }
  }, [folders, facets])

  const folderSelection: FolderSelection = filters.folderId ? { kind: 'folder', id: filters.folderId } : { kind: 'all' }
  const versionSelected = filters.folderId
    ? null
    : filters.unversioned
      ? UNVERSIONED
      : (filters.gameBuildId ?? ALL_VERSIONS)
  const openFolder = filters.folderId ? (folders.find((folder) => folder.id === filters.folderId) ?? null) : null

  function scope(next: Partial<IssueFilters>) {
    setFilters((current) => ({
      ...current,
      gameBuildId: null,
      unversioned: false,
      testRunId: null,
      folderId: null,
      ...next,
    }))
  }

  const folderMessages = useMemo<FolderPaneMessages>(
    () => ({
      ...fm,
      menuHint: b.folderMenuHint,
      loadFailed: b.folderLoadFailed,
      delete: { ...fm.delete, copySuffix: b.folderDeleteCopy },
      announce: { ...fm.announce, versionCopied: b.versionCopied },
    }),
    [fm, b],
  )
  const versionMessages = useMemo(
    () => ({ ...t.testCases.versions, unversionedTitle: b.unversionedTitle }),
    [t.testCases.versions, b.unversionedTitle],
  )

  const announceFailure = () => setAnnouncement(fm.failed)
  const runQuietly = (work: Promise<unknown>) => {
    work.catch(announceFailure)
  }

  const operations: FolderOperations = {
    create: async (input) => {
      await history.execute(
        createIssueFolderCommand(projectId, input, h.create, (created) => {
          setFolders((current) => [...current, created])
          scope({ folderId: created.id })
          setAnnouncement(fm.announce.created(created.name))
        }),
      )
    },
    update: async (folder, next, kind) => {
      await history.execute(updateIssueFolderCommand(projectId, folder, next, kind === 'rename' ? h.rename : h.move))
      setAnnouncement(kind === 'rename' ? fm.announce.renamed(next.name) : fm.announce.moved(folder.name))
    },
    remove: async (folder) => {
      await history.execute(deleteIssueFolderCommand(projectId, folder, folders, h.delete))
      if (filters.folderId != null && collectDescendantIds(folders, folder.id).add(folder.id).has(filters.folderId)) scope({})
      setAnnouncement(fm.announce.deleted(folder.name))
    },
    clone: async (folder) => {
      await history.execute(
        cloneIssueFolderCommand(projectId, folder, h.clone, (clone) => setAnnouncement(fm.announce.cloned(clone.name))),
      )
    },
    dropCases: async (folderId, issueIds) => {
      await history.execute(addIssuesCommand(projectId, folderId, issueIds, h.addItems))
      const name = folders.find((folder) => folder.id === folderId)?.name ?? ''
      setAnnouncement(b.addedToFolder(issueIds.length, name))
    },
  }

  const versionOperations: VersionOperations = {
    createGroup: async (name) => {
      await history.execute(createGroupCommand(projectId, name, h.createGroup, () => {}))
    },
    renameGroup: async (group, name) => {
      await history.execute(renameGroupCommand(projectId, group, name, h.renameGroup))
    },
    deleteGroup: async (group) => {
      const members = versionList.versions.filter((version) => version.groupId === group.id).map((version) => version.gameBuildId)
      await history.execute(deleteGroupCommand(projectId, group, members, h.deleteGroup))
    },
    assignGroup: async (version, groupId) => {
      runQuietly(history.execute(assignGroupCommand(projectId, version.gameBuildId, version.groupId, groupId, h.assignGroup)))
    },
    setHidden: async (version, hidden) => {
      runQuietly(history.execute(hideVersionCommand(projectId, version.gameBuildId, hidden, hidden ? h.hideVersion : h.showVersion)))
    },
    copyToFolder: async (version) => {
      runQuietly(
        history.execute(
          copyIssueVersionCommand(projectId, version.gameBuildId, versionName(version), h.copyVersion, (folder) =>
            setAnnouncement(b.versionCopied(folder.name)),
          ),
        ),
      )
    },
  }

  async function archiveSelected(archived: boolean) {
    const ids = [...selectedIds]
    await Promise.all(ids.map((issueId) => setIssueArchived(issueId, archived)))
    onClearSelected()
    setAnnouncement(b.archivedNow(ids.length))
    setReloadToken((value) => value + 1)
    setFacetToken((value) => value + 1)
  }

  async function removeSelectedFromFolder() {
    if (openFolder === null || selectedIds.length === 0) return
    const ids = [...selectedIds]
    await history.execute(removeIssuesCommand(projectId, openFolder.id, ids, h.removeItems))
    onClearSelected()
    setAnnouncement(b.removedFromFolder(ids.length))
  }

  // ⌘Z · ⇧⌘Z — 케이스 라이브러리와 같은 단축키. 입력칸 안에서는 글자 되돌리기에 둔다.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      if ((event.target as HTMLElement).closest('input, textarea, [contenteditable], [role="dialog"]') !== null) return
      event.preventDefault()
      void history.step(event.shiftKey ? 'redo' : 'undo').then((command) => {
        if (command !== null) setAnnouncement(event.shiftKey ? fm.announce.redone(command.label) : fm.announce.undone(command.label))
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history, fm.announce])

  const open = issues.items.find((issue) => issue.id === openId) ?? null
  // 카테고리 개수는 위 칩 줄이 보이므로, 붙이고 떼면 페이지가 다시 읽는다.
  const onManageCategoriesChanged = onCategoriesChanged
  const filtered =
    filters.status !== 'ALL' || filters.severity !== 'ALL' || filters.gameBuildId != null || filters.testRunId != null ||
    filters.folderId != null || filters.unversioned === true
  const runsOfVersion = (facets?.testRuns ?? []).filter(
    (run) => run.testRunId !== null && (filters.gameBuildId == null || run.gameBuildId === filters.gameBuildId),
  )

  return (
    <div
      className={'tcl cp-scope ib' + (sideCollapsed ? ' is-side-collapsed' : '')}
      ref={rootRef}
      style={fill === null ? undefined : { ['--ib-fill' as string]: `${fill}px` }}
    >
      <FolderPane
        collapsed={sideCollapsed}
        collapsedLabel={openFolder?.name ?? ''}
        counts={folderCounts}
        folders={folders}
        history={{
          canUndo: history.canUndo,
          canRedo: history.canRedo,
          busy: history.busy,
          undo: () => void history.step('undo'),
          redo: () => void history.step('redo'),
        }}
        messages={folderMessages}
        onRetry={() => setFolderToken((value) => value + 1)}
        onSelect={(next) => {
          onClearSelected()
          if (next.kind === 'folder') scope({ folderId: next.id })
          else scope({})
        }}
        onToggleCollapsed={() => setSideCollapsed((value) => !value)}
        operations={operations}
        selection={folderSelection}
        showUnfiled={false}
        status={folderStatus === 'loading' ? 'loading' : folderStatus === 'failed' ? 'failed' : 'ready'}
        top={
          <VersionList
            allRow={{
              label: b.allVersions,
              count: facets?.total ?? 0,
              selected: versionSelected === ALL_VERSIONS,
              onSelect: () => scope({}),
            }}
            groups={versionList.groups}
            messages={versionMessages}
            onSelect={(gameBuildId) => (gameBuildId === UNVERSIONED ? scope({ unversioned: true }) : scope({ gameBuildId }))}
            operations={versionOperations}
            selectedId={versionSelected === ALL_VERSIONS ? null : versionSelected}
            unversionedTotal={unversionedTotal}
            versions={versions}
          />
        }
      />

      <section aria-label={t.issues.page.title} className="panel ib-main">
        <div className="ib-toolbar">
          <div className="dc-segments" data-issue-filter="status" role="group" aria-label={t.issues.filters.status}>
            {(['ALL', ...ISSUE_STATUSES] as const).map((status) => (
              <button
                aria-pressed={filters.status === status}
                className="dc-segment"
                key={status}
                onClick={() => setFilters((current) => ({ ...current, status }))}
                type="button"
              >
                {status === 'ALL' ? t.issues.filters.all : t.issues.statusLabels[status]}
              </button>
            ))}
          </div>
          <div className="dc-segments" data-issue-filter="severity" role="group" aria-label={b.severityLabel}>
            <button
              aria-pressed={filters.severity === 'ALL'}
              className="dc-segment"
              onClick={() => setFilters((current) => ({ ...current, severity: 'ALL' }))}
              type="button"
            >
              {b.all}
            </button>
            {/* 다섯 등급을 늘 보인다(ARTEL-1205). 없는 등급을 숨기면 등급이 그것뿐인 것처럼 읽힌다. 0건은 흐리게만 한다. */}
            {ISSUE_SEVERITIES.map(
              (severity) => (
                <button
                  aria-pressed={filters.severity === severity}
                  className={`dc-segment${(facets?.severities[severity] ?? 0) === 0 ? ' ib-seg--empty' : ''}`}
                  key={severity}
                  onClick={() => setFilters((current) => ({ ...current, severity }))}
                  type="button"
                >
                  <span aria-hidden="true" className={`ib-sev-dot ib-sev-dot--${severity.toLowerCase()}`} />
                  {t.issues.severityLabels[severity]}
                  <span className="ib-seg-count">{facets?.severities[severity] ?? 0}</span>
                </button>
              ),
            )}
          </div>
          {issues.status === 'ready' && (
            <span className="ib-shown">
              {b.shown(issues.items.length)}
              {issues.hasMore ? '+' : ''}
            </span>
          )}
          <span className="ib-toolbar-spacer" />
          {selectedIds.length > 0 && (
            <button
              className="button button--secondary button--compact"
              onClick={() => void archiveSelected(!filters.archived)}
              type="button"
            >
              {filters.archived ? b.unarchive : b.archiveSelected}
            </button>
          )}
          <button
            aria-pressed={filters.archived === true}
            className="ib-archive-toggle"
            onClick={() => {
              onClearSelected()
              setFilters((current) => ({ ...current, archived: !current.archived }))
            }}
            type="button"
          >
            <DiscussionIcon name="archive" size={14} />
            {b.archiveBox(facets?.archived ?? 0)}
          </button>
          {openFolder !== null && selectedIds.length > 0 && (
            <button className="button button--secondary button--compact" onClick={() => void removeSelectedFromFolder()} type="button">
              {b.removeFromFolder}
            </button>
          )}
        </div>

        {filters.folderId == null && runsOfVersion.length > 0 && (
          <div className="ib-runs" role="group" aria-label={b.testRunLabel}>
            <span className="dc-label">{b.testRunLabel}</span>
            <button
              aria-pressed={filters.testRunId == null}
              className="ib-run-chip"
              onClick={() => setFilters((current) => ({ ...current, testRunId: null }))}
              type="button"
            >
              {b.allTestRuns}
            </button>
            {runsOfVersion.map((run) => (
              <button
                aria-pressed={filters.testRunId === run.testRunId}
                className="ib-run-chip"
                key={run.testRunId}
                onClick={() => setFilters((current) => ({ ...current, testRunId: run.testRunId }))}
                title={run.name ?? undefined}
                type="button"
              >
                <span className="ib-run-name">{run.name}</span>
                <span className="ib-seg-count">{run.count}</span>
              </button>
            ))}
          </div>
        )}

        <CategoryFilter
          projectId={projectId}
          allLabel={b.allCategories}
          categories={categories}
          countOf={(category) => category.issueCount}
          onChange={(categoryId) => setFilters((current) => ({ ...current, categoryId }))}
          onManage={onManageCategories}
          selected={filters.categoryId ?? null}
        />
        {filters.archived && <p className="ib-archived-note">{b.archivedNote}</p>}

        {issues.status === 'loading' && (
          <p aria-busy="true" className="ib-quiet ib-pad">
            {t.issues.list.loading}
          </p>
        )}
        {issues.status === 'error' && (
          <div className="ib-message" role="alert">
            <p>{t.issues.list.loadFailed}</p>
            <button className="button button--secondary" onClick={() => setReloadToken((value) => value + 1)} type="button">
              {t.issues.list.retry}
            </button>
          </div>
        )}
        {issues.status === 'ready' && issues.items.length === 0 && (
          <div className="dc-sketch-empty">
            <IssuesSketch />
            <p className="dc-sketch-title">{filtered ? t.issues.list.emptyFiltered : t.issues.list.empty}</p>
            {filtered && <p className="dc-sketch-help">{b.emptyFilteredHelp}</p>}
          </div>
        )}

        {issues.items.length > 0 && (
          <table className="ib-table">
            <colgroup>
              <col className="ib-c-check" />
              <col className="ib-c-sev" />
              <col className="ib-c-issue" />
              <col className="ib-c-scenario" />
              <col className="ib-c-build" />
              <col className="ib-c-tr" />
              <col className="ib-c-step" />
              <col className="ib-c-found" />
              <col className="ib-c-status" />
            </colgroup>
            <thead>
              <tr>
                <th aria-label={t.discussions.selectIssue} />
                <th>{b.colSeverity}</th>
                <th>{b.colIssue}</th>
                <th>{b.scenario}</th>
                <th>{b.colBuild}</th>
                <th>{b.colTestRun}</th>
                <th>{b.colStep}</th>
                <th>{b.colReported}</th>
                <th>{b.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {issues.items.map((issue) => {
                const origin = issue.origin
                const step = parseIssueDetail(issue.detail).step
                const checked = selectedIds.includes(issue.id)
                return (
                  <tr
                    className={`ib-row${checked ? ' is-checked' : ''}${issue.status === 'RESOLVED' ? ' is-resolved' : ''}`}
                    data-issue-id={issue.id}
                    draggable
                    key={issue.id}
                    onClick={() => setOpenId(issue.id)}
                    onDragStart={(event) => writeCasesDrag(event.dataTransfer, checked ? selectedIds : [issue.id])}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setOpenId(issue.id)
                      }
                    }}
                    tabIndex={0}
                  >
                    <td onClick={(event) => event.stopPropagation()}>
                      <label className="dc-row-select ib-check" title={b.selectRow(issue.id)}>
                        <input
                          checked={checked}
                          disabled={!checked && selectedIds.length >= 50}
                          onChange={() => onToggleSelected(issue)}
                          type="checkbox"
                        />
                        <span aria-hidden="true" className="dc-check" />
                        <span className="visually-hidden">{b.selectRow(issue.id)}</span>
                      </label>
                    </td>
                    <td>
                      <SeverityTag severity={issue.severity} />
                    </td>
                    <td className="ib-issue-cell">
                      <span className="ib-id">#{issueNumber(issue)}</span>
                      <span className="ib-issue-title" title={issue.title}>{issue.title}</span>
                      {issue.categories.map((category) => (
                        <CategoryChip key={category.id} small tag={category} />
                      ))}
                    </td>
                    <td className="ib-ellipsis" title={origin?.testScenarioTitle}>
                      {origin?.testScenarioTitle || <span className="ib-quiet">{b.none}</span>}
                    </td>
                    <td>
                      {origin?.buildVersion ? (
                        <span className="ib-version" title={origin.buildLabel ?? undefined}>{buildName(origin.gameBuildId, origin.buildVersion)}</span>
                      ) : (
                        <span className="ib-quiet">{b.none}</span>
                      )}
                    </td>
                    <td className="ib-ellipsis" title={origin?.testRunName ?? undefined}>
                      {origin?.testRunName ?? <span className="ib-quiet">{b.none}</span>}
                    </td>
                    <td className="ib-mono">{step ?? <span className="ib-quiet">{b.none}</span>}</td>
                    <td className="ib-mono ib-nowrap">{formatDateTime(issue.reportedAt)}</td>
                    <td>
                      <span className={`ib-status ib-status--${issue.status.toLowerCase()}`}>
                        {t.issues.statusLabels[issue.status]}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {issues.hasMore && (
          <div className="ib-more">
            <button className="button button--secondary" disabled={issues.loadingMore} onClick={issues.loadMore} type="button">
              {issues.loadingMore ? t.issues.list.loadingMore : t.issues.list.loadMore}
            </button>
          </div>
        )}
        <p className="visually-hidden" role="status">
          {announcement}
        </p>
      </section>

      {open !== null && (
        <Dialog labelledBy="issue-detail-title" onClose={() => setOpenId(null)} title={b.detail}>
          <IssueSheet
            categories={categories}
            onArchive={() =>
              void setIssueArchived(open.id, open.archivedAt === null).then(() => {
                setOpenId(null)
                setReloadToken((value) => value + 1)
                setFacetToken((value) => value + 1)
              })
            }
            onCategories={(ids) =>
              void setIssueCategories(projectId, open.id, ids).then((tags) => {
                patch(open.id, (issue) => ({ ...issue, categories: tags }))
                onManageCategoriesChanged()
              })
            }
            onManageCategories={onManageCategories}
            onCategoriesCreated={onCategoriesChanged}
            failed={failedId === open.id || syncFailedId === open.id}
            issue={open}
            onClose={() => setOpenId(null)}
            onSync={() => void sync(open)}
            onToggle={() => void toggle(open)}
            pending={pending.has(open.id)}
            projectId={projectId}
            syncPending={syncPending.has(open.id)}
            trackerConnected={trackerConnected}
          />
        </Dialog>
      )}
    </div>
  )
}

function IssueSheet({
  issue,
  projectId,
  trackerConnected,
  pending,
  failed,
  syncPending,
  onToggle,
  onSync,
  onClose,
  categories,
  onCategories,
  onCategoriesCreated,
  onArchive,
  onManageCategories,
}: {
  categories: readonly IssueCategory[]
  onCategories: (ids: string[]) => void
  onCategoriesCreated: () => void
  onArchive: () => void
  onManageCategories: () => void
  issue: Issue
  projectId: string
  trackerConnected: boolean
  pending: boolean
  failed: boolean
  syncPending: boolean
  onToggle: () => void
  onSync: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const buildName = useBuildDisplayName()
  const b = t.issues.board
  const detail = parseIssueDetail(issue.detail)
  const origin = issue.origin
  const resolved = issue.status === 'RESOLVED'
  return (
    <article className="ib-sheet-body">
      <header className="ib-sheet-head">
        <div className="ib-sheet-tags">
          <SeverityTag severity={issue.severity} />
          <span className={`ib-status ib-status--${issue.status.toLowerCase()}`}>{t.issues.statusLabels[issue.status]}</span>
          <span className="ib-id">#{issueNumber(issue)}</span>
        </div>
        <h2 className="ib-sheet-title">{issue.title}</h2>
        <CategorySelect
          categories={categories}
          onChange={onCategories}
          onCreated={onCategoriesCreated}
          onManage={onManageCategories}
          projectId={projectId}
          selected={issue.categories.map((category) => category.id)}
        />
        <div className="ib-sheet-actions">
          <button className="button button--secondary button--compact" disabled={pending} onClick={onToggle} type="button">
            {pending ? t.issues.row.pending : resolved ? t.issues.row.reopen : t.issues.row.resolve}
          </button>
          {issue.qaRunId !== null ? (
            <Link className="button button--secondary button--compact" to={qaRunPath(projectId, issue.qaRunId, issue.qaTryId)}>
              {t.issues.row.openQaTry}
            </Link>
          ) : null}
          <button className="button button--secondary button--compact" onClick={onArchive} type="button">
            {issue.archivedAt === null ? b.archive : b.unarchive}
          </button>
          {trackerConnected && (issue.tracker === null || issue.tracker.syncState === 'FAILED') ? (
            <button className="button button--secondary button--compact" disabled={syncPending} onClick={onSync} type="button">
              {syncPending ? t.tracker.row.exporting : issue.tracker === null ? t.tracker.row.export : t.tracker.row.retry}
            </button>
          ) : null}
        </div>
        {trackerConnected && <IssueTrackerStatus tracker={issue.tracker} />}
        {failed && (
          <p className="ib-error" role="alert">
            {t.issues.row.failed}
          </p>
        )}
      </header>

      <section className="ib-sheet-section">
        <h3 className="ib-sheet-label">{b.origin}</h3>
        <dl className="ib-origin">
          <dt>{b.build}</dt>
          <dd>
            {origin?.buildVersion ? (
              <>
                <span className="ib-version">{buildName(origin.gameBuildId, origin.buildVersion)}</span>
                {origin.buildLabel && <span className="ib-build-label">{origin.buildLabel}</span>}
              </>
            ) : (
              b.none
            )}
          </dd>
          <dt>{b.testRun}</dt>
          <dd>
            {origin?.testRunId ? (
              <Link className="ib-link" to={`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(origin.testRunId)}`}>
                {origin.testRunName ?? `#${origin.testRunId}`}
              </Link>
            ) : (
              <span className="ib-quiet">{b.standalone}</span>
            )}
          </dd>
          <dt>{b.scenario}</dt>
          <dd>{origin?.testScenarioTitle || b.none}</dd>
          <dt>{b.step}</dt>
          <dd className="ib-mono">{detail.step ?? b.none}</dd>
          <dt>{b.model}</dt>
          <dd className="ib-mono">{origin?.model ?? b.none}</dd>
          <dt>{b.runStarted}</dt>
          <dd className="ib-mono">{origin?.qaRunStartedAt ? formatDateTime(origin.qaRunStartedAt) : b.none}</dd>
          <dt>{b.reported}</dt>
          <dd className="ib-mono">{formatDateTime(issue.reportedAt)}</dd>
        </dl>
      </section>

      {(detail.expected !== null || detail.actual !== null) && (
        <section className="ib-sheet-section ib-compare">
          {detail.expected !== null && (
            <div className="ib-compare-cell ib-compare-cell--expected">
              <h3 className="ib-sheet-label">{t.issues.row.expected}</h3>
              <p>{detail.expected}</p>
            </div>
          )}
          {detail.actual !== null && (
            <div className="ib-compare-cell ib-compare-cell--actual">
              <h3 className="ib-sheet-label">{t.issues.row.actual}</h3>
              <p>{detail.actual}</p>
            </div>
          )}
        </section>
      )}

      {detail.reproduction.length > 0 && (
        <section className="ib-sheet-section">
          <h3 className="ib-sheet-label">{t.issues.row.reproduction}</h3>
          <ol className="ib-repro">
            {detail.reproduction.map((step, index) => (
              <li key={`${index}-${step}`}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      <CaseIssueHistoryPanel key={issue.id} projectId={projectId} issueId={issue.id} />
      <details className="ib-raw">
        <summary>{t.issues.row.raw}</summary>
        <pre className="mono">{JSON.stringify(issue.detail, null, 2)}</pre>
      </details>
      <footer className="ib-sheet-foot">
        <button className="button button--secondary" onClick={onClose} type="button">
          {b.close}
        </button>
      </footer>
    </article>
  )
}
