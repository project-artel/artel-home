import type { ActionSpec, FieldSpec } from '../registry/types'

/*
 * 테스트 런 편집 화면의 action 정의. binding 은 시나리오 목록(`ScenarioList.tsx`), 런 이름
 * (`RunNameCrumb.tsx`), 시나리오 편집 화면의 승인 버튼(`TestScenarioPage.tsx`)에 나뉘어 있다. 시나리오를
 * 대화로 쓰는 일은 `author_scenarios` 가 맡으므로 여기에는 화면의 버튼만 둔다.
 */

const SCENARIO_ARGUMENT = {
  type: 'string',
  description: 'Scenario id, or a piece of its title when only one scenario of the run contains it.',
} as const

export const TEST_RUN_EDIT_SELECT_SCENARIO_ACTION: ActionSpec = {
  id: 'testRunEdit.selectScenario',
  page: 'testRunEdit',
  risk: 'auto',
  description:
    'Open one scenario of the run from the scenario list on the left, which shows its steps in the editor. Returns {id, title}. Blocked when the run has no scenarios.',
  args: { type: 'object', properties: { scenario: SCENARIO_ARGUMENT }, required: ['scenario'] },
  summarize: (args) => `Open scenario ${typeof args.scenario === 'string' ? args.scenario : ''}`,
}

export const TEST_RUN_EDIT_ADD_SCENARIO_ACTION: ActionSpec = {
  id: 'testRunEdit.addScenario',
  page: 'testRunEdit',
  risk: 'auto',
  description:
    'Add a new empty ordered scenario to the run (the "ordered" choice of the "+" button) and open it. Returns {id}. To have scenarios written for you, use author_scenarios instead. Blocked while another scenario is being created.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Add an empty scenario to the test run',
}

export const TEST_RUN_EDIT_DELETE_SCENARIO_ACTION: ActionSpec = {
  id: 'testRunEdit.deleteScenario',
  page: 'testRunEdit',
  risk: 'approve',
  description:
    'Delete one scenario of the run for good, together with its conversation; there is no restore. The user approves it. If the scenario is the one open, the page returns to the run editor. Returns {id, title}. Blocked when the run has no scenarios.',
  args: { type: 'object', properties: { scenario: SCENARIO_ARGUMENT }, required: ['scenario'] },
  summarize: (args) => `Delete scenario ${typeof args.scenario === 'string' ? args.scenario : ''}`,
}

export const TEST_RUN_EDIT_APPROVE_SCENARIO_ACTION: ActionSpec = {
  id: 'testRunEdit.approveScenario',
  page: 'testRunEdit',
  risk: 'approve',
  description:
    'Approve the scenario that is open in the editor (the "Approve" button in the header): it finalizes the scenario, and the page returns to the run editor. Returns {id}. Blocked when no scenario is open, it is still loading, or a draft of the chat is open instead of the saved scenario.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Approve the open scenario',
}

export const TEST_RUN_EDIT_RENAME_ACTION: ActionSpec = {
  id: 'testRunEdit.renameRun',
  page: 'testRunEdit',
  risk: 'auto',
  description: 'Rename the test run (the name at the top left of the editor). Returns {name}. Fails when the name is empty.',
  args: {
    type: 'object',
    properties: { name: { type: 'string', description: 'The new name of the test run.' } },
    required: ['name'],
  },
  summarize: (args) => `Rename the test run to ${typeof args.name === 'string' ? args.name : ''}`,
}

export const TEST_RUN_EDIT_FIELDS: FieldSpec[] = []
export const TEST_RUN_EDIT_ACTIONS: ActionSpec[] = [
  TEST_RUN_EDIT_SELECT_SCENARIO_ACTION,
  TEST_RUN_EDIT_ADD_SCENARIO_ACTION,
  TEST_RUN_EDIT_DELETE_SCENARIO_ACTION,
  TEST_RUN_EDIT_APPROVE_SCENARIO_ACTION,
  TEST_RUN_EDIT_RENAME_ACTION,
]
