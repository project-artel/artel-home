import { listedFieldDescription } from './listedOptions'
import type { ActionSpec, FieldSpec } from '../registry/types'

/* 테스트 런 지도 페이지의 action 정의. binding 은 `RunMapPage.tsx` 에 있다. */

export const TEST_RUN_SCENARIOS_FIELD: FieldSpec = {
  name: 'testRun.scenarios',
  page: 'testRun',
  description: listedFieldDescription(
    'the scenarios of this test run in map order (label is the scenario title)',
    'Use the value as scenario of testRun.selectScenario and testRun.openScenario.',
  ),
}

export const TEST_RUN_OPEN_EDITOR_ACTION: ActionSpec = {
  id: 'testRun.openEditor',
  page: 'testRun',
  risk: 'auto',
  description:
    'Switch from the map to the editor of this test run (the "Edit" tab), where scenarios are added, opened and approved. Navigates away from this page. Blocked while the map loads.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Open the editor of this test run',
}

export const TEST_RUN_SELECT_SCENARIO_ACTION: ActionSpec = {
  id: 'testRun.selectScenario',
  page: 'testRun',
  risk: 'auto',
  description:
    'Expand one scenario node of the map so its ordered steps show (the same as clicking the node). Returns {id, title, steps: [{action, tc}]}. Stays on this page. Blocked while the map loads or when the run has no scenarios.',
  args: {
    type: 'object',
    properties: {
      scenario: { type: 'string', description: 'Scenario id from the options of testRun.scenarios, or a piece of its title when only one scenario contains it.' },
    },
    required: ['scenario'],
  },
  summarize: (args) => `Show the steps of scenario ${typeof args.scenario === 'string' ? args.scenario : ''}`,
}

export const TEST_RUN_OPEN_SCENARIO_ACTION: ActionSpec = {
  id: 'testRun.openScenario',
  page: 'testRun',
  risk: 'auto',
  description:
    'Open one scenario in its own editor (the "open" button of a map node). Navigates away from this page. Blocked while the map loads or when the run has no scenarios.',
  args: {
    type: 'object',
    properties: {
      scenario: { type: 'string', description: 'Scenario id from the options of testRun.scenarios, or a piece of its title when only one scenario contains it.' },
    },
    required: ['scenario'],
  },
  summarize: (args) => `Open the editor of scenario ${typeof args.scenario === 'string' ? args.scenario : ''}`,
}

export const TEST_RUN_START_QA_ACTION: ActionSpec = {
  id: 'testRun.startQa',
  page: 'testRun',
  risk: 'auto',
  description:
    'Go to the Run QA page to run this test run. This only navigates; it never starts QA. The QA page does not preselect the run, so afterwards set qa.testRunId to the returned runId and then call qa.startRun, which the user approves. Returns {runId}. Blocked while the map loads or when the run has no scenarios.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Go to the Run QA page for this test run',
}

export const TEST_RUN_FIELDS: FieldSpec[] = [TEST_RUN_SCENARIOS_FIELD]
export const TEST_RUN_ACTIONS: ActionSpec[] = [
  TEST_RUN_OPEN_EDITOR_ACTION,
  TEST_RUN_SELECT_SCENARIO_ACTION,
  TEST_RUN_OPEN_SCENARIO_ACTION,
  TEST_RUN_START_QA_ACTION,
]
