import type { ActionSpec, FieldSpec } from '../registry/types'

/* QA 히스토리 페이지의 field 와 action 정의. */

export const QA_HISTORY_FILTER_FIELD: FieldSpec = {
  name: 'qaHistory.filter',
  page: 'qaHistory',
  description:
    'Which QA runs the cards show by outcome. Value is ALL, FAILED, COMPLETED or CANCELLED. The page opens on ALL.',
}

export const QA_HISTORY_RUN_FIELD: FieldSpec = {
  name: 'qaHistory.run',
  page: 'qaHistory',
  description:
    'The QA run selected in the side panel. Value is a QA run id; options lists the runs shown now (under the selected game version and the filter) with test run name, model and status. Selecting one shows its summary; qaHistory.openRun goes to its page.',
}

export const QA_HISTORY_OPEN_RUN_ACTION: ActionSpec = {
  id: 'qaHistory.openRun',
  page: 'qaHistory',
  risk: 'auto',
  description:
    'Open the page of one QA run (its timeline, live game, logs and issues), like the Timeline button of the side panel. Navigates away from this page. Pass a QA run id from the options of qaHistory.run, or from an earlier result such as qa.startRun.',
  args: {
    type: 'object',
    properties: { qaRunId: { type: 'string', description: 'Id of the QA run.' } },
    required: ['qaRunId'],
  },
  summarize: (args) => `Open QA run ${String(args.qaRunId ?? '')}`,
}

export const QA_HISTORY_FIELDS: FieldSpec[] = [QA_HISTORY_FILTER_FIELD, QA_HISTORY_RUN_FIELD]
export const QA_HISTORY_ACTIONS: ActionSpec[] = [QA_HISTORY_OPEN_RUN_ACTION]

/** 숫자 id 만 받는다. 라우트(`QaRunRoute`)가 십진수가 아닌 id 를 "없음" 으로 보기 때문이다. */
export function qaRunIdArg(args: Record<string, unknown>): string {
  const raw = typeof args.qaRunId === 'string' || typeof args.qaRunId === 'number' ? String(args.qaRunId).trim() : ''
  if (!/^\d+$/.test(raw)) throw new Error('qaRunId must be a QA run id made of digits.')
  return raw
}
