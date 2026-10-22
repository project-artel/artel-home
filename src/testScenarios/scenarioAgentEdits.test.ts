import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestCase } from '../testCases/testCaseTypes'
import {
  appendFreeCases,
  convertDraftToFree,
  findCasesMissingFromBuild,
  normalizeCaseIds,
  partitionCasesForBuild,
  removeFreeCases,
  selectTargetBuilds,
} from './scenarioAgentEdits'
import { createScenarioAgentRunners, NOT_FREE_REASON, reusableRunBuild, SCENARIO_CHANGED_REASON, type ScenarioAgentDependencies } from './scenarioAgentRunners'
import { buildFreeScenarioDraft, createEmptyStep, type ScenarioDraft, type ScenarioStep } from './scenarioTypes'

function testCase(id: string, origin: 'MAP' | 'MANUAL' = 'MANUAL'): TestCase {
  return {
    id, projectId: '1', scene: 'Shop', step: `step ${id}`, precondition: null, expectedValue: '', status: null,
    verificationStatus: 'DRAFT', lastVerifiedBuildId: null, createdAt: '', folderId: null, evidenceGaps: [], origin,
  }
}

function step(caseId: number | null, action: string): ScenarioStep {
  return { ...createEmptyStep(), case_id: caseId, action }
}

function orderedDraft(steps: ScenarioStep[]): ScenarioDraft {
  return { title: 'Shop', description: 'd', steps, execution_mode: 'ORDERED' }
}

const ORDERED = orderedDraft([
  step(null, 'open the shop'),
  step(12, 'buy a sword'),
  step(12, 'check the gold'),
  step(40, 'sell it'),
  step(null, 'close the shop'),
  step(12, 'buy again'),
])

test('convertDraftToFree keeps each case once in first-seen order and reports the steps without a case', () => {
  const conversion = convertDraftToFree(ORDERED)
  assert.equal(conversion.draft.execution_mode, 'FREE')
  assert.equal(conversion.draft.title, 'Shop')
  assert.deepEqual(conversion.draft.steps.map((one) => [one.action, one.case_id]), [['', 12], ['', 40]])
  assert.deepEqual(conversion.keptCaseIds, ['12', '40'])
  assert.deepEqual(conversion.droppedSteps, [
    { index: 0, action: 'open the shop' },
    { index: 4, action: 'close the shop' },
  ])
  assert.deepEqual(conversion.excludedCaseIds, [])
})

test('convertDraftToFree leaves out excluded cases', () => {
  const conversion = convertDraftToFree(ORDERED, new Set(['12']))
  assert.deepEqual(conversion.keptCaseIds, ['40'])
  assert.deepEqual(conversion.excludedCaseIds, ['12'])
})

test('appendFreeCases skips held and repeated ids; removeFreeCases reports ids it did not hold', () => {
  const draft = buildFreeScenarioDraft('F', ['1', '2'])
  const appended = appendFreeCases(draft, ['2', '3', '3'])
  assert.deepEqual(appended.added, ['3'])
  assert.deepEqual(appended.alreadyInScenario, ['2'])
  assert.deepEqual(appended.draft.steps.map((one) => one.case_id), [1, 2, 3])
  const removed = removeFreeCases(appended.draft, ['1', '9'])
  assert.deepEqual(removed.removed, ['1'])
  assert.deepEqual(removed.notInScenario, ['9'])
  assert.deepEqual(removed.draft.steps.map((one) => one.case_id), [2, 3])
})

test('normalizeCaseIds accepts numbers, trims and drops duplicates and junk', () => {
  assert.deepEqual(normalizeCaseIds([' 4 ', 4, 5, 1.5, '', null]), ['4', '5'])
  assert.deepEqual(normalizeCaseIds('4'), [])
})

test('findCasesMissingFromBuild compares the build list with the project list', () => {
  const project = [testCase('1'), testCase('2', 'MAP'), testCase('3')]
  const build = [testCase('3')]
  assert.deepEqual(findCasesMissingFromBuild(['1', '2', '3', '9'], build, project), [
    { caseId: '1', origin: 'MANUAL', addable: true },
    { caseId: '2', origin: 'MAP', addable: false },
    { caseId: '9', origin: null, addable: false },
  ])
})

test('selectTargetBuilds adds the newer builds, oldest first, after the run build', () => {
  const versions = [
    { gameBuildId: '30', version: '1.3' },
    { gameBuildId: '20', version: '1.2' },
    { gameBuildId: '10', version: '1.1' },
  ]
  const runBuild = { gameBuildId: '10', version: '1.1' }
  assert.deepEqual(selectTargetBuilds(versions, runBuild, 'run_build'), [runBuild])
  assert.deepEqual(selectTargetBuilds(versions, runBuild, 'run_build_and_later').map((one) => one.gameBuildId), ['10', '20', '30'])
  assert.deepEqual(selectTargetBuilds(versions, { gameBuildId: '30', version: '1.3' }, 'run_build_and_later').map((one) => one.gameBuildId), ['30'])
  assert.deepEqual(selectTargetBuilds([], runBuild, 'run_build_and_later'), [runBuild])
})

test('partitionCasesForBuild skips unknown and MAP cases', () => {
  const result = partitionCasesForBuild(['1', '2', '9'], [testCase('1'), testCase('2', 'MAP')])
  assert.deepEqual(result.sendable, ['1'])
  assert.deepEqual(result.skipped, [
    { caseId: '2', reason: 'map_origin' },
    { caseId: '9', reason: 'not_found' },
  ])
})

type Fake = ScenarioAgentDependencies & { scenarioId: number; draft: ScenarioDraft; added: { gameBuildId: string; caseIds: string[] }[]; invalidated: number }

function fakeDependencies(options: {
  draft: ScenarioDraft
  runBuild?: { gameBuildId: string; version: string; label: string | null } | null
  project?: TestCase[]
  build?: TestCase[]
  presentInBuild?: Record<string, string[]>
}): Fake {
  const fake: Fake = {
    scenarioId: 1,
    draft: options.draft,
    added: [],
    invalidated: 0,
    readScenarioId: () => fake.scenarioId,
    readDraft: () => fake.draft,
    replaceDraft: (next) => {
      fake.draft = next(fake.draft)
    },
    resolveRunBuild: async () => options.runBuild ?? null,
    listProjectCases: async () => options.project ?? [],
    listBuildCases: async () => options.build ?? [],
    listVersions: async () => [
      { gameBuildId: '20', version: '1.2' },
      { gameBuildId: '10', version: '1.1' },
    ],
    addCasesToVersion: async (gameBuildId, caseIds) => {
      fake.added.push({ gameBuildId, caseIds })
      const present = new Set(options.presentInBuild?.[gameBuildId] ?? [])
      return caseIds.filter((caseId) => !present.has(caseId))
    },
    onCaseListsChanged: () => {
      fake.invalidated += 1
    },
  }
  return fake
}

const RUN_BUILD = { gameBuildId: '10', version: '1.1', label: null }

test('convertToFree without a run build converts and reports kept and dropped', async () => {
  const fake = fakeDependencies({ draft: ORDERED })
  const result = await createScenarioAgentRunners(fake).convertToFree({})
  assert.deepEqual(result.keptCaseIds, ['12', '40'])
  assert.equal(result.droppedSteps.length, 2)
  assert.equal(fake.draft.execution_mode, 'FREE')
})

test('convertToFree fails with cases_missing_from_build and leaves the draft when a case is not in the run build', async () => {
  const fake = fakeDependencies({
    draft: ORDERED,
    runBuild: RUN_BUILD,
    project: [testCase('12'), testCase('40', 'MAP')],
    build: [testCase('12')],
  })
  await assert.rejects(createScenarioAgentRunners(fake).convertToFree({}), (error: Error) => {
    const payload = JSON.parse(error.message)
    assert.equal(payload.code, 'cases_missing_from_build')
    assert.equal(payload.gameBuildId, '10')
    assert.equal(payload.buildVersion, '1.1')
    assert.deepEqual(payload.missing, [{ caseId: '40', origin: 'MAP', addable: false }])
    assert.equal(typeof payload.hint, 'string')
    return true
  })
  assert.equal(fake.draft, ORDERED)
})

test('convertToFree with dropMissing leaves the missing cases out and lists them', async () => {
  const fake = fakeDependencies({ draft: ORDERED, runBuild: RUN_BUILD, project: [testCase('12'), testCase('40')], build: [testCase('12')] })
  const result = await createScenarioAgentRunners(fake).convertToFree({ dropMissing: true })
  assert.deepEqual(result.keptCaseIds, ['12'])
  assert.deepEqual(result.droppedMissing, [{ caseId: '40', origin: 'MANUAL', addable: true }])
  assert.deepEqual(fake.draft.steps.map((one) => one.case_id), [12])
})

test('addCases names unknown ids, needs a FREE scenario and checks only cases not held yet', async () => {
  const ordered = fakeDependencies({ draft: ORDERED })
  await assert.rejects(createScenarioAgentRunners(ordered).addCases({ caseIds: ['1'] }), { message: NOT_FREE_REASON })

  const free = buildFreeScenarioDraft('F', ['1'])
  const unknown = fakeDependencies({ draft: free, project: [testCase('1')] })
  await assert.rejects(createScenarioAgentRunners(unknown).addCases({ caseIds: ['1', '7', '8'] }), /7, 8/)

  // 1 은 이미 들었으므로 빌드에 없어도 검사하지 않는다.
  const fake = fakeDependencies({ draft: free, runBuild: RUN_BUILD, project: [testCase('1'), testCase('2'), testCase('3')], build: [testCase('2')] })
  await assert.rejects(createScenarioAgentRunners(fake).addCases({ caseIds: ['1', '2', '3'] }), (error: Error) => {
    assert.deepEqual(JSON.parse(error.message).missing.map((one: { caseId: string }) => one.caseId), ['3'])
    return true
  })
  assert.equal(fake.draft, free)
  const result = await createScenarioAgentRunners(fake).addCases({ caseIds: ['1', '2', '3'], dropMissing: true })
  assert.deepEqual(result.added, ['2'])
  assert.deepEqual(result.alreadyInScenario, ['1'])
  assert.deepEqual(fake.draft.steps.map((one) => one.case_id), [1, 2])
})

test('removeCases removes held cases only', async () => {
  const fake = fakeDependencies({ draft: buildFreeScenarioDraft('F', ['1', '2']) })
  assert.deepEqual(await createScenarioAgentRunners(fake).removeCases({ caseIds: ['2', '5'] }), { removed: ['2'], notInScenario: ['5'] })
  assert.deepEqual(fake.draft.steps.map((one) => one.case_id), [1])
})

test('addCasesToBuild adds to the run build and newer builds, reports skips and refreshes the lists', async () => {
  const fake = fakeDependencies({
    draft: ORDERED,
    runBuild: RUN_BUILD,
    project: [testCase('1'), testCase('2'), testCase('3', 'MAP')],
    presentInBuild: { '20': ['2'] },
  })
  const result = await createScenarioAgentRunners(fake).addCasesToBuild({ caseIds: ['1', '2', '3', '9'], scope: 'run_build_and_later' })
  assert.deepEqual(result.builds, [
    { gameBuildId: '10', version: '1.1', added: ['1', '2'] },
    { gameBuildId: '20', version: '1.2', added: ['1'] },
  ])
  assert.deepEqual(result.skipped, [
    { caseId: '3', reason: 'map_origin' },
    { caseId: '9', reason: 'not_found' },
    { caseId: '2', reason: 'already_present', gameBuildId: '20' },
  ])
  assert.deepEqual(fake.added.map((one) => one.gameBuildId), ['10', '20'])
  assert.equal(fake.invalidated, 1)
})

test('addCasesToBuild fails without a run build', async () => {
  const fake = fakeDependencies({ draft: ORDERED })
  await assert.rejects(createScenarioAgentRunners(fake).addCasesToBuild({ caseIds: ['1'], scope: 'run_build' }), /no build version/)
})

test('convertToFree writes nothing when the open scenario changes while it waits', async () => {
  const fake = fakeDependencies({ draft: ORDERED, project: [testCase('1')] })
  const before = fake.draft
  fake.listProjectCases = async () => {
    fake.scenarioId = 2
    return [testCase('1')]
  }
  await assert.rejects(createScenarioAgentRunners(fake).convertToFree({}), { message: SCENARIO_CHANGED_REASON })
  assert.equal(fake.draft, before)
})

test('addCases writes nothing when the open scenario changes while it waits', async () => {
  const fake = fakeDependencies({ draft: buildFreeScenarioDraft('F', ['1']), project: [testCase('1'), testCase('2')] })
  const before = fake.draft
  fake.listProjectCases = async () => {
    fake.scenarioId = 2
    return [testCase('1'), testCase('2')]
  }
  await assert.rejects(createScenarioAgentRunners(fake).addCases({ caseIds: ['2'] }), { message: SCENARIO_CHANGED_REASON })
  assert.equal(fake.draft, before)
})

test('reusableRunBuild trusts a cached build only for the run it was read for', () => {
  assert.equal(reusableRunBuild(RUN_BUILD, '7', '7'), RUN_BUILD)
  assert.equal(reusableRunBuild(RUN_BUILD, '7', '8'), null)
  assert.equal(reusableRunBuild(RUN_BUILD, null, '8'), null)
  assert.equal(reusableRunBuild(RUN_BUILD, '7', null), null)
  assert.equal(reusableRunBuild(null, '7', '7'), null)
})
