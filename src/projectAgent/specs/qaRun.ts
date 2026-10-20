import type { ActionSpec, FieldSpec } from '../registry/types'

/* QA 실행 페이지(콘솔)의 field 와 action 정의. */

export const QA_RUN_LOG_VIEWS = ['flow', 'raw', 'issues'] as const
export type QaRunLogView = (typeof QA_RUN_LOG_VIEWS)[number]

export const QA_RUN_SCENARIO_FIELD: FieldSpec = {
  name: 'qaRun.scenario',
  page: 'qaRun',
  description:
    'The scenario (try) whose steps, game view, chat and logs the console shows. Value is a try id; options lists every scenario of the run in order with its title. Writing it pins that scenario and stops following the active one, same as qaRun.selectScenario.',
}

export const QA_RUN_SELECT_SCENARIO_ACTION: ActionSpec = {
  id: 'qaRun.selectScenario',
  page: 'qaRun',
  risk: 'auto',
  description:
    'Show one scenario of this QA run in the console, like clicking it in the left list. This pins it: the console stops following the active scenario until the user presses Follow. Get try ids from the options of qaRun.scenario.',
  args: {
    type: 'object',
    properties: { tryId: { type: 'string', description: 'Try id of the scenario, from the options of qaRun.scenario.' } },
    required: ['tryId'],
  },
  summarize: (args) => `Show scenario ${String(args.tryId ?? '')} of the QA run`,
}

export const QA_RUN_CANCEL_ACTION: ActionSpec = {
  id: 'qaRun.cancel',
  page: 'qaRun',
  risk: 'approve',
  description:
    'Cancel this whole QA run: the scenario being played stops and the remaining ones do not start. It cannot be undone, and the game is freed for another run. Blocked when the run already finished. Returns {cancelled: true} once the server accepted it; the status then updates on the page.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Cancel the running QA run',
}

export const QA_RUN_OPEN_PERFORMANCE_ACTION: ActionSpec = {
  id: 'qaRun.openPerformance',
  page: 'qaRun',
  risk: 'auto',
  description:
    'Open the performance report of this QA run (frame time, memory and similar measurements), like the performance button in the page header. Navigates away from the console.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Open the performance report of the QA run',
}

export const QA_RUN_SWITCH_LOG_VIEW_ACTION: ActionSpec = {
  id: 'qaRun.switchLogView',
  page: 'qaRun',
  risk: 'auto',
  description:
    'Switch the log column of the shown scenario: "flow" (agent tool calls, results, status, errors and chat), "raw" (every log line) or "issues" (defects this scenario filed). Blocked until the scenario has loaded.',
  args: {
    type: 'object',
    properties: { view: { type: 'string', enum: [...QA_RUN_LOG_VIEWS], description: 'Which log view to show.' } },
    required: ['view'],
  },
  summarize: (args) => `Show the ${String(args.view ?? '')} log view`,
}

export const QA_RUN_FIELDS: FieldSpec[] = [QA_RUN_SCENARIO_FIELD]
export const QA_RUN_ACTIONS: ActionSpec[] = [
  QA_RUN_SELECT_SCENARIO_ACTION,
  QA_RUN_CANCEL_ACTION,
  QA_RUN_OPEN_PERFORMANCE_ACTION,
  QA_RUN_SWITCH_LOG_VIEW_ACTION,
]

/** `tryIds` 가운데 하나면 그 id 를, 아니면 던진다. */
export function requireTryId(args: Record<string, unknown>, tryIds: readonly string[]): string {
  const tryId = typeof args.tryId === 'string' || typeof args.tryId === 'number' ? String(args.tryId) : ''
  if (!tryIds.includes(tryId)) {
    throw new Error(`This QA run has no scenario with try id "${tryId}". Pick one from the options of qaRun.scenario.`)
  }
  return tryId
}

export function requireLogView(args: Record<string, unknown>): QaRunLogView {
  const view = args.view
  if (QA_RUN_LOG_VIEWS.includes(view as QaRunLogView)) return view as QaRunLogView
  throw new Error(`view must be one of ${QA_RUN_LOG_VIEWS.join(', ')}.`)
}

/** 취소 버튼의 `onCancel` 이 끝난 모습. 실패하면 던져 agent 가 듣는다(버튼은 화면에 문구를 낸다). */
export function createCancelRunner(cancel: () => Promise<boolean>, failureMessage: () => string) {
  return async (): Promise<{ cancelled: true }> => {
    if (!(await cancel())) throw new Error(failureMessage())
    return { cancelled: true }
  }
}
