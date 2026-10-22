import type { ActionSpec, FieldSpec } from '../registry/types'
import { listedFieldDescription } from './listedOptions'

/*
 * 시나리오 편집 화면(`/test-scenarios/:testScenarioId`)의 action 정의. binding 은
 * `testScenarios/useScenarioAgentActions.ts` 에 있다. 같은 화면의 승인 버튼과 왼쪽 시나리오 목록은
 * `testRunEdit.*` 정의를 그대로 쓴다.
 */

const CASE_IDS_ARGUMENT = {
  type: 'array',
  description: 'Test case ids (TC numbers) as strings, for example ["12", "40"].',
  items: { type: 'string' },
} as const

const DROP_MISSING_ARGUMENT = {
  type: 'boolean',
  description:
    'Only when the scenario was opened from a test run with a build version. true leaves out the cases that are not in that build instead of failing; set it only after the user chose to leave them out.',
} as const

const BUILD_CHECK_NOTE =
  'When the scenario was opened from a test run with a build version, every case must be in that build; if some are not and dropMissing is not true, nothing changes and the call fails with a JSON error {code: "cases_missing_from_build", gameBuildId, buildVersion, missing: [{caseId, origin, addable}], hint}. Then ask the user (ask_choice) whether to add the addable ones to this build, to this build and later builds (testScenario.addCasesToBuild), or to leave them out (call again with dropMissing: true).'

function caseCount(args: Record<string, unknown>): string {
  const count = Array.isArray(args.caseIds) ? args.caseIds.length : 0
  return `${count} test case${count === 1 ? '' : 's'}`
}

export const TEST_SCENARIO_TITLE_FIELD: FieldSpec = {
  name: 'testScenario.title',
  page: 'testScenario',
  description: 'The title of the open scenario (the text box at the top of the editor). Saved automatically like a typed edit.',
}

export const TEST_SCENARIO_CASES_FIELD: FieldSpec = {
  name: 'testScenario.cases',
  page: 'testScenario',
  description: listedFieldDescription(
    'the test cases the open scenario holds, in scenario order (label is "TC #id", with the first step text of that case in an ORDERED scenario)',
    'Use the values as caseIds of testScenario.removeCases. Ids of other test cases of the project are in testCases.listed on the case library page.',
  ),
}

export const TEST_SCENARIO_CONVERT_TO_FREE_ACTION: ActionSpec = {
  id: 'testScenario.convertToFree',
  page: 'testScenario',
  risk: 'approve',
  description:
    'Convert the open ORDERED scenario to a FREE scenario (a bundle of test cases the QA agent verifies in its own order). Each linked test case is kept once, in first-seen order; steps without a test case are dropped. The change is saved automatically and can be undone. ' +
    BUILD_CHECK_NOTE +
    ' Returns {keptCaseIds, droppedSteps: [{index, action}], droppedMissing}. Blocked when the scenario is already FREE.',
  args: { type: 'object', properties: { dropMissing: DROP_MISSING_ARGUMENT } },
  summarize: (args) => (args.dropMissing === true ? 'Convert this scenario to FREE without the cases missing from the build' : 'Convert this scenario to FREE'),
}

export const TEST_SCENARIO_ADD_CASES_ACTION: ActionSpec = {
  id: 'testScenario.addCases',
  page: 'testScenario',
  risk: 'auto',
  description:
    'Add test cases to the open FREE scenario, at the end. Cases already in the scenario are ignored. Fails, naming them, when an id is not a test case of the project. ' +
    BUILD_CHECK_NOTE +
    ' Returns {added, alreadyInScenario, droppedMissing}. Blocked when the scenario is not FREE.',
  args: {
    type: 'object',
    properties: { caseIds: CASE_IDS_ARGUMENT, dropMissing: DROP_MISSING_ARGUMENT },
    required: ['caseIds'],
  },
  summarize: (args) => `Add ${caseCount(args)} to this scenario`,
}

export const TEST_SCENARIO_REMOVE_CASES_ACTION: ActionSpec = {
  id: 'testScenario.removeCases',
  page: 'testScenario',
  risk: 'auto',
  description:
    'Remove test cases from the open FREE scenario (the ✕ on each row), by ids from testScenario.cases. The cases themselves stay in the project. Returns {removed, notInScenario}. Blocked when the scenario is not FREE.',
  args: { type: 'object', properties: { caseIds: CASE_IDS_ARGUMENT }, required: ['caseIds'] },
  summarize: (args) => `Remove ${caseCount(args)} from this scenario`,
}

export const TEST_SCENARIO_ADD_CASES_TO_BUILD_ACTION: ActionSpec = {
  id: 'testScenario.addCasesToBuild',
  page: 'testScenario',
  risk: 'approve',
  description:
    'Put existing test cases into the build version of the test run the scenario was opened from, so a run on that build can use them. scope run_build adds them to that build only; run_build_and_later also adds them to every newer build. Only user-made (MANUAL) cases can be added. Returns {builds: [{gameBuildId, version, added}], skipped: [{caseId, reason: "map_origin" | "already_present" | "not_found", gameBuildId?}]}. It does not change the scenario; call testScenario.convertToFree or testScenario.addCases again afterwards. Blocked when the scenario was not opened from a test run with a build version.',
  args: {
    type: 'object',
    properties: {
      caseIds: CASE_IDS_ARGUMENT,
      scope: {
        type: 'string',
        enum: ['run_build', 'run_build_and_later'],
        description: 'run_build: only the build of the test run. run_build_and_later: that build and every newer build.',
      },
    },
    required: ['caseIds', 'scope'],
  },
  summarize: (args) =>
    `Add ${caseCount(args)} to ${args.scope === 'run_build_and_later' ? 'this build version and every later one' : 'this build version'}`,
}

export const TEST_SCENARIO_FIELDS: FieldSpec[] = [TEST_SCENARIO_TITLE_FIELD, TEST_SCENARIO_CASES_FIELD]
export const TEST_SCENARIO_ACTIONS: ActionSpec[] = [
  TEST_SCENARIO_CONVERT_TO_FREE_ACTION,
  TEST_SCENARIO_ADD_CASES_ACTION,
  TEST_SCENARIO_REMOVE_CASES_ACTION,
  TEST_SCENARIO_ADD_CASES_TO_BUILD_ACTION,
]
