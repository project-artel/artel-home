import { listedFieldDescription } from './listedOptions'
import type { ActionSpec, FieldSpec } from '../registry/types'

/* 성능 페이지의 field 와 action 정의. binding 은 `PerformanceSection.tsx` 와 `BuildPerformancePage.tsx` 에 있다. */

export const PERFORMANCE_BUILD_FIELD: FieldSpec = {
  name: 'performance.build',
  page: 'performance',
  description:
    'The game build whose performance report is shown. Value is a build id; options lists every build with its label. The report lists that build\'s QA runs with hitches per minute and a link to each run\'s detail.',
}

export const PERFORMANCE_LISTED_FIELD: FieldSpec = {
  name: 'performance.listed',
  page: 'performance',
  description: listedFieldDescription(
    'the QA runs in the shown build report, newest first (label is the run id, start time and hitches per minute)',
    'Use the value as runId of performance.openRunReport. Empty on the overview page until a build report is open.',
  ),
}

export const PERFORMANCE_OPEN_RUN_REPORT_ACTION: ActionSpec = {
  id: 'performance.openRunReport',
  page: 'performance',
  risk: 'auto',
  description:
    'Open the detailed performance report of one QA run listed in the shown build report. Navigates away from the build report to that run\'s performance page. Returns {runId}. Blocked while the report loads or when the build has no reported runs. To report on another build, set performance.build first.',
  args: {
    type: 'object',
    properties: {
      runId: { type: 'string', description: 'QA run id, from the options of performance.listed.' },
    },
    required: ['runId'],
  },
  summarize: (args) => `Open the performance report of QA run ${typeof args.runId === 'string' ? args.runId : ''}`,
}

export const PERFORMANCE_FIELDS: FieldSpec[] = [PERFORMANCE_BUILD_FIELD, PERFORMANCE_LISTED_FIELD]
export const PERFORMANCE_ACTIONS: ActionSpec[] = [PERFORMANCE_OPEN_RUN_REPORT_ACTION]
