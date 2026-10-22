import type { TestCase } from '../testCases/testCaseTypes'
import type { TestCaseVersionSummary } from '../testCases/testCaseVersions'
import type { RunGameBuild } from '../testRuns/testRunApi'
import {
  alreadyPresentInBuild,
  appendFreeCases,
  casesMissingFromBuildFailure,
  convertDraftToFree,
  findCasesMissingFromBuild,
  normalizeCaseIds,
  partitionCasesForBuild,
  removeFreeCases,
  selectTargetBuilds,
  unknownCaseIds,
  type BuildScope,
  type DroppedStep,
  type MissingCase,
  type SkippedCase,
} from './scenarioAgentEdits'
import { isFreeScenario, type ScenarioDraft } from './scenarioTypes'

/*
 * `testScenario.*` action 의 실행부. 화면과 서버를 `ScenarioAgentDependencies` 로 받아서 React 없이
 * node:test 로 돌릴 수 있다. hook(`useScenarioAgentActions`)은 이것을 만들어 binding 에 건네기만 한다.
 */

export type ScenarioAgentDependencies = {
  /** 편집기의 지금 draft. */
  readDraft: () => ScenarioDraft
  /** 편집기가 지금 보여 주는 시나리오의 id. 서버를 기다리는 사이 다른 시나리오로 옮겨 갔는지 알아내는 데 쓴다. */
  readScenarioId: () => number
  /** 편집기의 `replaceDraft`. autosave 와 undo 를 거친다. */
  replaceDraft: (next: (draft: ScenarioDraft) => ScenarioDraft) => void
  /** 테스트 런의 빌드 버전. 런 밖에서 열었거나 런에 빌드가 없으면 null. */
  resolveRunBuild: () => Promise<RunGameBuild | null>
  listProjectCases: () => Promise<TestCase[]>
  listBuildCases: (gameBuildId: string) => Promise<TestCase[]>
  /** 최신 버전이 앞이다(`listTestCaseVersions`). */
  listVersions: () => Promise<Pick<TestCaseVersionSummary, 'gameBuildId' | 'version'>[]>
  /** 실제로 넣은 id 를 돌려준다(`addCasesToVersion`). */
  addCasesToVersion: (gameBuildId: string, caseIds: string[]) => Promise<string[]>
  /** 케이스를 빌드에 넣은 뒤 화면의 케이스 목록을 다시 읽게 한다. */
  onCaseListsChanged: () => void
}

/**
 * 구조가 있는 실패. registry 는 던진 Error 의 message 만 agent 에게 보내므로 message 를 JSON 으로 둔다.
 * agent 는 `code` 를 읽고 사용자에게 물을지 정한다.
 */
export class ScenarioActionFailure extends Error {
  readonly payload: object

  constructor(payload: object) {
    super(JSON.stringify(payload))
    this.name = 'ScenarioActionFailure'
    this.payload = payload
  }
}

export const SCENARIO_CHANGED_REASON =
  'The open scenario changed while this action was waiting for the server, so nothing was edited. Run the action again on the scenario you want.'
export const NOT_FREE_REASON = 'The open scenario is ORDERED. Convert it with testScenario.convertToFree first.'
export const ALREADY_FREE_REASON = 'The open scenario is already FREE.'
export const NO_RUN_REASON = 'The scenario was not opened from a test run, so there is no build version to add cases to.'
const NO_RUN_BUILD_ERROR = 'The test run of this scenario has no build version, so there is no build to add cases to.'

export type ConvertToFreeResult = { keptCaseIds: string[]; droppedSteps: DroppedStep[]; droppedMissing: MissingCase[] }
export type AddCasesResult = { added: string[]; alreadyInScenario: string[]; droppedMissing: MissingCase[] }
export type RemoveCasesResult = { removed: string[]; notInScenario: string[] }
export type AddCasesToBuildResult = {
  builds: { gameBuildId: string; version: string; added: string[] }[]
  skipped: SkippedCase[]
}

/** `blocked` 에 쓰는 판단. 실행할 수 있으면 null. */
export function convertToFreeBlockedReason(draft: ScenarioDraft): string | null {
  return isFreeScenario(draft) ? ALREADY_FREE_REASON : null
}

export function freeOnlyBlockedReason(draft: ScenarioDraft): string | null {
  return isFreeScenario(draft) ? null : NOT_FREE_REASON
}

export function addCasesToBuildBlockedReason(runId: string | null): string | null {
  return runId === null ? NO_RUN_REASON : null
}

/**
 * 이미 읽어 둔 빌드를 지금 `?run=` 의 런에 그대로 써도 되는가. 런이 바뀐 직후에는 이전 런의 빌드가 남아 있어,
 * 어느 런의 것인지가 지금 런과 같을 때만 쓴다. 쓸 수 없으면 null.
 */
export function reusableRunBuild(
  known: RunGameBuild | null,
  knownRunId: string | null,
  currentRunId: string | null,
): RunGameBuild | null {
  return known !== null && currentRunId !== null && knownRunId === currentRunId ? known : null
}

function requireCaseIds(args: Record<string, unknown>): string[] {
  const caseIds = normalizeCaseIds(args.caseIds)
  if (caseIds.length === 0) throw new Error('caseIds must list at least one test case id.')
  return caseIds
}

export function createScenarioAgentRunners(dependencies: ScenarioAgentDependencies) {
  /** 시작할 때의 시나리오 id 를 잡아 두고, 서버를 기다린 뒤 쓰기 직전에 부른다. 다른 시나리오면 던진다. */
  function pinScenario(): () => void {
    const startedOn = dependencies.readScenarioId()
    return () => {
      if (dependencies.readScenarioId() !== startedOn) throw new Error(SCENARIO_CHANGED_REASON)
    }
  }

  /**
   * 런의 빌드 버전에 없는 케이스를 가린다. 런의 빌드가 없으면 검사하지 않는다. 빠진 것이 있는데
   * `dropMissing` 이 true 가 아니면 던진다. 아무것도 바꾸기 전에 부른다.
   */
  async function checkBuild(
    caseIds: readonly string[],
    projectCases: readonly TestCase[],
    dropMissing: boolean,
  ): Promise<MissingCase[]> {
    if (caseIds.length === 0) return []
    const runBuild = await dependencies.resolveRunBuild()
    if (runBuild === null) return []
    const buildCases = await dependencies.listBuildCases(runBuild.gameBuildId)
    const missing = findCasesMissingFromBuild(caseIds, buildCases, projectCases)
    if (missing.length > 0 && !dropMissing) {
      throw new ScenarioActionFailure(casesMissingFromBuildFailure(runBuild, missing))
    }
    return missing
  }

  async function convertToFree(args: Record<string, unknown>): Promise<ConvertToFreeResult> {
    const assertSameScenario = pinScenario()
    const before = dependencies.readDraft()
    const blocked = convertToFreeBlockedReason(before)
    if (blocked !== null) throw new Error(blocked)
    const candidates = convertDraftToFree(before).keptCaseIds
    const projectCases = candidates.length === 0 ? [] : await dependencies.listProjectCases()
    const missing = await checkBuild(candidates, projectCases, args.dropMissing === true)
    assertSameScenario()
    const exclude = new Set(missing.map((one) => one.caseId))
    // 서버를 기다리는 사이 바뀐 draft 위에 바꾼다. 결과도 그 draft 로 센다.
    const conversion = convertDraftToFree(dependencies.readDraft(), exclude)
    dependencies.replaceDraft((draft) => convertDraftToFree(draft, exclude).draft)
    return { keptCaseIds: conversion.keptCaseIds, droppedSteps: conversion.droppedSteps, droppedMissing: missing }
  }

  async function addCases(args: Record<string, unknown>): Promise<AddCasesResult> {
    const assertSameScenario = pinScenario()
    const blocked = freeOnlyBlockedReason(dependencies.readDraft())
    if (blocked !== null) throw new Error(blocked)
    const caseIds = requireCaseIds(args)
    const projectCases = await dependencies.listProjectCases()
    const unknown = unknownCaseIds(caseIds, projectCases)
    if (unknown.length > 0) throw new Error(`These ids are not test cases of the project: ${unknown.join(', ')}.`)
    const notHeld = appendFreeCases(dependencies.readDraft(), caseIds).added
    const missing = await checkBuild(notHeld, projectCases, args.dropMissing === true)
    assertSameScenario()
    const exclude = new Set(missing.map((one) => one.caseId))
    const wanted = caseIds.filter((caseId) => !exclude.has(caseId))
    const appended = appendFreeCases(dependencies.readDraft(), wanted)
    dependencies.replaceDraft((draft) => appendFreeCases(draft, wanted).draft)
    return { added: appended.added, alreadyInScenario: appended.alreadyInScenario, droppedMissing: missing }
  }

  async function removeCases(args: Record<string, unknown>): Promise<RemoveCasesResult> {
    const blocked = freeOnlyBlockedReason(dependencies.readDraft())
    if (blocked !== null) throw new Error(blocked)
    const caseIds = requireCaseIds(args)
    const removal = removeFreeCases(dependencies.readDraft(), caseIds)
    if (removal.removed.length > 0) dependencies.replaceDraft((draft) => removeFreeCases(draft, caseIds).draft)
    return { removed: removal.removed, notInScenario: removal.notInScenario }
  }

  async function addCasesToBuild(args: Record<string, unknown>): Promise<AddCasesToBuildResult> {
    const caseIds = requireCaseIds(args)
    const scope: BuildScope = args.scope === 'run_build_and_later' ? 'run_build_and_later' : 'run_build'
    const runBuild = await dependencies.resolveRunBuild()
    if (runBuild === null) throw new Error(NO_RUN_BUILD_ERROR)
    const [projectCases, versions] = await Promise.all([
      dependencies.listProjectCases(),
      scope === 'run_build' ? Promise.resolve([]) : dependencies.listVersions(),
    ])
    const { sendable, skipped } = partitionCasesForBuild(caseIds, projectCases)
    const builds: AddCasesToBuildResult['builds'] = []
    if (sendable.length === 0) return { builds, skipped }
    for (const target of selectTargetBuilds(versions, runBuild, scope)) {
      try {
        const added = await dependencies.addCasesToVersion(target.gameBuildId, sendable)
        builds.push({ gameBuildId: target.gameBuildId, version: target.version, added })
        skipped.push(...alreadyPresentInBuild(sendable, added, target.gameBuildId))
      } catch (error) {
        // 앞 빌드에는 이미 들어갔으므로 목록을 다시 읽고, 어디까지 들어갔는지 실패에 적는다.
        if (builds.length > 0) dependencies.onCaseListsChanged()
        throw new ScenarioActionFailure({
          code: 'add_to_build_failed',
          failedGameBuildId: target.gameBuildId,
          failedBuildVersion: target.version,
          error: error instanceof Error ? error.message : String(error),
          builds,
        })
      }
    }
    dependencies.onCaseListsChanged()
    return { builds, skipped }
  }

  return { convertToFree, addCases, removeCases, addCasesToBuild }
}
