import type { ActionSpec, FieldSpec } from '../registry/types'
import { tasksCopy } from '../tasksCopy'

/* QA 실행 페이지의 field 와 action 정의. contentMap.ts 의 머리말과 같은 이유로 한 곳에 둔다. */

export const QA_GAME_INSTANCE_FIELD: FieldSpec = {
  name: 'qa.gameInstanceId',
  page: 'qa',
  description:
    'The connected game instance the QA run plays on. Value is a game instance id; options lists each instance with its name and whether it is connected. Pick a connected one.',
}

export const QA_TEST_RUN_FIELD: FieldSpec = {
  name: 'qa.testRunId',
  page: 'qa',
  description:
    'The test run (set of scenarios) to execute. Value is a test run id; options lists every test run of the project.',
}

export const QA_MODEL_FIELD: FieldSpec = {
  name: 'qa.model',
  page: 'qa',
  description:
    'The model that plays the game. Value is a model key (key source and model id); options lists the models offered, marking those without a registered API key. Changing it turns reasoning off.',
}

export const QA_REASONING_ENABLED_FIELD: FieldSpec = {
  name: 'qa.reasoningEnabled',
  page: 'qa',
  description:
    'Whether the model reasons before acting (true or false). Only models that support reasoning accept true. Costs more and runs slower.',
}

export const QA_REASONING_VALUE_FIELD: FieldSpec = {
  name: 'qa.reasoningValue',
  page: 'qa',
  description:
    'How much the model reasons, used only when qa.reasoningEnabled is true. For effort-style models it is an index into options (low to high); for token-style models it is a token budget.',
}

export const QA_START_RUN_ACTION: ActionSpec = {
  id: 'qa.startRun',
  page: 'qa',
  risk: 'approve',
  description:
    'Start a QA run with the game instance, test run, model and reasoning currently set in the fields, then open the run page. Set the fields first. Returns {qaRunId}; the run takes 10 to 40 minutes, so follow it with watch_job {kind: "qa_run", id: qaRunId}. Blocked when the form is incomplete or a check fails (game not connected, run has no scenarios, API key missing). If the game is already running another QA run the call fails and the user must decide on screen whether to take it over; never retry it yourself.',
  args: { type: 'object', properties: {} },
  summarize: () => tasksCopy().summaries.startQaRun,
}

export const QA_FIELDS: FieldSpec[] = [
  QA_GAME_INSTANCE_FIELD,
  QA_TEST_RUN_FIELD,
  QA_MODEL_FIELD,
  QA_REASONING_ENABLED_FIELD,
  QA_REASONING_VALUE_FIELD,
]
export const QA_ACTIONS: ActionSpec[] = [QA_START_RUN_ACTION]
