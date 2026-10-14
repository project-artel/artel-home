import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import type { GameBuild } from '../projects/gameTypes'
import { ProjectApiError } from '../projects/projectApi'
import { CaseSceneFilter } from './CaseSceneFilter'
import { SceneChip } from './SceneChip'
import { SpecGradeChip } from './SpecGradeChip'
import { CaseSelectionBar } from './CaseSelectionBar'
import { FolderPane } from './FolderPane'
import { MoveCasesDialog } from './MoveCasesDialog'
import { Picker } from './Picker'
import { SearchField } from './SearchField'
import { hasPointerMoved, type PointerPosition } from './pointerMovement'
import { bulkDeleteTestCases, deleteTestCase, moveTestCases } from './testCaseApi'
import {
  ALL_FOLDERS,
  buildFolderTree,
  countCasesByFolder,
  filterByFolder,
  flattenFolderTree,
  parseFolderSelection,
  effectiveFolderSelection,
  toFolderParam,
  type FolderSelection,
} from './testCaseFolders'
import { TestCaseSheet } from './TestCaseSheet'
import { useCaseListNav } from './useCaseListNav'
import { useCaseSelection } from './useCaseSelection'
import {
  hasActiveFilters,
  NO_FILTERS,
  selectTestCases,
  tallyTestCases,
  type TestCaseFilters,
  type TestCaseSort,
  type TestCaseTally,
} from './testCaseLibrary'
import { VERIFICATION_STATUSES, type TestCase, type VerificationStatus } from './testCaseTypes'
import { useTestCaseFolders } from './useTestCaseFolders'
import { useTestCaseLibrary } from './useTestCaseLibrary'
import {
  absenceNote,
  isRegression,
  resolveCompare,
  resolveVersion,
  versionName,
} from './testCaseVersions'
import { useTestCaseVersionList, useVersionCases } from './useTestCaseVersions'
import { VersionList } from './VersionList'

/** `vdot` 와 결과 pill 이 상태마다 쓰는 CSS 접미사. 대문자 상태값을 클래스에 그대로 넣지 않는다. */
const STATUS_CLASS: Record<VerificationStatus, string> = {
  VERIFIED: 'verified',
  FAILED: 'failed',
  REGRESSION: 'regression',
  DRAFT: 'draft',
  BROKEN: 'broken',
}

/**
 * 프로젝트의 재사용 테스트 케이스를 한자리에 모아 보고 고치는 화면.
 *
 * 기본 정렬이 "실패 먼저" 인 것이 이 화면의 입장이다. 케이스는 수백 건이 되고 그중 사람이
 * 볼 일이 있는 것은 깨진 것과 아직 확인 못 한 것뿐이라, 통과한 케이스를 위에 두면 스크롤이
 * 곧 그 화면의 사용법이 된다.
 *
 * 결과 칸이 보여 주는 값은 케이스에 기록된 `verificationStatus` 와 `lastVerifiedBuildId` 다.
 * QA 런이 스텝마다 내린 판정은 `qa_try_score` 안에만 있고 케이스 단위로 내주는 endpoint 가
 * 아직 없어서, 여기서는 그것을 흉내 내지 않고 기록된 검증 상태를 그대로 적는다.
 */
export function TestCaseLibrary({
  builds,
  projectId,
}: {
  builds: GameBuild[]
  projectId: string
}) {
  const { t } = useI18n()
  const m = t.testCases

  const library = useTestCaseLibrary(projectId)
  const folderList = useTestCaseFolders(projectId)
  const [searchParams, setSearchParams] = useSearchParams()
  // 버전 보기(ARTEL-1022). 버전이 있는 프로젝트는 고른 버전의 표를 그린다. 주소의 `?version=` 이 없으면 최신
  // 버전이고, `?compare=` 를 주면 그 버전과 비교한다. 버전이 하나도 없으면 예전처럼 케이스 목록을 그린다.
  const versionList = useTestCaseVersionList(projectId)
  const selectedVersionId = resolveVersion(versionList.versions, searchParams.get('version'))
  const compareVersionId = resolveCompare(versionList.versions, selectedVersionId, searchParams.get('compare'))
  const versionCases = useVersionCases(projectId, selectedVersionId, compareVersionId)
  const versionsMode = versionList.status === 'ready' && versionList.versions.length > 0
  const selectedVersion = versionList.versions.find((version) => version.gameBuildId === selectedVersionId)
  const compareVersion = versionList.versions.find((version) => version.gameBuildId === compareVersionId)
  const latestVersion = versionList.versions.find((version) => version.latest)
  const [onlyRegressions, setOnlyRegressions] = useState(false)
  const rowById = useMemo(
    () => new Map(versionCases.rows.map((row) => [row.testCase.id, row])),
    [versionCases.rows],
  )
  const baseCases = useMemo(() => {
    const all = versionsMode ? versionCases.rows.map((row) => row.testCase) : library.cases
    if (!onlyRegressions || compareVersionId === null) return all
    return all.filter((testCase) => {
      const row = rowById.get(testCase.id)
      return row !== undefined && isRegression(row)
    })
  }, [versionsMode, versionCases.rows, library.cases, onlyRegressions, compareVersionId, rowById])
  // 주소의 `version` · `compare` · `folder` 를 **한 번에** 고친다. 둘로 나눠 연달아 부르면 두 번째가 첫 번째 결과를
  // 보지 못하고 옛 주소 위에 써서, 버전을 눌러도 바뀌지 않았다.
  const setLibraryParams = useCallback(
    (patch: { version?: string | null; compare?: string | null; folder?: string | null }) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) continue
            if (value === null) params.delete(key)
            else params.set(key, value)
          }
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  const setVersionParams = useCallback(
    (version: string | null, compare: string | null) => setLibraryParams({ version, compare }),
    [setLibraryParams],
  )
  const { refresh: refreshVersionList } = versionList
  const { refresh: refreshVersionCases } = versionCases
  const refreshVersions = useCallback(() => {
    refreshVersionList()
    refreshVersionCases()
  }, [refreshVersionList, refreshVersionCases])
  const [filters, setFilters] = useState<TestCaseFilters>(NO_FILTERS)
  const [sort, setSort] = useState<TestCaseSort>('FAILING_FIRST')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<TestCase | null>(null)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  // 편집기는 고른 케이스가 바뀔 때마다 다시 마운트되므로, 안내 문구를 그 안에 두면
  // 새 케이스를 추가한 직후 그 문구가 마운트와 함께 사라져 screen reader 에 닿지 않는다.
  const [announcement, setAnnouncement] = useState('')
  const [sideCollapsed, setSideCollapsed] = useState(false)
  // 왼쪽 창과 목록을 화면 끝까지 채운다. 높이는 "화면 − 이 화면이 시작하는 자리 − 아래 여백" 이다. 시작 자리는
  // 위의 페이지 제목 줄에 따라 달라 CSS 만으로는 정할 수 없어 잰다. 못 재면 CSS 의 기본값을 쓴다.
  // React 19 의 ref callback 은 정리 함수를 돌려줄 수 있다. 목록이 처음 그려질 때(읽기가 끝난 뒤) 재기 시작한다.
  const rootRef = useCallback((root: HTMLDivElement | null) => {
    if (root === null) return undefined
    const measure = () => {
      const scroller = root.closest<HTMLElement>('.workspace-body')
      const top = root.getBoundingClientRect().top + (scroller?.scrollTop ?? 0)
      root.style.setProperty('--tcl-top', `${Math.round(top)}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // 주소의 `?folder=` 가 보는 범위다(ARTEL-972 의 링크가 여기로 온다). 폴더 목록을 읽기 전에는
  // 폴더 id 가 있는지 알 수 없으므로 없는 id 를 전체로 돌리는 일도 읽은 뒤에만 한다. 읽지
  // 못했다면 폴더 필터는 걸지 않는다.
  const requestedFolder = parseFolderSelection(searchParams.get('folder'))
  const folderSelection: FolderSelection = effectiveFolderSelection(
    requestedFolder,
    folderList.status,
    folderList.folders,
  )
  // 폴더 링크로 들어왔는데 폴더 목록이 아직 없으면, 전체 목록을 잠깐 보여 주지 않는다. 그 목록에서
  // 고르고 지우면 주소가 말한 폴더와 다른 것을 만지게 된다.
  const waitsForFolder = requestedFolder.kind === 'folder' && folderList.status === 'loading'
  const selectFolder = useCallback(
    (next: FolderSelection) => setLibraryParams({ folder: toFolderParam(next) }),
    [setLibraryParams],
  )
  const folderCounts = useMemo(
    () => countCasesByFolder(baseCases, folderList.folders),
    [baseCases, folderList.folders],
  )
  const moveTargets = useMemo(
    () => flattenFolderTree(buildFolderTree(folderList.folders)),
    [folderList.folders],
  )
  // 폴더로 먼저 좁힌 목록을 목록, 집계, 화면 필터가 함께 읽는다. 그래야 "N건 중 M건" 과 chip 의
  // 수가 같은 범위를 말한다.
  const inFolder = useMemo(
    () => filterByFolder(baseCases, folderSelection, folderList.folders),
    [baseCases, folderSelection, folderList.folders],
  )
  // 비교할 때 한쪽 버전에만 있는 줄은 정렬과 상관없이 표 아래로 모은다. 빗금 줄이 표 중간중간에 끼면 두 버전에
  // 다 있는 케이스를 읽다가 끊긴다.
  const shown = useMemo(() => {
    const sorted = selectTestCases(inFolder, filters, sort)
    if (compareVersionId === null) return sorted
    const onlyOneSide = (testCase: TestCase) => (rowById.get(testCase.id)?.presence ?? 'BOTH') !== 'BOTH'
    return [...sorted.filter((testCase) => !onlyOneSide(testCase)), ...sorted.filter(onlyOneSide)]
  }, [inFolder, filters, sort, compareVersionId, rowById])
  const tally = useMemo(() => tallyTestCases(inFolder), [inFolder])
  // 선택은 지금 보이는 줄에 묶인다. 필터가 줄을 숨기면 hook 이 그 줄을 선택에서 뺀다.
  const visibleIds = useMemo(() => shown.map((testCase) => testCase.id), [shown])
  const selection = useCaseSelection(visibleIds)
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const limitNoteId = useId()
  const lastPointer = useRef<PointerPosition | null>(null)

  // 선택 bar 가 사라지면 그 안의 button(해제, 삭제)이 가졌던 focus 도 사라진다. render 가 끝난 뒤
  // 전체 선택 checkbox 로 옮기고, 목록이 비어 그것도 없으면 panel 로 옮긴다.
  const panelRef = useRef<HTMLElement | null>(null)
  const shouldRestoreFocus = useRef(false)
  function clearSelection() {
    shouldRestoreFocus.current = true
    selection.clear()
  }
  useEffect(() => {
    if (!shouldRestoreFocus.current) return
    shouldRestoreFocus.current = false
    ;(selectAllRef.current ?? panelRef.current)?.focus()
  })

  useEffect(() => {
    if (selectAllRef.current !== null) {
      selectAllRef.current.indeterminate = selection.visibleState === 'some'
    }
  }, [selection.visibleState, shown.length])

  const selected = library.cases.find((testCase) => testCase.id === selectedId) ?? null
  // 팔레트와 같은 이동. `active` 는 키보드 커서고 `selectedId` 는 편집기가 열린 케이스라,
  // 둘은 따로 움직인다 — 훑어보는 것과 고르는 것이 같은 동작이 아니다.
  const nav = useCaseListNav(shown.length)
  const { active, edge, listRef, onScroll, setActive } = nav
  const cursored = shown[active] ?? null
  const sheetOpen = creating || selected !== null

  const closeSheet = useCallback(() => {
    setCreating(false)
    setSelectedId(null)
  }, [setCreating, setSelectedId])
  // 화면 이름은 대부분 이미 쓰던 것 중 하나다. 편집기에 넘겨 칩으로 고르게 한다.
  const knownScenes = useMemo(
    () => [...new Set(library.cases.map((one) => one.scene.trim()).filter((one) => one.length > 0))].sort(),
    [library.cases],
  )

  function startCreating() {
    setSelectedId(null)
    setCreating(true)
  }

  /**
   * 행 checkbox 에서 ArrowUp/ArrowDown 을 누르면 이웃 행의 checkbox 로 focus 를 옮긴다.
   * panel 의 기존 화살표는 `active` 커서만 움직이고 focus 는 두기 때문에, 키보드로 줄마다
   * Tab 하지 않고 훑으려면 focus 가 따라가야 한다.
   */
  function moveCheckboxFocus(event: React.KeyboardEvent, checkbox: HTMLElement): boolean {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false

    const index = Number(checkbox.closest<HTMLElement>('tr')?.dataset.index)
    if (!Number.isInteger(index)) return false

    event.preventDefault()
    const next = Math.min(Math.max(index + (event.key === 'ArrowDown' ? 1 : -1), 0), shown.length - 1)
    setActive(next)
    listRef.current
      ?.querySelector<HTMLInputElement>(`tr[data-index="${next}"] input[type="checkbox"]`)
      ?.focus()
    return true
  }

  /**
   * Shift+ArrowUp/ArrowDown: 시작점부터 움직인 커서까지로 선택을 늘리거나 줄인다. 시작점이 아직
   * 없으면 움직이기 전의 커서 줄이 시작점이다. 글자를 쓰는 칸(검색 입력, select)에서는 가로채지
   * 않는다 — 거기서 Shift+화살표는 글자 선택이다.
   */
  function extendSelection(event: React.KeyboardEvent, target: HTMLElement): boolean {
    if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false
    if (shown.length === 0 || target.closest('input:not([type="checkbox"]), select, textarea') !== null) {
      return false
    }

    const rowIndex = Number(target.closest<HTMLElement>('tbody tr')?.dataset.index)
    const from = Number.isInteger(rowIndex) ? rowIndex : active
    const next = Math.min(Math.max(from + (event.key === 'ArrowDown' ? 1 : -1), 0), shown.length - 1)

    event.preventDefault()
    setActive(next)
    selection.selectRangeTo(shown[next].id, false, shown[from]?.id ?? null)
    if (target.closest('tbody .tct-check') !== null) {
      listRef.current
        ?.querySelector<HTMLInputElement>(`tr[data-index="${next}"] input[type="checkbox"]`)
        ?.focus()
    }
    return true
  }

  /**
   * 행 click. 그냥 click 은 편집기를 열고 선택을 비우며 그 줄을 시작점으로 삼는다. Ctrl(macOS 는
   * Cmd) 은 그 줄을 토글하고, Shift 는 시작점부터 그 줄까지를 선택한다. 둘을 함께 누르면 기존
   * 선택에 범위를 더한다. 선택 조작은 편집기를 열지 않는다.
   */
  function clickRow(event: React.MouseEvent, testCase: TestCase, index: number) {
    // click 은 항상 그 줄을 커서로 삼는다. 이어지는 Shift+화살표가 이 줄에서 출발한다.
    setActive(index)
    lastPointer.current = { x: event.clientX, y: event.clientY }
    const isAdditive = event.ctrlKey || event.metaKey

    if (event.shiftKey) selection.selectRangeTo(testCase.id, isAdditive)
    else if (isAdditive) selection.toggle(testCase.id)
    else {
      selection.anchorAt(testCase.id)
      select(testCase)
    }
  }

  async function deleteSelected() {
    const caseIds = [...selection.selectedIds]
    const deleted = await bulkDeleteTestCases(projectId, caseIds)

    library.removeCases(caseIds)
    // 서버 값으로 맞춘다. 실패해도 위에서 이미 지운 목록이 남는다.
    library.refresh()
    refreshVersions()
    clearSelection()
    setActive(0)
    if (selectedId !== null && caseIds.includes(selectedId)) setSelectedId(null)
    setIsBulkDeleting(false)
    setAnnouncement(m.bulkDelete.done(deleted > 0 ? deleted : caseIds.length))
  }

  async function moveSelected(folderId: string | null) {
    const caseIds = [...selection.selectedIds]
    const moved = await moveTestCases(projectId, caseIds, folderId)

    library.applyMoved(caseIds, folderId)
    library.refresh()
    refreshVersions()
    clearSelection()
    setIsMoving(false)
    const destination =
      moveTargets.find((row) => row.folder.id === folderId)?.folder.name ?? m.moveCases.noFolder
    setAnnouncement(m.moveCases.done(moved, destination))
  }

  function select(testCase: TestCase) {
    setCreating(false)
    setSelectedId(testCase.id)
  }

  const waitsForVersion =
    versionList.status === 'loading' || (versionsMode && !versionCases.loadedOnce && !versionCases.failed)
  // 버전을 바꾸는 중: 표 자리만 기다린다.
  const switchingVersion = versionsMode && !versionCases.ready && !versionCases.failed
  if (library.status === 'loading' || waitsForFolder || waitsForVersion) {
    return (
      <div className="section-single">
        <section className="panel" aria-busy="true">
          <p className="panel-empty">{m.section.loading}</p>
        </section>
      </div>
    )
  }

  if (library.status === 'failed') {
    return (
      <div className="section-single">
        <section className="panel">
          <div className="panel-message" role="alert">
            <p>{m.section.loadFailed}</p>
            <button className="button button--secondary" onClick={library.reload} type="button">
              {m.section.retry}
            </button>
          </div>
        </section>
      </div>
    )
  }

  const filtered = hasActiveFilters(filters)

  return (
    <div className={'tcl cp-scope' + (sheetOpen ? ' has-sheet' : '') + (sideCollapsed ? ' is-side-collapsed' : '')} ref={rootRef}>
      <FolderPane
        collapsed={sideCollapsed}
        collapsedLabel={
          [
            selectedVersion !== undefined && folderSelection.kind === 'all' ? versionName(selectedVersion) : null,
            folderSelection.kind === 'none'
              ? m.folders.none
              : folderSelection.kind === 'folder'
                ? (folderList.folders.find((folder) => folder.id === folderSelection.id)?.name ?? null)
                : null,
          ]
            .filter((part): part is string => part !== null)
            .join(' · ')
        }
        onToggleCollapsed={() => setSideCollapsed((value) => !value)}
        top={
          versionsMode ? (
            <VersionList
              onSelect={(gameBuildId) => {
                // 버전을 고르는 것이 곧 그 버전 전체를 보는 것이다. 폴더 필터와 비교는 푼다.
                setOnlyRegressions(false)
                setLibraryParams({ version: gameBuildId, compare: null, folder: null })
              }}
              selectedId={folderSelection.kind === 'all' ? selectedVersionId : null}
              versions={versionList.versions}
            />
          ) : undefined
        }
        counts={folderCounts}
        folders={folderList.folders}
        onAnnounce={setAnnouncement}
        onChanged={({ deletedFolderIds }) => {
          folderList.refresh()
          // 지운 폴더 안의 test case 는 서버에서 폴더 없음이 됐다.
          if (deletedFolderIds.length > 0) {
            library.refresh()
            refreshVersions()
            if (folderSelection.kind === 'folder' && deletedFolderIds.includes(folderSelection.id)) {
              selectFolder(ALL_FOLDERS)
            }
          }
        }}
        onRetry={folderList.reload}
        onUpsert={folderList.applyUpserted}
        onSelect={selectFolder}
        projectId={projectId}
        selection={folderSelection}
        status={folderList.status}
      />
      <section
        className="panel tcl-list-panel"
        ref={panelRef}
        tabIndex={-1}
        aria-label={m.section.title}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement
          const rowCheckbox = target.closest<HTMLElement>('tbody .tct-check')
          if (extendSelection(event, target)) return
          if (rowCheckbox !== null && moveCheckboxFocus(event, rowCheckbox)) return
          // 선택이 있을 때 Delete(macOS 는 Cmd+Backspace)는 삭제 확인을 연다. 바로 지우지 않는다.
          // 입력칸 안의 Delete 와 Backspace 는 글자를 지우는 키다.
          const isDeleteKey = event.key === 'Delete' || (event.key === 'Backspace' && event.metaKey)
          if (
            isDeleteKey &&
            selection.count > 0 &&
            target.closest('input:not([type="checkbox"]), select, textarea, [contenteditable]') === null
          ) {
            event.preventDefault()
            setIsBulkDeleting(true)
            return
          }
          if (nav.onKeyDown(event)) return
          // button, select, checkbox 의 Enter 는 그 컨트롤의 것이다. 가로채면 `선택 삭제` 가
          // dialog 대신 편집기를 연다.
          if (target.closest('button, select, input[type="checkbox"]') !== null) return
          if (event.key === 'Enter' && cursored !== null) { event.preventDefault(); select(cursored) }
        }}
      >
        <header className="panel-header panel-header--split">
          <h2 className="tcl-title">
            {m.section.title}
            {latestVersion !== undefined && (
              <span className="tcl-current-version" title={m.versions.currentTitle}>
                {m.versions.current} <strong>{versionName(latestVersion)}</strong>
              </span>
            )}
          </h2>
          <button
            className="button button--primary button--compact"
            onClick={startCreating}
            type="button"
          >
            {m.section.newCase}
          </button>
        </header>
        <p className="section-intro">{m.section.subtitle}</p>

        <div className="tcl-filters">
          <div className="tcl-filter tcl-filter--grow">
            <SearchField
              clearLabel={m.filters.clearSearch}
              label={m.filters.search}
              onChange={(query) => setFilters({ ...filters, query })}
              placeholder={m.filters.searchPlaceholder}
              value={filters.query}
            />
          </div>

          {versionsMode && (
            <div className="tcl-filter">
              <Picker
                label={m.versions.compareLabel}
                onChange={(raw) => {
                  const next = raw.length > 0 ? raw : null
                  if (next === null) setOnlyRegressions(false)
                  setVersionParams(selectedVersionId, next)
                }}
                options={[
                  { value: '', label: m.versions.noCompare },
                  ...versionList.versions
                    .filter((version) => version.gameBuildId !== selectedVersionId)
                    .map((version) => ({ value: version.gameBuildId, label: versionName(version) })),
                ]}
                value={compareVersionId ?? ''}
              />
            </div>
          )}

          <div className="tcl-filter">
            <Picker
              label={m.filters.sort}
              onChange={(next) => setSort(next as TestCaseSort)}
              options={[
                { value: 'FAILING_FIRST', label: m.filters.sortFailingFirst },
                { value: 'NEWEST', label: m.filters.sortNewest },
              ]}
              value={sort}
            />
          </div>
        </div>

        <div className="tcl-status-row">
          <span className="field-label">{m.filters.status}</span>
          <div className="tcl-chips">
            <button
              className={filters.status === 'ALL' ? 'fchip on' : 'fchip'}
              onClick={() => setFilters({ ...filters, status: 'ALL' })}
              type="button"
            >
              {m.filters.allStatuses} {tally.total}
            </button>
            {VERIFICATION_STATUSES.map((status) => (
              <button
                className={filters.status === status ? 'fchip on' : 'fchip'}
                key={status}
                onClick={() => setFilters({ ...filters, status })}
                type="button"
              >
                <span className={`vdot vdot--${STATUS_CLASS[status]}`} />
                {m.outcome[status]} {countOf(tally, status)}
              </button>
            ))}
            {compareVersionId !== null && (
              <button
                aria-pressed={onlyRegressions}
                className={onlyRegressions ? 'fchip fchip--regress on' : 'fchip fchip--regress'}
                onClick={() => setOnlyRegressions((value) => !value)}
                title={m.versions.onlyRegressionsTitle}
                type="button"
              >
                {m.versions.onlyRegressions}
              </button>
            )}
          </div>
        </div>

        <CaseSceneFilter
          cases={inFolder}
          labels={{
            all: m.filters.allScenes,
            noMatch: m.filters.noMatch,
            scene: m.filters.scene,
            search: m.filters.sceneSearch,
          }}
          onChange={(scene) => setFilters({ ...filters, scene })}
          value={filters.scene}
        />

        {/* 선택 bar 가 나타나고 사라져도 표가 밀리지 않게 자리를 늘 잡아 둔다. 비어 있을 때는
            선택 조작 안내가 그 자리를 쓴다. */}
        <div className="tcl-selection-slot">
          {selection.count > 0 ? (
            <CaseSelectionBar
              count={selection.count}
              isLimitReached={selection.isLimitReached}
              limitNoteId={limitNoteId}
              onClear={clearSelection}
              onDelete={() => setIsBulkDeleting(true)}
              onMove={() => setIsMoving(true)}
            />
          ) : (
            <p className="tcl-selection-hint" title={m.row.hintSelect}>{m.row.hintSelect}</p>
          )}
        </div>

        {switchingVersion ? (
          <div className="panel-empty-block" aria-busy="true">
            <p className="panel-empty">{m.section.loading}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="panel-empty-block">
            <p className="panel-empty">
              {filtered
                ? m.section.emptyFiltered
                : folderSelection.kind !== 'all'
                  ? m.section.emptyFolder
                  : m.section.empty}
            </p>
            {filtered && (
              <button
                className="button button--secondary button--compact"
                onClick={() => setFilters(NO_FILTERS)}
                type="button"
              >
                {m.section.clearFilters}
              </button>
            )}
          </div>
        ) : (
          <div
            className={
              'cp-listwrap' + (edge.top ? ' at-top' : '') + (edge.bottom ? ' at-bottom' : '')
            }
          >
            <div className="cp-fade cp-fade--top" aria-hidden="true"><span className="cp-fade-hint">▴</span></div>
            <div className="cp-list tcl-scroll" onScroll={onScroll} ref={listRef}>
              <table className="tcl-table">
                <colgroup>
                  <col className="tct-c-check" />
                  <col className="tct-c-step" />
                  <col className="tct-c-scene" />
                  <col className="tct-c-spec" />
                  <col className="tct-c-res" />
                  {compareVersionId !== null && <col className="tct-c-res" />}
                  <col className="tct-c-exp" />
                  <col className="tct-c-added" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="tct-check-head" scope="col">
                      <label className="tct-check">
                        <input
                          aria-label={m.selection.selectAll}
                          checked={selection.visibleState === 'all'}
                          onChange={selection.toggleAllVisible}
                          ref={selectAllRef}
                          type="checkbox"
                        />
                      </label>
                    </th>
                    <th scope="col">{m.editor.step}</th>
                    <th scope="col">{m.editor.scene}</th>
                    <th scope="col">{m.editor.specGrade}</th>
                    <th scope="col">
                      {versionsMode && selectedVersion !== undefined
                        ? m.versions.statusOn(versionName(selectedVersion))
                        : m.filters.status}
                    </th>
                    {compareVersion !== undefined && (
                      <th scope="col">{m.versions.statusOn(versionName(compareVersion))}</th>
                    )}
                    <th scope="col">{m.editor.expectedValue}</th>
                    <th scope="col">{m.outcome.added}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((testCase, index) => {
                    const versionRow = rowById.get(testCase.id)
                    const note =
                      versionRow === undefined ? null : absenceNote(versionRow.presence, selectedVersion, compareVersion)
                    return (
                    <tr
                      aria-current={testCase.id === selectedId ? true : undefined}
                      className={
                        'tct-row' +
                        (index === active ? ' active' : '') +
                        (testCase.id === selectedId ? ' picked' : '') +
                        (selection.isSelected(testCase.id) ? ' chosen' : '') +
                        (note !== null ? ' tct-row--absent' : '')
                      }
                      data-index={index}
                      key={testCase.id}
                      onClick={(event) => clickRow(event, testCase, index)}
                      onMouseDown={(event) => {
                        // Shift 클릭이 브라우저의 글자 선택을 함께 만들면 범위 선택이 파랗게 번진다.
                        // preventDefault 는 focus 이동도 막으므로, 이후 Shift+화살표와 Delete 가 이 panel
                        // 에 닿도록 focus 는 직접 준다.
                        if (event.shiftKey && event.button === 0) {
                          event.preventDefault()
                          panelRef.current?.focus({ preventScroll: true })
                        }
                      }}
                      onMouseMove={(event) => {
                        // 포인터가 실제로 움직였을 때만 커서를 옮긴다. `mouseenter` 는 레이아웃이
                        // 바뀌거나 목록이 스크롤될 때도 가만히 있는 포인터 아래의 행에 온다.
                        if (hasPointerMoved(lastPointer.current, event.clientX, event.clientY)) {
                          setActive(index)
                        }
                        lastPointer.current = { x: event.clientX, y: event.clientY }
                      }}
                    >
                      <td className="tct-check-cell" onClick={(event) => event.stopPropagation()}>
                        <label className="tct-check">
                          <input
                            aria-describedby={selection.isLimitReached ? limitNoteId : undefined}
                            aria-label={m.selection.selectRow(
                              testCase.step.length > 0 ? testCase.step : m.row.untitled,
                            )}
                            checked={selection.isSelected(testCase.id)}
                            disabled={selection.isLimitReached && !selection.isSelected(testCase.id)}
                            onChange={() => selection.toggle(testCase.id)}
                            type="checkbox"
                          />
                        </label>
                      </td>
                      <td className="tct-step">
                        {/* `td` 를 flex 로 만들면 그 칸만 table-cell 밖으로 나가, 행 배경이
                            나머지 칸과 0.5px 어긋나고 높이도 5.5px 짧아진다. 안에서 편다. */}
                        <span className="tct-step-in">
                          <span className={`vdot ${testCase.verificationStatus}`} />
                          <span className="tct-step-text">
                            {testCase.step.length > 0 ? testCase.step : m.row.untitled}
                            {note !== null && <span className="tct-absent-note">{m.versions.absence[note]}</span>}
                          </span>
                        </span>
                      </td>
                      <td><SceneChip scene={testCase.scene} /></td>
                      <td><SpecGradeChip bare status={testCase.status} /></td>
                      <td>
                        <StatusPill labels={m} status={versionRow === undefined ? testCase.verificationStatus : versionRow.verificationStatus} />
                      </td>
                      {compareVersionId !== null && (
                        <td>
                          <StatusPill labels={m} status={versionRow?.compareVerificationStatus ?? null} />
                        </td>
                      )}
                      <td className="tct-quiet">
                        {testCase.expectedValue.length > 0 ? testCase.expectedValue : m.row.noExpectedValue}
                      </td>
                      <td className="tct-quiet mono">{formatDate(testCase.createdAt)}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="cp-fade cp-fade--bottom" aria-hidden="true"><span className="cp-fade-hint">▾</span></div>
          </div>
        )}

        <div className="cp-foot">
          <span>↑↓ {m.row.hintNav}</span>
          <span>{m.section.shownOf(shown.length, tally.total)}</span>
        </div>
      </section>

      {sheetOpen && (
        <TestCaseSheet
          builds={builds}
          folderId={folderSelection.kind === 'folder' ? folderSelection.id : null}
          knownScenes={knownScenes}
          onClose={closeSheet}
          onCreated={(created) => {
            library.applyCreated(created)
            refreshVersions()
            setCreating(false)
            setSelectedId(created.id)
            setAnnouncement(m.editor.created)
          }}
          onDelete={() => setDeleting(selected)}
          onSaved={(saved) => {
            library.applySaved(saved)
            refreshVersions()
            setAnnouncement(m.editor.saved)
          }}
          projectId={projectId}
          testCase={selected}
        />
      )}

      <p aria-live="polite" className="visually-hidden" role="status">{announcement}</p>

      {isMoving && (
        <MoveCasesDialog
          count={selection.count}
          initialFolderId={folderSelection.kind === 'folder' ? folderSelection.id : null}
          onClose={() => setIsMoving(false)}
          onConfirm={moveSelected}
          rows={moveTargets}
        />
      )}

      {isBulkDeleting && (
        <ConfirmActionDialog
          body={
            <>
              <strong>{m.bulkDelete.countName(selection.count)}</strong>
              {m.bulkDelete.copySuffix}
            </>
          }
          cancelLabel={m.bulkDelete.cancel}
          confirmLabel={m.bulkDelete.confirm(selection.count)}
          onClose={() => setIsBulkDeleting(false)}
          onConfirm={deleteSelected}
          pendingLabel={m.bulkDelete.pending}
          title={m.bulkDelete.title(selection.count)}
          toFailureMessage={(error) =>
            error instanceof ProjectApiError && error.isForbidden
              ? m.bulkDelete.forbidden
              : m.bulkDelete.failed
          }
        />
      )}

      {deleting !== null && (
        <ConfirmActionDialog
          body={
            <>
              <strong>
                {deleting.step.length > 0 ? deleting.step : m.delete.untitledName}
              </strong>
              {m.delete.copySuffix}
            </>
          }
          cancelLabel={m.delete.cancel}
          confirmLabel={m.delete.confirm}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteTestCase(projectId, deleting.id)
            library.removeCase(deleting.id)
            setSelectedId(null)
            setDeleting(null)
          }}
          pendingLabel={m.delete.pending}
          title={m.delete.title}
          toFailureMessage={(error) =>
            error instanceof ProjectApiError && error.isNotFound
              ? m.delete.gone
              : m.delete.failed
          }
        />
      )}
    </div>
  )
}

function countOf(tally: TestCaseTally, status: VerificationStatus): number {
  if (status === 'VERIFIED') return tally.verified
  if (status === 'FAILED') return tally.failed
  if (status === 'REGRESSION') return tally.regression
  if (status === 'BROKEN') return tally.broken
  return tally.draft
}

/** 한 버전의 판정 칸. 그 버전에 없는 케이스(null)는 "없음" 이다. */
function StatusPill({
  labels,
  status,
}: {
  labels: ReturnType<typeof useI18n>['t']['testCases']
  status: VerificationStatus | null
}) {
  if (status === null) return <span className="vpill vpill--absent">{labels.versions.absent}</span>
  return (
    <span className={`vpill ${status}`}>
      <span className={`vdot ${status}`} />
      {labels.outcome[status]}
    </span>
  )
}
