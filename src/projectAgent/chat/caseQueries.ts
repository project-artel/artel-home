import { listTestScenarios } from '../../testScenarios/scenarioApi'
import { getScenarioCases } from '../../testScenarios/scenarioCaseApi'
import { listFolderItems, listTestCaseFolders, type FolderItem, type TestCaseFolder } from '../../testCases/testCaseFolderApi'
import { getTestCase, getVerdictHistory, listTestCases, type CaseVerdictHistoryItem } from '../../testCases/testCaseApi'
import type { CaseFunctions } from '../../testCases/caseFunctions'
import type { TestCase, VerificationStatus } from '../../testCases/testCaseTypes'
import { listTestCaseVersions, versionName, type TestCaseVersionSummary } from '../../testCases/testCaseVersions'

/*
 * 사람이 test case 화면에서 보는 것을 agent 도 읽게 하는 `query` kind 셋: `test_cases`, `test_case`, `build_versions`.
 * 새 endpoint 없이 화면이 쓰는 client 함수만 부른다. 행 수 상한과 `truncated` 규칙은 queries.ts 와 같다.
 */

const ROW_LIMIT = 20

/**
 * `test_case` 가 "이 케이스를 인용하는 시나리오" 를 찾느라 읽는 시나리오 수의 상한. 인용 관계를 돌려주는
 * endpoint 가 없어서 시나리오마다 구성(`/cases`)을 한 번씩 읽어야 하므로, 요청 수가 시나리오 수만큼 는다.
 * 넘으면 앞의 30개만 읽고 `complete: false` 로 알린다.
 */
export const SCENARIO_SCAN_LIMIT = 30

export type CasePage<Row> = { rows: Row[]; truncated: boolean; total: number; offset: number }

export function pageRows<Row>(rows: readonly Row[], offset: number, limit = ROW_LIMIT): CasePage<Row> {
  const start = Math.max(0, Math.floor(offset))
  return { rows: rows.slice(start, start + limit), truncated: start + limit < rows.length, total: rows.length, offset: start }
}

export type CaseListFilter = {
  ids?: readonly string[]
  search?: string
  scene?: string
  verificationStatus?: VerificationStatus
  /** 폴더에 든 케이스 id. 폴더는 케이스를 여러 개 담고 한 케이스가 여러 폴더에 들 수 있어서 `folderId` 필드와 따로 센다. */
  folderCaseIds?: ReadonlySet<string>
}

function matchesSearch(testCase: TestCase, search: string): boolean {
  // 화면의 검색(testCaseLibrary.matchesQuery)과 같은 네 필드다.
  return (
    testCase.step.toLowerCase().includes(search) ||
    testCase.scene.toLowerCase().includes(search) ||
    testCase.expectedValue.toLowerCase().includes(search) ||
    (testCase.precondition ?? '').toLowerCase().includes(search)
  )
}

export function filterCases(cases: readonly TestCase[], filter: CaseListFilter): TestCase[] {
  const search = filter.search?.trim().toLowerCase() ?? ''
  const ids = filter.ids === undefined || filter.ids.length === 0 ? null : new Set(filter.ids)
  return cases.filter(
    (testCase) =>
      (ids === null || ids.has(testCase.id)) &&
      (filter.scene === undefined || testCase.scene === filter.scene) &&
      (filter.verificationStatus === undefined || testCase.verificationStatus === filter.verificationStatus) &&
      (filter.folderCaseIds === undefined || filter.folderCaseIds.has(testCase.id)) &&
      (search.length === 0 || matchesSearch(testCase, search)),
  )
}

export type CaseRow = {
  id: string
  scene: string
  step: string
  precondition: string | null
  expectedValue: string
  /** 기획 쪽이 매긴 등급(ready, candidate 등). QA 판정이 아니다. */
  specStatus: string | null
  verificationStatus: VerificationStatus
  origin: 'MAP' | 'MANUAL' | null
  folderId: string | null
  folderName: string | null
  /** 마지막으로 판정한 build 의 이름(label 이 있으면 label, 없으면 version). 이름을 못 풀면 id. */
  lastVerifiedBuild: string | null
  lastVerifiedBuildId: string | null
  createdAt: string
}

export type CaseLookups = {
  folders: readonly TestCaseFolder[]
  versions: readonly TestCaseVersionSummary[]
}

function buildName(versions: readonly TestCaseVersionSummary[], gameBuildId: string): string {
  const found = versions.find((version) => version.gameBuildId === gameBuildId)
  return found === undefined ? gameBuildId : versionName(found)
}

export function toCaseRow(testCase: TestCase, lookups: CaseLookups): CaseRow {
  return {
    id: testCase.id,
    scene: testCase.scene,
    step: testCase.step,
    precondition: testCase.precondition,
    expectedValue: testCase.expectedValue,
    specStatus: testCase.status,
    verificationStatus: testCase.verificationStatus,
    origin: testCase.origin ?? null,
    folderId: testCase.folderId,
    folderName: lookups.folders.find((folder) => folder.id === testCase.folderId)?.name ?? null,
    lastVerifiedBuild:
      testCase.lastVerifiedBuildId === null ? null : buildName(lookups.versions, testCase.lastVerifiedBuildId),
    lastVerifiedBuildId: testCase.lastVerifiedBuildId,
    createdAt: testCase.createdAt,
  }
}

export type CaseListResult = CasePage<CaseRow> & {
  /** `gameBuildId` 를 줬을 때만. 내용과 판정이 그 build 의 것이고 그 build 에 든 케이스만 나왔다는 설명이다. */
  scope: { gameBuildId: string; build: string; note: string } | null
  /** `folderId` 로 거를 때 숨긴 항목을 뺐으면 그 개수와 설명. 뺀 것이 없으면 없다. */
  hiddenExcluded?: { count: number; note: string }
}

function buildScope(
  gameBuildId: string,
  versions: readonly TestCaseVersionSummary[],
  note: (build: string) => string,
): NonNullable<CaseListResult['scope']> {
  const build = buildName(versions, gameBuildId)
  return { gameBuildId, build, note: note(build) }
}

export function buildCaseList(
  cases: readonly TestCase[],
  filter: CaseListFilter,
  offset: number,
  lookups: CaseLookups,
  gameBuildId: string | undefined,
): CaseListResult {
  const page = pageRows(filterCases(cases, filter), offset)
  const rows = page.rows.map((testCase) => toCaseRow(testCase, lookups))
  if (gameBuildId === undefined) return { ...page, rows, scope: null }
  return {
    ...page,
    rows,
    scope: buildScope(
      gameBuildId,
      lookups.versions,
      (build) => `Only cases in build ${build} are listed, with that build's content and verdict. Cases outside the build are not shown.`,
    ),
  }
}

export type BuildVersionRow = {
  gameBuildId: string
  version: string
  label: string | null
  latest: boolean
  hidden: boolean
  createdAt: string
  caseCount: number
  verificationCounts: Record<VerificationStatus, number>
}

export function trimBuildVersions(versions: readonly TestCaseVersionSummary[]): CasePage<BuildVersionRow> & {
  unversionedCaseCount: number | null
} {
  // 서버가 최신 버전부터 주지만, 순서를 믿지 않고 createdAt 으로 한 번 더 세운다. 같으면 받은 순서를 지킨다(안정 정렬).
  const newestFirst = [...versions].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const page = pageRows(newestFirst, 0)
  return {
    ...page,
    unversionedCaseCount: null,
    rows: page.rows.map((version) => ({
      gameBuildId: version.gameBuildId,
      version: version.version,
      label: version.label,
      latest: version.latest,
      hidden: version.hidden,
      createdAt: version.createdAt,
      caseCount: version.total,
      verificationCounts: version.counts,
    })),
  }
}

export type CaseBuildRow = {
  gameBuildId: string
  build: string
  verificationStatus: VerificationStatus
}

/** verdict-history 는 오래된 build 부터 온다. agent 에게는 최신이 먼저 보이게 뒤집는다. */
export function trimCaseBuilds(history: readonly CaseVerdictHistoryItem[], versions: readonly TestCaseVersionSummary[]) {
  return pageRows(
    [...history].reverse().map((item): CaseBuildRow => ({
      gameBuildId: item.gameBuildId,
      build: item.version ? versionName(item) : buildName(versions, item.gameBuildId),
      verificationStatus: item.verificationStatus,
    })),
    0,
  )
}

export type CaseScenarioRow = { testScenarioId: number; title: string; executionMode: string; position: number }

export type CaseScenarios = {
  rows: CaseScenarioRow[]
  scenariosTotal: number
  scenariosChecked: number
  /** 시나리오를 전부 읽었고 읽다 실패한 것이 없으면 true. false 면 목록이 빠졌을 수 있다. */
  complete: boolean
}

export type CaseDetail = {
  case: CaseRow & {
    evidenceGaps: string[]
    functions: CaseFunctions | null
  }
  /** `gameBuildId` 를 줬으면 그 build 의 내용과 판정이다. */
  scope: CaseListResult['scope']
  builds: CasePage<CaseBuildRow>
  /** 시나리오를 읽지 못했으면 null. */
  scenarios: CaseScenarios | null
}

export async function readCaseScenarios(projectId: string, caseId: string, signal: AbortSignal): Promise<CaseScenarios> {
  const scenarios = await listTestScenarios(Number(projectId), signal)
  const scanned = scenarios.slice(0, SCENARIO_SCAN_LIMIT)
  const settled = await Promise.allSettled(scanned.map((scenario) => getScenarioCases(scenario.testScenarioId, signal)))
  const rows: CaseScenarioRow[] = []
  let failed = 0
  settled.forEach((outcome, index) => {
    if (outcome.status === 'rejected') {
      failed += 1
      return
    }
    const hit = outcome.value.find((item) => item.case.id === caseId)
    if (hit === undefined) return
    const scenario = scanned[index]
    rows.push({
      testScenarioId: scenario.testScenarioId,
      title: scenario.title,
      executionMode: scenario.executionMode,
      position: hit.position,
    })
  })
  return {
    rows,
    scenariosTotal: scenarios.length,
    scenariosChecked: scanned.length - failed,
    complete: scenarios.length <= SCENARIO_SCAN_LIMIT && failed === 0,
  }
}

export async function runTestCases(
  projectId: string,
  filter: Omit<CaseListFilter, 'folderCaseIds'> & { folderId?: string },
  offset: number,
  gameBuildId: string | undefined,
  signal: AbortSignal,
): Promise<CaseListResult> {
  const [cases, folders, library, folderItems] = await Promise.all([
    listTestCases(projectId, signal, { gameBuildId }),
    listTestCaseFolders(projectId, signal),
    listTestCaseVersions(projectId, signal),
    filter.folderId === undefined ? Promise.resolve(null) : listFolderItems(projectId, filter.folderId, gameBuildId ?? null, signal),
  ])
  const inFolder = folderItems === null ? null : folderCaseIdsOf(folderItems.items)
  const result = buildCaseList(cases, { ...filter, folderCaseIds: inFolder?.caseIds }, offset, { folders, versions: library.versions }, gameBuildId)
  if (inFolder === null || inFolder.hiddenExcluded === 0) return result
  return {
    ...result,
    hiddenExcluded: {
      count: inFolder.hiddenExcluded,
      note: `${inFolder.hiddenExcluded} cases hidden in this folder are not listed, the same as the case library does by default.`,
    },
  }
}

/** 폴더 안 케이스 id. 케이스 라이브러리의 기본 보기처럼 숨긴 항목은 뺀다. 뺀 개수를 함께 돌려준다. */
export function folderCaseIdsOf(items: readonly Pick<FolderItem, 'inVersion' | 'hidden' | 'testCase'>[]): {
  caseIds: Set<string>
  hiddenExcluded: number
} {
  const present = items.filter((item) => item.inVersion)
  return {
    caseIds: new Set(present.filter((item) => !item.hidden).map((item) => item.testCase.id)),
    hiddenExcluded: present.filter((item) => item.hidden).length,
  }
}

export async function runTestCase(
  projectId: string,
  caseId: string,
  gameBuildId: string | undefined,
  signal: AbortSignal,
): Promise<CaseDetail> {
  const [testCase, history, folders, library, scenarios] = await Promise.all([
    getTestCase(projectId, caseId, signal, { gameBuildId }),
    getVerdictHistory(projectId, caseId, signal),
    listTestCaseFolders(projectId, signal),
    listTestCaseVersions(projectId, signal),
    readCaseScenarios(projectId, caseId, signal).catch(() => null),
  ])
  const lookups = { folders, versions: library.versions }
  const scope =
    gameBuildId === undefined
      ? null
      : buildScope(gameBuildId, library.versions, (build) => `Content and verdict are the ones in build ${build}.`)
  return {
    case: { ...toCaseRow(testCase, lookups), evidenceGaps: testCase.evidenceGaps, functions: testCase.functions ?? null },
    scope,
    builds: trimCaseBuilds(history, library.versions),
    scenarios,
  }
}

export async function runBuildVersions(projectId: string, signal: AbortSignal) {
  const library = await listTestCaseVersions(projectId, signal)
  return { ...trimBuildVersions(library.versions), unversionedCaseCount: library.unversionedTotal }
}
