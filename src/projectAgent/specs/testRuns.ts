import type { ActionSpec, FieldSpec } from '../registry/types'
import { listedFieldDescription } from './listedOptions'
import { tasksCopy } from '../tasksCopy'

/* 테스트 런 목록 페이지의 action 정의. */

export const TEST_RUNS_VERSION_FIELD: FieldSpec = {
  name: 'testRuns.version',
  page: 'testRuns',
  description:
    'Which version bucket of the left tree the run list shows (the screen lists the runs of one version at a time, so another version\'s runs are not in testRuns.listed). Value is a game build id, or "none" for the runs without a version; options lists the versions and that bucket. Setting it clears the folder.',
}

export const TEST_RUNS_SEARCH_FIELD: FieldSpec = {
  name: 'testRuns.search',
  page: 'testRuns',
  description: 'Free-text search over the run names and descriptions in the shown version (a string; empty string clears it).',
}

export const TEST_RUNS_LISTED_FIELD: FieldSpec = {
  name: 'testRuns.listed',
  page: 'testRuns',
  description: listedFieldDescription(
    'the test runs the screen lists now, in the shown version and folder after the search (label is run name · version · scenario count)',
    'Use the values as runId of testRuns.open and testRuns.openMap, and as run_id of author_scenarios. Change testRuns.version to list the runs of another version.',
  ),
}

export const TEST_RUNS_OPEN_ACTION: ActionSpec = {
  id: 'testRuns.open',
  page: 'testRuns',
  risk: 'auto',
  description:
    'Open one listed test run the way clicking its row does: the run editor, where its scenarios and chat are. Navigates away from this page. Returns {runId}. Fails when the run is not listed now; check testRuns.version and testRuns.search.',
  args: {
    type: 'object',
    properties: { runId: { type: 'string', description: 'Id of the test run, from the options of testRuns.listed.' } },
    required: ['runId'],
  },
  summarize: (args) => `Open test run ${String(args.runId ?? '')}`,
}

export const TEST_RUNS_OPEN_MAP_ACTION: ActionSpec = {
  id: 'testRuns.openMap',
  page: 'testRuns',
  risk: 'auto',
  description:
    'Open the map of one listed test run (its scenarios as nodes with ordered steps) instead of the editor. Navigates away from this page. Returns {runId}. Fails when the run is not listed now.',
  args: {
    type: 'object',
    properties: { runId: { type: 'string', description: 'Id of the test run, from the options of testRuns.listed.' } },
    required: ['runId'],
  },
  summarize: (args) => `Open the map of test run ${String(args.runId ?? '')}`,
}

export const TEST_RUNS_CREATE_ACTION: ActionSpec = {
  id: 'testRuns.create',
  page: 'testRuns',
  risk: 'auto',
  description:
    'Create an empty test run (no scenarios yet). Returns {runId}. To fill it with scenarios afterwards, call author_scenarios with that run_id. Without gameBuildId the server attaches the newest game build.',
  args: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the test run, shown in lists.' },
      gameBuildId: { type: 'string', description: 'Game build the run follows, from the options of testRuns.version. Omit for the newest build.' },
      description: { type: 'string', description: 'Optional longer description.' },
    },
    required: ['name'],
  },
  summarize: (args) => tasksCopy().summaries.createTestRun(typeof args.name === 'string' ? args.name : ''),
}

export const TEST_RUNS_FIELDS: FieldSpec[] = [TEST_RUNS_VERSION_FIELD, TEST_RUNS_SEARCH_FIELD, TEST_RUNS_LISTED_FIELD]
export const TEST_RUNS_ACTIONS: ActionSpec[] = [TEST_RUNS_CREATE_ACTION, TEST_RUNS_OPEN_ACTION, TEST_RUNS_OPEN_MAP_ACTION]
