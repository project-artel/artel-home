import type { ActionSpec } from '../registry/types'
import { tasksCopy } from '../tasksCopy'

/* 테스트 런 목록 페이지의 action 정의. */

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
      gameBuildId: { type: 'string', description: 'Game build the run follows. Omit for the newest build.' },
      description: { type: 'string', description: 'Optional longer description.' },
    },
    required: ['name'],
  },
  summarize: (args) => tasksCopy().summaries.createTestRun(typeof args.name === 'string' ? args.name : ''),
}

export const TEST_RUNS_ACTIONS: ActionSpec[] = [TEST_RUNS_CREATE_ACTION]
