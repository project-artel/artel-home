import { selectedLibraryCase } from './selectedLibraryCase'
import { useTestCaseLabel, useTestCaseIdentifiers } from './testCaseIdentifiers'
import { TestCaseHover } from './TestCaseHover'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { generateContentMapTestCases, type GeneratedTestCases } from '../contentMap/generateContentMapTestCases'
import { readCarryOver, readCarryVerdicts } from '../contentMap/carryOverChoice'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { useI18n } from '../i18n/useI18n'
import { useActionBinding, useFieldBinding } from '../projectAgent/bindings'
import { requireKnownId } from '../projectAgent/specs/fieldWriters'
import { listedOptions, readOnlyListWrite } from '../projectAgent/specs/listedOptions'
import {
  TEST_CASES_DELETE_ACTION,
  TEST_CASES_DELETE_LISTED_ACTION,
  TEST_CASES_GENERATE_ACTION,
  TEST_CASES_LISTED_FIELD,
  TEST_CASES_OPEN_ACTION,
  TEST_CASES_OPEN_GENERATE_ACTION,
  TEST_CASES_OPEN_NEW_ACTION,
  TEST_CASES_OVERWRITE_ACTION,
  TEST_CASES_SEARCH_FIELD,
  TEST_CASES_STATUS_FIELD,
  TEST_CASES_VERSION_FIELD,
  testCaseVersionOptions,
} from '../projectAgent/specs/testCases'
import { formatDate } from '../projects/formatters'
import type { GameBuild } from '../projects/gameTypes'
import { ProjectApiError } from '../projects/projectApi'
import { CaseSceneFilter } from './CaseSceneFilter'
import { SceneChip } from './SceneChip'
import { StatusPill } from './StatusPill'
import { SpecGradeChip } from './SpecGradeChip'
import { CaseSelectionBar, type SelectionAction } from './CaseSelectionBar'
import {
  addItemsCommand,
  cloneFolderCommand,
  createFolderCommand,
  deleteFolderCommand,
  moveItemsCommand,
  removeItemsCommand,
  setHiddenCommand,
  updateFolderCommand,
} from './folderCommands'
import { writeCasesDrag } from './folderDrag'
import { FolderPane, type FolderOperations } from './FolderPane'
import { MoveCasesDialog } from './MoveCasesDialog'
import { Picker } from './Picker'
import { SearchField } from './SearchField'
import { hasPointerMoved, type PointerPosition } from './pointerMovement'
import { planDeleteCases, planDeleteListed } from './deleteCasesPlan'
import { bulkDeleteTestCases, deleteTestCase } from './testCaseApi'
import {
  ALL_FOLDERS,
  buildFolderTree,
  collectDescendantIds,
  countFromFolders,
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
  countOf,
  STATUS_CLASS,
  type TestCaseFilters,
  type TestCaseSort,
} from './testCaseLibrary'
import { ContentReviewBadge } from '../qa/evaluation/ContentReviewPanel'
import { useContentReviews } from '../qa/evaluation/useContentReviews'
import { evaluationCopy } from '../qa/evaluation/evaluationCopy'
import { VERIFICATION_STATUSES, type TestCase } from './testCaseTypes'
import { useFolderHistory } from './useFolderHistory'
import { useFolderItems } from './useFolderItems'
import { useTestCaseFolders } from './useTestCaseFolders'
import { useTestCaseLibrary } from './useTestCaseLibrary'
import {
  absenceNote,
  isBuildId,
  isRegression,
  resolveCompare,
  resolveVersion,
  UNVERSIONED,
  versionName,
  type TestCaseVersionSummary,
  type VerdictCarryResult,
  type VerdictCarrySkip,
} from './testCaseVersions'
import { useTestCaseVersionList, useVersionCases } from './useTestCaseVersions'
import {
  addToVersionCommand,
  assignGroupCommand,
  copyVersionCommand,
  createGroupCommand,
  deleteGroupCommand,
  hideVersionCommand,
  renameGroupCommand,
} from './versionCommands'
import { VersionList, type VersionOperations } from './VersionList'
import { VerdictImportDialog } from './VerdictImportDialog'
import { VersionTreeDialog } from './VersionTreeDialog'
import { GenerateTestCasesDialog } from './GenerateTestCasesDialog'
import { runGenerateFromMap } from './generateFromMapRun'
import { listGenerationCandidates, type GenerationCandidate } from './generationCandidates'
import { ImportManualCasesDialog } from './ImportManualCasesDialog'
import { CoachTour } from './tour/CoachTour'
import { CASE_LIBRARY_TOUR, caseLibraryTourSteps } from './tour/caseLibraryTour'
import { useTour } from './tour/useTour'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useRowWindow } from './useRowWindow'
import { CaseSkeletonRows, CaseTableSkeleton } from './CaseTableSkeleton'
import { InlineCode } from '../contentMap/InlineCode'


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
  const { t, locale } = useI18n()
  const caseLabel = useTestCaseLabel()
  const { numbers: caseNumbers } = useTestCaseIdentifiers()
  const m = t.testCases

  const contentReviews = useContentReviews(projectId)
  const contentByCase = new Map(contentReviews.rows.map(row => [row.testCaseId, row]))
  const contentCopy = evaluationCopy[locale === 'en' ? 'en' : 'ko']
  const library = useTestCaseLibrary(projectId)
  // 편집기는 고른 케이스가 바뀔 때마다 다시 마운트되므로, 안내 문구를 그 안에 두면
  // 새 케이스를 추가한 직후 그 문구가 마운트와 함께 사라져 screen reader 에 닿지 않는다.
  const [announcement, setAnnouncement] = useState('')
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
  // 폴더 수는 고른 버전에서 보이는 항목 수다(ARTEL-1024).
  // "버전 없음" 은 build 가 아니라 폴더 수 · 폴더 항목을 그것으로 풀 수 없다. 그때는 가장 최근 버전으로 푼다.
  const selectedBuildId = versionsMode && isBuildId(selectedVersionId) ? selectedVersionId : null
  const folderList = useTestCaseFolders(projectId, selectedBuildId)
  const rowById = useMemo(
    () => new Map(versionCases.rows.map((row) => [row.testCase.id, row])),
    [versionCases.rows],
  )

  // 주소의 `?folder=` 가 보는 범위다(ARTEL-972 의 링크가 여기로 온다). 폴더 목록을 읽기 전에는
  // 폴더 id 가 있는지 알 수 없으므로 없는 id 를 전체로 돌리는 일도 읽은 뒤에만 한다. 읽지
  // 못했다면 폴더 필터는 걸지 않는다.
  const requestedFolder = parseFolderSelection(searchParams.get('folder'))
  const folderSelection: FolderSelection = effectiveFolderSelection(
    requestedFolder,
    folderList.status,
    folderList.folders,
  )
  // 폴더를 고르면 그 폴더가 담은 케이스를 고른 버전으로 풀어 그린다(ARTEL-1024). 같은 케이스가 여러 폴더에
  // 들 수 있어 케이스의 `folderId` 로는 거를 수 없다. 폴더 안 보기는 비교하지 않는다.
  const openFolderId = folderSelection.kind === 'folder' ? folderSelection.id : null
  const folderItems = useFolderItems(projectId, openFolderId, selectedBuildId)
  const folderView = openFolderId !== null
  const comparing = !folderView && compareVersionId !== null
  const shownCompare = comparing ? compareVersion : undefined
  const [showHidden, setShowHidden] = useState(false)
  const itemById = useMemo(
    () => new Map(folderItems.items.map((item) => [item.testCase.id, item])),
    [folderItems.items],
  )
  const hiddenCount = useMemo(() => folderItems.items.filter((item) => item.hidden).length, [folderItems.items])
  const baseCases = useMemo(() => {
    if (folderView) {
      return folderItems.items
        .filter((item) => showHidden || !item.hidden)
        .map((item) => item.testCase)
    }
    const all = versionsMode ? versionCases.rows.map((row) => row.testCase) : library.cases
    if (!onlyRegressions || compareVersionId === null) return all
    return all.filter((testCase) => {
      const row = rowById.get(testCase.id)
      return row !== undefined && isRegression(row)
    })
  }, [folderView, folderItems.items, showHidden, versionsMode, versionCases.rows, library.cases, onlyRegressions, compareVersionId, rowById])
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
  const { refresh: refreshFolders } = folderList
  const { refresh: refreshFolderItems } = folderItems
  const { refresh: refreshLibrary } = library
  // 폴더 작업 뒤에는 tree 의 수, 폴더 안 목록, 케이스의 처음 폴더(폴더 없음 판정)가 함께 바뀐다.
  const refreshAfterFolderChange = useCallback(() => {
    refreshFolders()
    refreshFolderItems()
    refreshLibrary()
    refreshVersions()
  }, [refreshFolders, refreshFolderItems, refreshLibrary, refreshVersions])
  const h = m.folders.history
  const folderHistory = useFolderHistory(projectId, refreshAfterFolderChange, () => setAnnouncement(m.folders.failed))
  const { step: stepFolderHistory } = folderHistory

  // 폴더 작업 단축키. 글자를 쓰는 칸 밖에서만 받는다 — 거기서는 브라우저의 글자 되돌리기가 이긴다.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return
      const target = event.target as HTMLElement | null
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return
      }
      if (target?.closest('[role="dialog"]') != null) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        void stepFolderHistory('undo').then((command) => {
          if (command !== null) setAnnouncement(m.folders.announce.undone(command.label))
        })
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        void stepFolderHistory('redo').then((command) => {
          if (command !== null) setAnnouncement(m.folders.announce.redone(command.label))
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepFolderHistory, m.folders.announce])
  const [filters, setFilters] = useState<TestCaseFilters>(NO_FILTERS)
  const [sort, setSort] = useState<TestCaseSort>('FAILING_FIRST')
  const selectedId = searchParams.get('case')
  const setSelectedId = useCallback((id: string | null) => {
    setSearchParams(current => { const next = new URLSearchParams(current); if (id === null) next.delete('case'); else next.set('case', id); return next }, { replace: true })
  }, [setSearchParams])
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<TestCase | null>(null)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [isAddingToVersion, setIsAddingToVersion] = useState(false)
  const [importTarget, setImportTarget] = useState<TestCaseVersionSummary | null>(null)
  // 판정 결과를 받을 버전(ARTEL-1181). 버전 메뉴의 "다른 버전에서 판정 결과 가져오기" 가 연다.
  const [verdictTarget, setVerdictTarget] = useState<TestCaseVersionSummary | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  // 지도에서 만들거나 덮어쓴 결과. 낭독용 알림과 달리 눈에 보이게 헤더 아래 한 줄로 남긴다(ARTEL-1041).
  const [generationNotice, setGenerationNotice] = useState<string | null>(null)
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

  // 폴더 링크로 들어왔는데 폴더 목록이 아직 없으면, 전체 목록을 잠깐 보여 주지 않는다. 그 목록에서
  // 고르고 지우면 주소가 말한 폴더와 다른 것을 만지게 된다.
  const waitsForFolder = requestedFolder.kind === 'folder' && folderList.status === 'loading'
  const selectFolder = useCallback(
    (next: FolderSelection) => setLibraryParams({ folder: toFolderParam(next) }),
    [setLibraryParams],
  )
  const folderCounts = useMemo(
    () => countFromFolders(versionsMode ? versionCases.rows.map((row) => row.testCase) : library.cases, folderList.folders),
    [versionsMode, versionCases.rows, library.cases, folderList.folders],
  )
  const moveTargets = useMemo(
    () => flattenFolderTree(buildFolderTree(folderList.folders)),
    [folderList.folders],
  )
  // 폴더로 먼저 좁힌 목록을 목록, 집계, 화면 필터가 함께 읽는다. 그래야 "N건 중 M건" 과 chip 의
  // 수가 같은 범위를 말한다.
  const inFolder = useMemo(
    () => (folderView ? baseCases : filterByFolder(baseCases, folderSelection, folderList.folders)),
    [folderView, baseCases, folderSelection, folderList.folders],
  )
  // 비교할 때 한쪽 버전에만 있는 줄은 정렬과 상관없이 표 아래로 모은다. 빗금 줄이 표 중간중간에 끼면 두 버전에
  // 다 있는 케이스를 읽다가 끊긴다.
  const shown = useMemo(() => {
    const sorted = selectTestCases(inFolder, filters, sort, caseNumbers)
    // 폴더 안에서는 이 버전에 없는 케이스가 아래로 간다(ARTEL-1024).
    const onlyOneSide = folderView
      ? (testCase: TestCase) => itemById.get(testCase.id)?.inVersion === false
      : compareVersionId === null
        ? null
        : (testCase: TestCase) => (rowById.get(testCase.id)?.presence ?? 'BOTH') !== 'BOTH'
    if (onlyOneSide === null) return sorted
    return [...sorted.filter((testCase) => !onlyOneSide(testCase)), ...sorted.filter(onlyOneSide)]
  }, [inFolder, filters, sort, folderView, itemById, compareVersionId, rowById, caseNumbers])
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

  const selected = selectedLibraryCase(selectedId, library.cases, versionsMode ? versionCases.rows : undefined)
  // 팔레트와 같은 이동. `active` 는 키보드 커서고 `selectedId` 는 편집기가 열린 케이스라,
  // 둘은 따로 움직인다 — 훑어보는 것과 고르는 것이 같은 동작이 아니다.
  const nav = useCaseListNav(shown.length)
  const { active, edge, listRef, onScroll, setActive } = nav
  // 2천 줄이 넘는 버전도 보이는 줄만 그린다(ARTEL-1211). 줄 높이와 표 머리 높이는 그린 뒤에 잰다.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const rows = useRowWindow(scroller, shown.length)
  const { ensureVisible } = rows
  const attachList = useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node
      setScroller(node)
    },
    [listRef],
  )
  // 키보드 커서가 그리지 않은 줄로 가면 먼저 그 줄이 보이게 굴린다. 그려진 뒤에는 목록 이동이 맞춘다.
  useEffect(() => {
    ensureVisible(active)
  }, [active, ensureVisible])
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
    await deleteCases([...selection.selectedIds])
  }

  /** 대량 삭제 확인 대화상자와 project agent 의 `testCases.delete` 가 함께 쓴다. */
  async function deleteCases(caseIds: string[]) {
    const deleted = await bulkDeleteTestCases(projectId, caseIds)

    library.removeCases(caseIds)
    // 서버 값으로 맞춘다. 실패해도 위에서 이미 지운 목록이 남는다.
    refreshAfterFolderChange()
    clearSelection()
    setActive(0)
    if (selectedId !== null && caseIds.includes(selectedId)) setSelectedId(null)
    setIsBulkDeleting(false)
    setAnnouncement(m.bulkDelete.done(deleted > 0 ? deleted : caseIds.length))
  }

  const folderName = (folderId: string) => folderList.folders.find((one) => one.id === folderId)?.name ?? ''

  /** 고른 케이스를 폴더에 담거나(폴더 밖 보기) 다른 폴더로 옮긴다(폴더 안 보기). */
  async function placeSelected(folderId: string | null) {
    if (folderId === null) return
    const caseIds = [...selection.selectedIds]
    await placeCases(folderId, caseIds)
    clearSelection()
    setIsMoving(false)
  }

  async function placeCases(folderId: string, caseIds: readonly string[]) {
    if (openFolderId !== null) {
      if (openFolderId === folderId) return
      await folderHistory.execute(
        moveItemsCommand(projectId, openFolderId, folderId, caseIds, folderItems.items, h.moveItems),
      )
      setAnnouncement(m.folderItems.moved(caseIds.length, folderName(folderId)))
      return
    }
    await folderHistory.execute(addItemsCommand(projectId, folderId, caseIds, h.addItems))
    setAnnouncement(m.folderItems.added(caseIds.length, folderName(folderId)))
  }

  async function removeSelectedFromFolder() {
    if (openFolderId === null) return
    const caseIds = [...selection.selectedIds]
    await folderHistory.execute(removeItemsCommand(projectId, openFolderId, caseIds, folderItems.items, h.removeItems))
    clearSelection()
    setAnnouncement(m.folderItems.removed(caseIds.length))
  }

  async function setSelectedHidden(hidden: boolean) {
    if (openFolderId === null || selectedVersionId === null) return
    const caseIds = [...selection.selectedIds]
    await folderHistory.execute(
      setHiddenCommand(projectId, openFolderId, caseIds, selectedVersionId, hidden, hidden ? h.hide : h.show),
    )
    clearSelection()
    setAnnouncement(hidden ? m.folderItems.hiddenNow(caseIds.length) : m.folderItems.shownNow(caseIds.length))
  }

  const announceFailure = () => setAnnouncement(m.folders.failed)
  const runQuietly = (work: Promise<unknown>) => {
    work.catch(announceFailure)
  }

  const versionOperations: VersionOperations = {
    createGroup: async (name) => {
      await folderHistory.execute(createGroupCommand(projectId, name, h.createGroup, () => {}))
    },
    renameGroup: async (group, name) => {
      await folderHistory.execute(renameGroupCommand(projectId, group, name, h.renameGroup))
    },
    deleteGroup: async (group) => {
      const members = versionList.versions.filter((version) => version.groupId === group.id).map((version) => version.gameBuildId)
      await folderHistory.execute(deleteGroupCommand(projectId, group, members, h.deleteGroup))
    },
    assignGroup: async (version, groupId) => {
      runQuietly(folderHistory.execute(assignGroupCommand(projectId, version.gameBuildId, version.groupId, groupId, h.assignGroup)))
    },
    setHidden: async (version, hidden) => {
      runQuietly(
        folderHistory.execute(hideVersionCommand(projectId, version.gameBuildId, hidden, hidden ? h.hideVersion : h.showVersion)),
      )
    },
    copyToFolder: async (version) => {
      runQuietly(
        folderHistory.execute(
          copyVersionCommand(projectId, version.gameBuildId, h.copyVersion, (folder) => {
            folderList.applyUpserted(folder)
            setAnnouncement(m.folders.announce.versionCopied(folder.name))
          }),
        ),
      )
    },
    importManual: (version) => setImportTarget(version),
    importVerdicts: (version) => setVerdictTarget(version),
  }

  /** 판정 가져오기 창이 끝났을 때. 몇 건을 왜 못 가져왔는지 안내줄에 남긴다(ARTEL-1181). */
  function handleVerdictsImported(result: VerdictCarryResult, source: TestCaseVersionSummary | null, mode: string) {
    const reasons = (Object.entries(result.skipped) as [VerdictCarrySkip, number][])
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => m.importVerdicts.reasons[reason](count))
    const skipped = Object.values(result.skipped).reduce((sum, count) => sum + (count ?? 0), 0)
    const notice =
      mode === 'NONE'
        ? m.importVerdicts.resetDone(result.reset)
        : m.importVerdicts.done(result.carried, source === null ? '' : versionName(source)) +
          (skipped > 0 ? m.importVerdicts.skipped(skipped, reasons.join(' · ')) : '')
    setVerdictTarget(null)
    refreshLibrary()
    refreshVersions()
    setGenerationNotice(notice)
    setAnnouncement(notice)
  }

  /** 고른 사용자 생성 케이스를 고른 버전에 넣는다(ARTEL-1032). */
  async function addSelectedToVersion(gameBuildId: string) {
    const target = versionList.versions.find((version) => version.gameBuildId === gameBuildId)
    await folderHistory.execute(
      addToVersionCommand(projectId, gameBuildId, selectedManualIds, h.addToVersion, (added) =>
        setAnnouncement(m.addToVersion.done(added, target === undefined ? '' : versionName(target))),
      ),
    )
    clearSelection()
    setIsAddingToVersion(false)
  }

  const operations: FolderOperations = {
    create: async (input) => {
      await folderHistory.execute(
        createFolderCommand(projectId, input, h.create, (created) => {
          folderList.applyUpserted(created)
          selectFolder({ kind: 'folder', id: created.id })
          setAnnouncement(m.folders.announce.created(created.name))
        }),
      )
    },
    update: async (folder, next, kind) => {
      await folderHistory.execute(updateFolderCommand(projectId, folder, next, kind === 'rename' ? h.rename : h.move))
      setAnnouncement(kind === 'rename' ? m.folders.announce.renamed(next.name) : m.folders.announce.moved(folder.name))
    },
    remove: async (folder) => {
      const removed = new Set([folder.id, ...collectDescendantIds(folderList.folders, folder.id)])
      await folderHistory.execute(deleteFolderCommand(projectId, folder, folderList.folders, h.delete))
      if (openFolderId !== null && removed.has(openFolderId)) selectFolder(ALL_FOLDERS)
      setAnnouncement(m.folders.announce.deleted(folder.name))
    },
    clone: async (folder) => {
      runQuietly(
        folderHistory.execute(
          cloneFolderCommand(projectId, folder.id, h.clone, (clone) => {
            folderList.applyUpserted(clone)
            setAnnouncement(m.folders.announce.cloned(clone.name))
          }),
        ),
      )
    },
    dropCases: async (folderId, caseIds) => {
      runQuietly(placeCases(folderId, caseIds).then(() => clearSelection()))
    },
  }

  function select(testCase: TestCase) {
    setCreating(false)
    setSelectedId(testCase.id)
  }

  /** 생성 대화상자가 끝났을 때와 project agent 가 직접 생성했을 때 같은 뒷정리를 한다. */
  function handleGenerated(candidate: GenerationCandidate, result: GeneratedTestCases) {
    setIsGenerating(false)
    refreshLibrary()
    refreshVersions()
    // 방금 만든 버전을 연다. 그 버전이 목록에 새로 생겼다.
    setVersionParams(candidate.gameBuildId, null)
    const notice = candidate.generated
      ? m.generate.overwritten(candidate.version, result.created, result.updated, result.deleted + result.broken)
      : m.generate.done(candidate.version, result.created, result.carriedOver, result.verdictsCarried)
    setGenerationNotice(notice)
    setAnnouncement(notice)
  }

  async function generateForAgent(gameBuildId: unknown, overwrite: boolean) {
    if (typeof gameBuildId !== 'string' || gameBuildId.length === 0) throw new Error('gameBuildId is required.')
    const { candidate, result } = await runGenerateFromMap(gameBuildId, overwrite, {
      listCandidates: () => listGenerationCandidates(projectId),
      generate: (target, replace) => generateContentMapTestCases(projectId, target.gameBuildId, readCarryOver(), replace, readCarryVerdicts() ? 'SAME_CONTENT' : undefined),
      messages: m.generate.failure,
    })
    handleGenerated(candidate, result)
    return result
  }

  const generateButton = useRef<HTMLButtonElement>(null)
  const newCaseButton = useRef<HTMLButtonElement>(null)
  const searchBox = useRef<HTMLDivElement>(null)
  const statusRow = useRef<HTMLDivElement>(null)

  useFieldBinding(TEST_CASES_SEARCH_FIELD, {
    target: () => searchBox.current,
    read: () => filters.query,
    write: (value) => {
      if (typeof value !== 'string') throw new Error('testCases.search must be a string.')
      setFilters({ ...filters, query: value })
    },
  })
  const versionFieldIds = versionsMode ? [...versionList.versions.map((version) => version.gameBuildId), UNVERSIONED] : []
  useFieldBinding(TEST_CASES_VERSION_FIELD, {
    target: () => panelRef.current,
    read: () => selectedVersionId,
    options: () => (versionsMode ? testCaseVersionOptions(versionList.versions, m.versions.unversioned) : []),
    write: (value) => {
      const id = requireKnownId(TEST_CASES_VERSION_FIELD.name, value, versionFieldIds)
      // 왼쪽 버전 목록의 줄을 누르는 것과 같다. 비교와 폴더 필터는 풀린다.
      setOnlyRegressions(false)
      setLibraryParams({ version: id, compare: null, folder: null })
    },
  })
  useFieldBinding(TEST_CASES_LISTED_FIELD, {
    target: () => panelRef.current,
    read: () => shown.length,
    options: () => listedOptions(shown, (testCase) => ({ value: testCase.id, label: `${testCase.scene} · ${testCase.step} [${testCase.verificationStatus}]` })),
    write: readOnlyListWrite(TEST_CASES_LISTED_FIELD.name, 'use testCases.open or testCases.delete.'),
  })
  useFieldBinding(TEST_CASES_STATUS_FIELD, {
    target: () => statusRow.current,
    read: () => filters.status,
    options: () => ['ALL', ...VERIFICATION_STATUSES].map((status) => ({ value: status, label: status })),
    write: (value) => {
      const status = requireKnownId(TEST_CASES_STATUS_FIELD.name, value, ['ALL', ...VERIFICATION_STATUSES])
      setFilters({ ...filters, status: status as TestCaseFilters['status'] })
    },
  })

  const loadingReason = library.status === 'ready' ? null : 'The test cases are not loaded yet.'
  useActionBinding(TEST_CASES_OPEN_GENERATE_ACTION, {
    target: () => generateButton.current,
    blocked: () => null,
    run: async () => {
      setIsGenerating(true)
      return { opened: true }
    },
  })
  useActionBinding(TEST_CASES_GENERATE_ACTION, {
    target: () => generateButton.current,
    blocked: () => null,
    run: (args) => generateForAgent(args.gameBuildId, false),
  })
  useActionBinding(TEST_CASES_OVERWRITE_ACTION, {
    target: () => generateButton.current,
    blocked: () => null,
    run: (args) => generateForAgent(args.gameBuildId, true),
  })
  useActionBinding(TEST_CASES_OPEN_NEW_ACTION, {
    target: () => newCaseButton.current,
    blocked: () => null,
    run: async () => {
      startCreating()
      return { opened: true }
    },
  })
  useActionBinding(TEST_CASES_OPEN_ACTION, {
    target: () => panelRef.current,
    blocked: () => loadingReason,
    run: async (args) => {
      const testCase = library.cases.find((one) => one.id === args.testCaseId)
      if (testCase === undefined) throw new Error('No test case has that id.')
      select(testCase)
      return { opened: true, step: testCase.step }
    },
  })
  useActionBinding(TEST_CASES_DELETE_ACTION, {
    target: () => panelRef.current,
    blocked: () => loadingReason,
    run: async (args) => {
      const ids = planDeleteCases(args.testCaseIds, new Set(library.cases.map((one) => one.id)))
      await deleteCases(ids)
      return { deleted: ids.length }
    },
  })

  useActionBinding(TEST_CASES_DELETE_LISTED_ACTION, {
    target: () => panelRef.current,
    blocked: () => loadingReason,
    run: async (args) => {
      const ids = planDeleteListed(visibleIds, args.expectedCount)
      await deleteCases(ids)
      return { deleted: ids.length }
    },
  })

  const selectedItems = [...selection.selectedIds]
    .map((caseId) => itemById.get(caseId))
    .filter((item) => item !== undefined)
  const caseOrigins = new Map(shown.map((testCase) => [testCase.id, testCase.origin]))
  const selectedManualIds = [...selection.selectedIds].filter((caseId) => caseOrigins.get(caseId) === 'MANUAL')
  const addToVersionAction: SelectionAction[] =
    versionsMode && selectedManualIds.length > 0
      ? [{ label: m.addToVersion.action, onClick: () => setIsAddingToVersion(true) }]
      : []
  const selectionActions: SelectionAction[] = folderView
    ? [
        ...addToVersionAction,
        { label: m.folderItems.remove, onClick: () => runQuietly(removeSelectedFromFolder()) },
        ...(versionsMode && selectedItems.some((item) => !item.hidden)
          ? [{ label: m.folderItems.hide, onClick: () => runQuietly(setSelectedHidden(true)) }]
          : []),
        ...(versionsMode && selectedItems.some((item) => item.hidden)
          ? [{ label: m.folderItems.show, onClick: () => runQuietly(setSelectedHidden(false)) }]
          : []),
      ]
    : addToVersionAction

  const undoFolder = async () => {
    const command = await folderHistory.step('undo')
    if (command !== null) setAnnouncement(m.folders.announce.undone(command.label))
  }
  const redoFolder = async () => {
    const command = await folderHistory.step('redo')
    if (command !== null) setAnnouncement(m.folders.announce.redone(command.label))
  }

  // 처음 라이브러리를 여는 사람에게 튜토리얼을 한 번 보인다(ARTEL-1033). 버전과 표가 다 그려진 뒤에 연다.
  const tourReady = library.status === 'ready' && versionList.status !== 'loading' && (!versionsMode || versionCases.loadedOnce)
  const tour = useTour(CASE_LIBRARY_TOUR, tourReady)
  const tourSteps = useMemo(() => caseLibraryTourSteps(t), [t])

  const waitsForVersion =
    versionList.status === 'loading' || (versionsMode && !versionCases.loadedOnce && !versionCases.failed)
  // 버전을 바꾸는 중: 표 자리만 기다린다.
  const switchingVersion = versionsMode && !versionCases.ready && !versionCases.failed
  // 표를 받는 중이면 표 틀은 그대로 두고 줄 자리에 빈 줄을 놓는다.
  const loadingRows = folderView ? !folderItems.ready : switchingVersion
  if (library.status === 'loading' || waitsForFolder || waitsForVersion) {
    return (
      <CaseTableSkeleton label={m.section.loading} />
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
            folderSelection.kind !== 'all'
              ? null
              : selectedVersionId === UNVERSIONED
                ? m.versions.unversioned
                : selectedVersion !== undefined
                  ? versionName(selectedVersion)
                  : null,
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
              groups={versionList.groups}
              onSelect={(gameBuildId) => {
                // 버전을 고르는 것이 곧 그 버전 전체를 보는 것이다. 폴더 필터와 비교는 푼다.
                setOnlyRegressions(false)
                setLibraryParams({ version: gameBuildId, compare: null, folder: null })
              }}
              operations={versionOperations}
              selectedId={folderSelection.kind === 'all' ? selectedVersionId : null}
              unversionedTotal={versionList.unversionedTotal}
              versions={versionList.versions}
            />
          ) : undefined
        }
        counts={folderCounts}
        folders={folderList.folders}
        history={{
          canUndo: folderHistory.canUndo,
          canRedo: folderHistory.canRedo,
          busy: folderHistory.busy,
          undo: () => void undoFolder(),
          redo: () => void redoFolder(),
        }}
        onRetry={folderList.reload}
        onSelect={(next) => {
          setShowHidden(false)
          selectFolder(next)
        }}
        operations={operations}
        selection={folderSelection}
        // 버전이 있으면 "폴더 없음" 대신 버전 쪽의 "버전 없음" 을 쓴다(ARTEL-1024).
        showUnfiled={!versionsMode}
        status={folderList.status}
      />
      <section
        className={'panel tcl-list-panel' + (loadingRows ? ' is-loading' : '')}
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
            <InfoHint>{m.section.subtitle}</InfoHint>
            {latestVersion !== undefined && (
              <span className="tcl-current-version" title={m.versions.currentTitle}>
                {m.versions.current} <strong>{versionName(latestVersion)}</strong>
              </span>
            )}
          </h2>
          <div className="tcl-head-actions">
            {/* 화면 지도에 있던 TC 생성을 라이브러리로 옮겼다(ARTEL-1041). 빌드는 모달에서 고른다. */}
            <button
              className="button button--secondary button--compact"
              data-tour="generate-from-map"
              onClick={() => setIsGenerating(true)}
              ref={generateButton}
              type="button"
            >
              {m.section.generateFromMap}
            </button>
            <button
              className="button button--primary button--compact"
              data-tour="new-case"
              onClick={startCreating}
              ref={newCaseButton}
              type="button"
            >
              {m.section.newCase}
            </button>
          </div>
        </header>
        {generationNotice !== null && (
          <p className="tcl-notice">
            <span>{generationNotice}</span>
            <button aria-label={m.generate.dismiss} className="tcl-notice-close" onClick={() => setGenerationNotice(null)} type="button">
              ✕
            </button>
          </p>
        )}

        <div className="tcl-filters">
          <div className="tcl-filter tcl-filter--grow" data-tour="search" ref={searchBox}>
            <SearchField
              clearLabel={m.filters.clearSearch}
              label={m.filters.search}
              onChange={(query) => setFilters({ ...filters, query })}
              placeholder={m.filters.searchPlaceholder}
              value={filters.query}
            />
          </div>

          {versionsMode && folderView && (
            <div className="tcl-filter">
              <Picker
                label={m.folderItems.versionLabel}
                onChange={(next) => setVersionParams(next, null)}
                options={versionList.versions.map((version) => ({ value: version.gameBuildId, label: versionName(version) }))}
                value={selectedVersionId ?? ''}
              />
            </div>
          )}

          {versionsMode && !folderView && selectedBuildId !== null && (
            <div className="tcl-filter" data-tour="compare">
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

        {contentReviews.status === 'failed' && <p className="inline-error" role="alert">{contentCopy.contentStatus} · {contentCopy.error} <button type="button" className="button button--secondary button--compact" onClick={() => contentReviews.reload()}>{contentCopy.retry}</button></p>}
        <div className="tcl-status-row" data-tour="chips" ref={statusRow}>
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
            <span className="tcl-chips-sep" aria-hidden="true" />
            <span className="field-label">{m.origin.label}</span>
            {(['ALL', 'MAP', 'MANUAL'] as const).map((origin) => (
              <button
                aria-pressed={filters.origin === origin}
                className={filters.origin === origin ? 'fchip on' : 'fchip'}
                key={origin}
                onClick={() => setFilters({ ...filters, origin })}
                type="button"
              >
                {origin === 'ALL' ? m.origin.all : m.origin[origin]}
              </button>
            ))}
            {folderView && hiddenCount > 0 && (
              <button
                aria-pressed={showHidden}
                className={showHidden ? 'fchip on' : 'fchip'}
                onClick={() => setShowHidden((value) => !value)}
                title={m.folderItems.hiddenTitle}
                type="button"
              >
                {m.folderItems.showHidden(hiddenCount)}
              </button>
            )}
            {comparing && (
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

        {/* 화면 칩은 받은 케이스에서 나온다. 받는 동안 줄이 사라지면 표가 위로 올라붙었다가 다시 내려온다. */}
        {loadingRows ? (
          <div aria-hidden="true" className="cp-filter-row tcl-filter-skel">
            <span className="cp-filter-label">{m.filters.scene}</span>
            {[56, 88, 72, 64].map((width, chip) => (
              <span className="skeleton-line" key={chip} style={{ width }} />
            ))}
          </div>
        ) : (
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
        )}

        {/* 선택 bar 가 나타나고 사라져도 표가 밀리지 않게 자리를 늘 잡아 둔다. 비어 있을 때는
            선택 조작 안내가 그 자리를 쓴다. */}
        <div className="tcl-selection-slot">
          {selection.count > 0 ? (
            <CaseSelectionBar
              actions={selectionActions}
              count={selection.count}
              isLimitReached={selection.isLimitReached}
              limitNoteId={limitNoteId}
              moveLabel={folderView ? m.folderItems.moveTo : m.folderItems.add}
              onClear={clearSelection}
              onDelete={() => setIsBulkDeleting(true)}
              onMove={() => setIsMoving(true)}
            />
          ) : (
            <p className="tcl-selection-hint" title={m.row.hintSelect}>{m.row.hintSelect}</p>
          )}
        </div>

        {folderView && folderItems.failed ? (
          <div className="panel-empty-block" role="alert">
            <p className="panel-empty">{m.folderItems.loadFailed}</p>
            <button className="button button--secondary button--compact" onClick={folderItems.refresh} type="button">
              {m.section.retry}
            </button>
          </div>
        ) : !loadingRows && shown.length === 0 ? (
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
            aria-busy={loadingRows || undefined}
            data-tour="table"
          >
            {loadingRows && <p className="visually-hidden" role="status">{m.section.loading}</p>}
            <div className="cp-fade cp-fade--top" aria-hidden="true"><span className="cp-fade-hint">▴</span></div>
            <div className="cp-list tcl-scroll" onScroll={onScroll} ref={attachList}>
              <table className="tcl-table">
                <colgroup>
                  <col className="tct-c-check" />
                  <col className="tct-c-step" />
                  <col className="tct-c-scene" />
                  <col className="tct-c-spec" />
                  <col className="tct-c-res" />
                  {comparing && <col className="tct-c-res" />}
                  <col className="tct-c-exp" />
                  <col className="tct-c-added" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="tct-check-head" scope="col">
                      <label className="tct-check">
                        <input
                          aria-label={m.selection.selectAll}
                          checked={!loadingRows && selection.visibleState === 'all'}
                          disabled={loadingRows}
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
                    {shownCompare !== undefined && (
                      <th scope="col">{m.versions.statusOn(versionName(shownCompare))}</th>
                    )}
                    <th scope="col">{m.editor.expectedValue}</th>
                    <th scope="col">{m.outcome.added}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRows && <CaseSkeletonRows columns={comparing ? 8 : 7} />}
                  {!loadingRows && rows.padTop > 0 && (
                    <tr aria-hidden="true" className="tct-spacer">
                      <td colSpan={comparing ? 8 : 7} style={{ height: rows.padTop }} />
                    </tr>
                  )}
                  {(loadingRows ? [] : shown.slice(rows.start, rows.end)).map((testCase, offset) => {
                    const index = rows.start + offset
                    const item = folderView ? itemById.get(testCase.id) : undefined
                    const versionRow = folderView ? undefined : rowById.get(testCase.id)
                    const note =
                      item !== undefined
                        ? (item.inVersion ? null : m.folderItems.notInVersion)
                        : versionRow === undefined
                          ? null
                          : (() => {
                              const kind = absenceNote(versionRow.presence, selectedVersion, shownCompare)
                              return kind === null ? null : m.versions.absence[kind]
                            })()
                    const result =
                      item !== undefined
                        ? item.verificationStatus
                        : versionRow === undefined
                          ? testCase.verificationStatus
                          : versionRow.verificationStatus
                    return (
                    <tr
                      aria-current={testCase.id === selectedId ? true : undefined}
                      className={
                        'tct-row' +
                        (index === active ? ' active' : '') +
                        (testCase.id === selectedId ? ' picked' : '') +
                        (selection.isSelected(testCase.id) ? ' chosen' : '') +
                        (note !== null ? ' tct-row--absent' : '') +
                        (item?.hidden === true ? ' tct-row--hidden' : '')
                      }
                      data-index={index}
                      draggable
                      key={testCase.id}
                      onClick={(event) => clickRow(event, testCase, index)}
                      onDragStart={(event) => {
                        // 고른 줄을 끌면 고른 것 전부를, 아니면 그 줄 하나를 옮긴다.
                        const ids = selection.isSelected(testCase.id) ? [...selection.selectedIds] : [testCase.id]
                        writeCasesDrag(event.dataTransfer, ids)
                      }}
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
                          <span className="tc-id">{caseLabel(testCase.id)}</span>
                          <span className={`vdot ${testCase.verificationStatus}`} />
                          {/* 출처 라벨은 스텝 앞에 둔다. 뒤에 두면 긴 스텝의 말줄임표에 잘린다. */}
                          {testCase.origin !== undefined && (
                            <span
                              className={'tct-origin tct-origin--' + testCase.origin.toLowerCase()}
                              title={testCase.origin === 'MAP' ? m.origin.mapTitle : m.origin.manualTitle}
                            >
                              {m.origin[testCase.origin]}
                            </span>
                          )}
                          <TestCaseHover projectId={projectId} caseId={testCase.id} gameBuildId={selectedBuildId}><span className="tct-step-text">
                            {testCase.step.length > 0 ? <InlineCode className="tct-code" text={testCase.step} /> : m.row.untitled}
                            {note !== null && <span className="tct-absent-note">{note}</span>}
                            {item?.hidden === true && (
                              <span className="tct-hidden-tag" title={m.folderItems.hiddenTitle}>{m.folderItems.hiddenTag}</span>
                            )}
                          </span></TestCaseHover>
                        </span>
                      </td>
                      <td><SceneChip scene={testCase.scene} /></td>
                      <td><SpecGradeChip bare status={testCase.status} /></td>
                      <td>
                        <div className="tct-content-status"><StatusPill labels={m} status={result} />{contentByCase.has(testCase.id) && <ContentReviewBadge row={contentByCase.get(testCase.id)!} />}</div>
                      </td>
                      {comparing && (
                        <td>
                          <StatusPill labels={m} status={versionRow?.compareVerificationStatus ?? null} />
                        </td>
                      )}
                      <td className="tct-quiet tct-expected">
                        {testCase.expectedValue.length > 0 ? <InlineCode className="tct-code" text={testCase.expectedValue} /> : m.row.noExpectedValue}
                      </td>
                      <td className="tct-quiet mono">{formatDate(testCase.createdAt)}</td>
                    </tr>
                    )
                  })}
                  {!loadingRows && rows.padBottom > 0 && (
                    <tr aria-hidden="true" className="tct-spacer">
                      <td colSpan={comparing ? 8 : 7} style={{ height: rows.padBottom }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="cp-fade cp-fade--bottom" aria-hidden="true"><span className="cp-fade-hint">▾</span></div>
          </div>
        )}

        <div className="cp-foot">
          <span>↑↓ {m.row.hintNav}</span>
          <span>{loadingRows ? m.section.loading : m.section.shownOf(shown.length, tally.total)}</span>
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
            refreshFolderItems()
            refreshFolders()
            setCreating(false)
            setSelectedId(created.id)
            setAnnouncement(m.editor.created)
          }}
          onDelete={() => setDeleting(selected)}
          onSaved={(saved) => {
            if (saved.origin !== 'MAP' || selectedBuildId === null || selectedBuildId === latestVersion?.gameBuildId) library.applySaved(saved)
            else refreshLibrary()
            refreshVersions()
            setAnnouncement(m.editor.saved)
          }}
          projectId={projectId}
          testCase={selected}
          editGameBuildId={selectedBuildId}
          // 새 케이스는 기본으로 현재 버전(가장 최근)에 넣는다(ARTEL-1032). 폴더에서 만든 케이스도 버전 라이브러리에 바로 보인다.
          versionChoice={
            versionsMode
              ? { versions: versionList.versions, groups: versionList.groups, defaultId: latestVersion?.gameBuildId ?? null }
              : undefined
          }
        />
      )}

      <p aria-live="polite" className="visually-hidden" role="status">{announcement}</p>

      {/* 튜토리얼을 다시 보는 길(ARTEL-1033). 라이브러리 왼쪽 아래, 폴더 창 밑의 빈자리에 회색으로 둔다. */}
      <button
        className="tcl-help"
        data-tour="help"
        onClick={tour.start}
        title={m.tour.helpTitle}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <circle cx="8" cy="8" fill="none" r="6.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6.3 6.2a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3v.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
          <circle cx="8" cy="11.6" fill="currentColor" r=".8" />
        </svg>
        {m.tour.help}
      </button>

      {tour.open && (
        <CoachTour index={tour.index} onFinish={tour.finish} onIndex={tour.setIndex} steps={tourSteps} />
      )}

      {isGenerating && (
        <GenerateTestCasesDialog
          groups={versionList.groups}
          onClose={() => setIsGenerating(false)}
          onGenerated={handleGenerated}
          projectId={projectId}
          versions={versionList.versions}
        />
      )}

      {importTarget !== null && (
        <ImportManualCasesDialog
          folders={folderList.folders}
          groups={versionList.groups}
          onClose={() => setImportTarget(null)}
          onConfirm={async (caseIds) => {
            const target = importTarget
            await folderHistory.execute(
              addToVersionCommand(projectId, target.gameBuildId, caseIds, h.addToVersion, (added) =>
                setAnnouncement(m.addToVersion.done(added, versionName(target))),
              ),
            )
            setImportTarget(null)
          }}
          projectId={projectId}
          target={importTarget}
          versions={versionList.versions}
        />
      )}

      {verdictTarget !== null && (
        <VerdictImportDialog
          groups={versionList.groups}
          onClose={() => setVerdictTarget(null)}
          onDone={handleVerdictsImported}
          projectId={projectId}
          target={verdictTarget}
          versions={versionList.versions}
        />
      )}

      {isAddingToVersion && (
        <VersionTreeDialog
          confirmLabel={m.addToVersion.confirm(selectedManualIds.length)}
          groups={versionList.groups}
          hint={m.addToVersion.hint}
          initialId={selectedBuildId ?? latestVersion?.gameBuildId ?? null}
          onClose={() => setIsAddingToVersion(false)}
          onConfirm={async (gameBuildId) => {
            if (gameBuildId !== null) await addSelectedToVersion(gameBuildId)
          }}
          title={m.addToVersion.title(selectedManualIds.length)}
          versions={versionList.versions}
        />
      )}

      {isMoving && (
        <MoveCasesDialog
          count={selection.count}
          initialFolderId={null}
          mode={folderView ? 'moveItems' : 'add'}
          onClose={() => setIsMoving(false)}
          onConfirm={placeSelected}
          rows={folderView ? moveTargets.filter((row) => row.folder.id !== openFolderId) : moveTargets}
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


/** 한 버전의 판정 칸. 그 버전에 없는 케이스(null)는 "없음" 이다. */