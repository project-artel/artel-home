import type { CaseOrigin, TestCase } from '../testCases/testCaseTypes'
import type { TestCaseVersionSummary } from '../testCases/testCaseVersions'
import { buildFreeCaseSteps, type ScenarioDraft } from './scenarioTypes'

/*
 * project agent 의 시나리오 action(`useScenarioAgentActions`)이 쓰는 순수 함수. 화면 상태도 서버 호출도
 * 없이 draft 와 케이스 목록만 받아 결과를 돌려준다.
 */

/** ORDERED → FREE 에서 빠지는 스텝 하나. `case_id` 가 없는 스텝이다. */
export type DroppedStep = { index: number; action: string }

export type FreeConversion = {
  draft: ScenarioDraft
  /** FREE draft 에 남는 케이스 id. 처음 나온 순서다. */
  keptCaseIds: string[]
  droppedSteps: DroppedStep[]
  /** `exclude` 로 뺀 케이스 id. */
  excludedCaseIds: string[]
}

/** draft 에 실린 케이스 id. 처음 나온 순서이고 중복은 한 번만 센다. */
export function caseIdsInDraft(draft: Pick<ScenarioDraft, 'steps'>): string[] {
  const ids: string[] = []
  for (const step of draft.steps) {
    if (step.case_id === null) continue
    const caseId = String(step.case_id)
    if (!ids.includes(caseId)) ids.push(caseId)
  }
  return ids
}

/**
 * ORDERED draft 를 FREE 로 바꾼다. `case_id` 가 있는 스텝은 케이스마다 처음 나온 하나만 남기고, `case_id`
 * 가 없는 스텝(GAP 포함)은 뺀다. 서버의 FREE 규칙(`ScenarioExecutionRules`)이 모든 스텝에 `case_id`,
 * 중복 없음, 빈 action 을 요구하기 때문이다. `exclude` 에 든 케이스도 뺀다.
 */
export function convertDraftToFree(draft: ScenarioDraft, exclude: ReadonlySet<string> = new Set()): FreeConversion {
  const droppedSteps: DroppedStep[] = []
  draft.steps.forEach((step, index) => {
    if (step.case_id === null) droppedSteps.push({ index, action: step.action })
  })
  const allCaseIds = caseIdsInDraft(draft)
  const keptCaseIds = allCaseIds.filter((caseId) => !exclude.has(caseId))
  return {
    draft: { ...draft, execution_mode: 'FREE', steps: buildFreeCaseSteps(keptCaseIds) },
    keptCaseIds,
    droppedSteps,
    excludedCaseIds: allCaseIds.filter((caseId) => exclude.has(caseId)),
  }
}

/** FREE draft 끝에 케이스를 붙인다. 이미 든 케이스와 `caseIds` 안의 중복은 건너뛴다. */
export function appendFreeCases(draft: ScenarioDraft, caseIds: readonly string[]): { draft: ScenarioDraft; added: string[]; alreadyInScenario: string[] } {
  const held = new Set(caseIdsInDraft(draft))
  const added: string[] = []
  const alreadyInScenario: string[] = []
  for (const caseId of new Set(caseIds)) {
    if (held.has(caseId)) alreadyInScenario.push(caseId)
    else added.push(caseId)
  }
  return { draft: { ...draft, steps: [...draft.steps, ...buildFreeCaseSteps(added)] }, added, alreadyInScenario }
}

/** FREE draft 에서 케이스를 뺀다. draft 에 없던 id 는 `notInScenario` 에 담는다. */
export function removeFreeCases(draft: ScenarioDraft, caseIds: readonly string[]): { draft: ScenarioDraft; removed: string[]; notInScenario: string[] } {
  const held = new Set(caseIdsInDraft(draft))
  const targets = new Set(caseIds)
  return {
    draft: { ...draft, steps: draft.steps.filter((step) => step.case_id === null || !targets.has(String(step.case_id))) },
    removed: [...targets].filter((caseId) => held.has(caseId)),
    notInScenario: [...targets].filter((caseId) => !held.has(caseId)),
  }
}

/** model 이 보낸 케이스 id 목록을 문자열로 맞춘다. 숫자로 온 id 도 받는다. 중복은 한 번만 남긴다. */
export function normalizeCaseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids: string[] = []
  for (const entry of value) {
    const caseId = typeof entry === 'string' ? entry.trim() : typeof entry === 'number' && Number.isInteger(entry) ? String(entry) : ''
    if (caseId.length > 0 && !ids.includes(caseId)) ids.push(caseId)
  }
  return ids
}

/** 프로젝트 전체 목록에 없는 id. */
export function unknownCaseIds(caseIds: readonly string[], projectCases: readonly TestCase[]): string[] {
  const known = new Set(projectCases.map((testCase) => testCase.id))
  return caseIds.filter((caseId) => !known.has(caseId))
}

export type MissingCase = {
  caseId: string
  /** 프로젝트에서도 지워진 케이스면 null. */
  origin: CaseOrigin | null
  /** 이 빌드 버전에 넣을 수 있는가. 사용자 생성(`MANUAL`) 케이스만 넣을 수 있다. */
  addable: boolean
}

/**
 * 테스트 런의 빌드 버전에 `test_case_version` 행이 없는 케이스. 빌드로 좁힌 목록(`buildCases`)과 전체
 * 목록(`projectCases`)을 견줘 찾는다. 전체 목록에도 없으면 origin 이 null 이고 넣을 수 없다.
 */
export function findCasesMissingFromBuild(
  caseIds: readonly string[],
  buildCases: readonly TestCase[],
  projectCases: readonly TestCase[],
): MissingCase[] {
  const inBuild = new Set(buildCases.map((testCase) => testCase.id))
  const byId = new Map(projectCases.map((testCase) => [testCase.id, testCase]))
  return caseIds
    .filter((caseId) => !inBuild.has(caseId))
    .map((caseId) => {
      const origin = byId.get(caseId)?.origin ?? null
      return { caseId, origin, addable: origin === 'MANUAL' }
    })
}

export const CASES_MISSING_FROM_BUILD = 'cases_missing_from_build'

export type CasesMissingFromBuildFailure = {
  code: typeof CASES_MISSING_FROM_BUILD
  gameBuildId: string
  buildVersion: string
  missing: MissingCase[]
  hint: string
}

export function casesMissingFromBuildFailure(
  build: { gameBuildId: string; version: string },
  missing: MissingCase[],
): CasesMissingFromBuildFailure {
  return {
    code: CASES_MISSING_FROM_BUILD,
    gameBuildId: build.gameBuildId,
    buildVersion: build.version,
    missing,
    hint:
      'Nothing changed. Ask the user which to do: add the addable cases to this build (testScenario.addCasesToBuild scope run_build), to this build and every later build (scope run_build_and_later), or leave them out (call again with dropMissing: true); cases that are not addable can only be left out.',
  }
}

export type BuildScope = 'run_build' | 'run_build_and_later'

export type TargetBuild = { gameBuildId: string; version: string }

/**
 * 케이스를 넣을 빌드 버전. `run_build_and_later` 면 `listTestCaseVersions` 순서(최신이 앞)에서 런의 빌드보다
 * 앞에 있는 빌드도 넣는다. 결과는 런의 빌드가 먼저이고 그다음 오래된 것부터다. 런의 빌드가 목록에 없으면
 * 더 새로운 빌드를 가릴 수 없으므로 런의 빌드 하나만 돌려준다.
 */
export function selectTargetBuilds(
  versions: readonly Pick<TestCaseVersionSummary, 'gameBuildId' | 'version'>[],
  runBuild: TargetBuild,
  scope: BuildScope,
): TargetBuild[] {
  const target: TargetBuild = { gameBuildId: runBuild.gameBuildId, version: runBuild.version }
  if (scope === 'run_build') return [target]
  const runIndex = versions.findIndex((summary) => summary.gameBuildId === runBuild.gameBuildId)
  if (runIndex < 0) return [target]
  const newer = versions
    .slice(0, runIndex)
    .reverse()
    .map((summary) => ({ gameBuildId: summary.gameBuildId, version: summary.version }))
  return [target, ...newer]
}

export type SkipReason = 'map_origin' | 'already_present' | 'not_found'

export type SkippedCase = { caseId: string; reason: SkipReason; gameBuildId?: string }

/** 빌드에 넣기 전에 가른 케이스. 넣을 것만 서버로 보낸다. */
export function partitionCasesForBuild(
  caseIds: readonly string[],
  projectCases: readonly TestCase[],
): { sendable: string[]; skipped: SkippedCase[] } {
  const byId = new Map(projectCases.map((testCase) => [testCase.id, testCase]))
  const sendable: string[] = []
  const skipped: SkippedCase[] = []
  for (const caseId of caseIds) {
    const testCase = byId.get(caseId)
    if (testCase === undefined) skipped.push({ caseId, reason: 'not_found' })
    else if (testCase.origin === 'MAP') skipped.push({ caseId, reason: 'map_origin' })
    else sendable.push(caseId)
  }
  return { sendable, skipped }
}

/**
 * 보낸 케이스 가운데 서버가 넣지 않은 것. 서버는 자동 생성 케이스와 이미 든 케이스를 건너뛰는데, 자동
 * 생성 케이스는 보내기 전에 걸렀으므로 남은 것은 이미 든 케이스다.
 */
export function alreadyPresentInBuild(sent: readonly string[], added: readonly string[], gameBuildId: string): SkippedCase[] {
  const addedSet = new Set(added)
  return sent.filter((caseId) => !addedSet.has(caseId)).map((caseId) => ({ caseId, reason: 'already_present', gameBuildId }))
}
