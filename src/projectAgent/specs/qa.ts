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

/** LaunchPanel 의 `start` 가 끝난 모습. 호출한 쪽이 화면 말고 값으로도 결과를 알 수 있게 한다. */
export type StartOutcome =
  | { kind: 'started'; qaRunId: string }
  | { kind: 'takeoverNeeded' }
  | { kind: 'failed'; message: string }

export type QaStartDependencies = {
  /** LaunchPanel 의 `start`. 시작하지 않았으면 null. */
  start: (force?: boolean) => Promise<StartOutcome | null>
  blockedReason: () => string | null
  blockedHint: string
}

/**
 * `qa.startRun` 의 run. agent 가 무엇을 보내든 `start()` 를 기본값으로만 부른다. `force` 는 다른 QA
 * 실행을 취소하고 넘겨받는 것이라 사용자가 화면의 대화상자에서만 정한다.
 */
export function createQaStartRunner(dependencies: QaStartDependencies): () => Promise<{ qaRunId: string }> {
  return async () => {
    const outcome = await dependencies.start()
    if (outcome === null) throw new Error(dependencies.blockedReason() ?? dependencies.blockedHint)
    if (outcome.kind === 'takeoverNeeded') throw new Error(tasksCopy().errors.qaRunActive)
    if (outcome.kind === 'failed') throw new Error(outcome.message)
    return { qaRunId: outcome.qaRunId }
  }
}
