import type { GameBuild } from '../projects/gameTypes'
import type { TestCase, VerificationStatus } from './testCaseTypes'

/*
 * 케이스 라이브러리 화면이 목록을 좁히고 줄 세우는 규칙.
 *
 * 컴포넌트가 아니라 이 파일에 두는 이유는 두 가지다. 규칙이 순수 함수라 렌더 없이 그대로
 * 테스트할 수 있고, 목록·집계·빈 상태 문구가 모두 같은 판정을 읽어야 "3건"이라 적어 놓고
 * 네 줄을 그리는 일이 생기지 않는다.
 */

export type TestCaseStatusFilter = 'ALL' | VerificationStatus

/** 목록을 세우는 두 가지 기준. */
export type TestCaseSort =
  /** 실패 → 미검증 → 통과. 이 화면이 답하려는 질문("무엇이 깨졌나")의 순서다. */
  | 'FAILING_FIRST'
  /** 서버가 준 순서 그대로. 서버는 `id DESC` 로 내므로 최근에 만든 케이스가 위다. */
  | 'NEWEST'

export type TestCaseFilters = {
  query: string
  /** 빈 문자열은 씬을 가리지 않는다는 뜻이다. */
  scene: string
  status: TestCaseStatusFilter
}

export const NO_FILTERS: TestCaseFilters = { query: '', scene: '', status: 'ALL' }

/** 하나라도 걸려 있으면 빈 목록의 문구가 "아직 없음"이 아니라 "조건에 맞는 것이 없음"이 된다. */
export function hasActiveFilters(filters: TestCaseFilters): boolean {
  return filters.query.trim().length > 0 || filters.scene.length > 0 || filters.status !== 'ALL'
}

export type SceneCount = { scene: string; count: number }

/**
 * 이 프로젝트에 실제로 있는 씬과 각 씬의 케이스 수, 많은 것부터.
 *
 * 씬 목록을 서버가 따로 내주지 않으므로 케이스에서 뽑는다. 같은 수면 이름순으로 갈라
 * 목록을 다시 그릴 때 순서가 흔들리지 않게 한다.
 */
export function countScenes(cases: TestCase[]): SceneCount[] {
  const counts = new Map<string, number>()
  for (const testCase of cases) {
    const scene = testCase.scene.trim()
    if (scene.length === 0) continue
    counts.set(scene, (counts.get(scene) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([scene, count]) => ({ scene, count }))
    .sort((left, right) => right.count - left.count || left.scene.localeCompare(right.scene))
}

/**
 * 검색어가 닿는 곳은 케이스의 본문 네 필드다. id 는 뺐다 — 화면 어디에도 보이지 않는 값이라
 * 사용자가 그것으로 검색할 수 없고, 넣어 두면 우연히 숫자가 걸리는 행만 늘어난다.
 */
function matchesQuery(testCase: TestCase, query: string): boolean {
  if (query.length === 0) return true

  return (
    testCase.step.toLowerCase().includes(query) ||
    testCase.scene.toLowerCase().includes(query) ||
    testCase.expectedValue.toLowerCase().includes(query) ||
    (testCase.precondition ?? '').toLowerCase().includes(query)
  )
}

const FAILING_FIRST_RANK: Record<VerificationStatus, number> = {
  BROKEN: 0,
  DRAFT: 1,
  VERIFIED: 2,
}

/**
 * 걸러 낸 뒤 세운 목록.
 *
 * `NEWEST` 는 받은 순서를 그대로 둔다. 서버가 이미 최근 것부터 주므로 여기서 `createdAt` 을
 * 다시 정렬하면, 같은 초에 만들어진 케이스들의 순서만 서버와 어긋난다.
 * `FAILING_FIRST` 는 상태 순위로만 세우고 같은 순위 안에서는 원래 순서를 지킨다(안정 정렬).
 */
export function selectTestCases(
  cases: TestCase[],
  filters: TestCaseFilters,
  sort: TestCaseSort,
): TestCase[] {
  const query = filters.query.trim().toLowerCase()
  const shown = cases.filter(
    (testCase) =>
      (filters.status === 'ALL' || testCase.verificationStatus === filters.status) &&
      (filters.scene.length === 0 || testCase.scene === filters.scene) &&
      matchesQuery(testCase, query),
  )

  if (sort === 'NEWEST') return shown

  return [...shown].sort(
    (left, right) =>
      FAILING_FIRST_RANK[left.verificationStatus] - FAILING_FIRST_RANK[right.verificationStatus],
  )
}

export type TestCaseTally = {
  total: number
  verified: number
  draft: number
  broken: number
}

/** 필터 chip 옆에 붙는 수. 전체 목록에서 세므로 필터를 걸어도 숫자가 흔들리지 않는다. */
export function tallyTestCases(cases: TestCase[]): TestCaseTally {
  const tally: TestCaseTally = { total: cases.length, verified: 0, draft: 0, broken: 0 }
  for (const testCase of cases) {
    if (testCase.verificationStatus === 'VERIFIED') tally.verified += 1
    else if (testCase.verificationStatus === 'BROKEN') tally.broken += 1
    else tally.draft += 1
  }
  return tally
}

/**
 * 마지막으로 검증한 build 를 사람이 읽는 이름으로.
 *
 * `lastVerifiedBuildId` 가 가리키는 build 가 이미 지워졌을 수 있어 `null` 을 낸다 — 그때
 * 화면은 build 칸을 비운다. 없는 build 의 id 를 그대로 적어 주면 사용자가 확인할 방법이
 * 없는 숫자만 남는다.
 */
export function describeVerifiedBuild(
  buildId: string | null,
  builds: GameBuild[],
): string | null {
  if (buildId === null) return null

  const build = builds.find((candidate) => candidate.id === buildId)
  if (build === undefined) return null

  const label = build.label?.trim() ?? ''
  return label.length > 0 ? label : build.version
}
