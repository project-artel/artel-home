import { apiFetch, orchestrationUrlFor } from '../auth/authApi'
import {
  asRecord,
  asString,
  jsonRequest,
  readJson,
  toApiError,
} from '../projects/projectApi'
import { parseSteps } from '../testScenarios/scenarioApi'
import type { ChatMessage, ScenarioRole, ScenarioStep } from '../testScenarios/scenarioTypes'

/*
 * Run-scoped authoring chat (ARTEL-206 Step 6). The conversation belongs to a
 * TestRun, not a single scenario: one chat can add and edit several scenarios in
 * the run, and it stays continuous as the user moves between the run's scenarios.
 *
 * Mirrors `scenarioApi.ts`: every call goes through `apiFetch` (cookie auth, 401
 * owned in one place); the SSE stream is the exception and carries the cookie via
 * `EventSource`'s `withCredentials`.
 */

function chatPath(projectId: string, runId: string, suffix: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/chat${suffix}`
}

/**
 * One scenario the agent proposes for the run (재설계 2026-08-08). `scenarioId`
 * null = a brand-new scenario to add; a number = an edit of that existing
 * scenario. `steps` is the scenario body — ordered actions, each with an optional
 * `case_id` mapping it to the TestCase it verifies. Sent back unchanged on commit.
 */
export type ScenarioProposal = {
  scenarioId: number | null
  title: string
  description: string
  steps: ScenarioStep[]
}

export type RunChatResult = {
  type: 'result'
  message: string
  scenarios: ScenarioProposal[]
  /** The answer split for the screen (ARTEL-929). `null` on a plain reply — a greeting, a failure. */
  reply: ChatReply | null
  /** Names for the markers in `reply` (ARTEL-933). */
  refs: ChatRef[]
}

/**
 * An agent answer split into what was done and why (ARTEL-929).
 *
 * `result` is what the agent's code counted — what was saved, under which title, how
 * many steps — and goes in a box. `detail` is the model's explanation in the same
 * Markdown slice the thread already reads, plus tables. The third part, questions,
 * travels separately and opens the question modal.
 */
export type ChatReply = {
  result: string
  detail: string
  /** What this turn changed (ARTEL-938), drawn as a coloured list under `result`. */
  changes: ScenarioChange[]
}

/**
 * One scenario this turn created, updated or removed. `scenarioId` is null for a
 * removed one — it no longer exists, so there is nothing to open.
 */
export type ScenarioChange = {
  action: 'created' | 'updated' | 'removed'
  title: string
  scenarioId: number | null
}

const CHANGE_ACTIONS = ['created', 'updated', 'removed'] as const

function parseChanges(value: unknown): ScenarioChange[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const record = asRecord(entry)
    if (record === null) return []
    const action = CHANGE_ACTIONS.find((one) => one === record.action)
    const title = asString(record.title)
    if (action === undefined || title.length === 0) return []
    const raw = record.scenario_id ?? record.scenarioId
    const id = raw == null ? Number.NaN : Number(raw)
    return [{ action, title, scenarioId: Number.isFinite(id) ? id : null }]
  })
}

/**
 * What a `[[tc:N]]` / `[[ts:N]]` marker in an answer points at (ARTEL-933). The chip shows
 * `label`; a TC chip opens `detail` (precondition and expected result), since a TC has no
 * page of its own. A TS chip opens the scenario.
 */
export type ChatRef = {
  kind: 'tc' | 'ts'
  id: number
  label: string
  detail: string | null
}

/** Reads a payload's or frame's `refs`. Entries without a kind, a numeric id or a label are dropped. */
export function parseRefs(value: unknown): ChatRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const record = asRecord(entry)
    if (record === null) return []
    const kind = record.kind
    const id = Number(record.id)
    const label = asString(record.label)
    if ((kind !== 'tc' && kind !== 'ts') || !Number.isFinite(id) || label.length === 0) return []
    const detail = asString(record.detail)
    return [{ kind, id, label, detail: detail.length > 0 ? detail : null }]
  })
}

/** Reads a stored `kind=reply` payload or a live frame's `reply`. Anything without a result is not one. */
export function parseReply(value: unknown): ChatReply | null {
  const record = asRecord(value)
  if (record === null) return null
  if (record.kind !== undefined && record.kind !== 'reply') return null
  const result = asString(record.result)
  if (result.length === 0) return null
  return { result, detail: asString(record.detail), changes: parseChanges(record.changes) }
}

export type RunChatFailure = {
  type: 'error'
  code: string
  detail: string
}

/**
 * Where the current authoring turn is (ARTEL-419). Only stages someone actually
 * observed are sent, so the middle ones can be absent — a turn that calls no tool
 * is normal. `repairing` is not an ending: another result follows.
 *
 * `thinking` is the agent reporting its own model turns (ARTEL-487). It alternates
 * with the tool stages, so a turn that keeps looking things up reads as a rhythm
 * rather than as one line and a long silence.
 */
export const AUTHORING_STAGES = [
  'sent',
  // 워크플로 노드 (ARTEL-952). `thinking` 은 루프 시절 값이다 — 모델 호출마다 울려서
  // "몇 바퀴 돌았나" 를 세라는 설계였다. 워크플로에는 바퀴가 없고 노드가 있다.
  'grouping',
  'grouped',
  'bridging',
  'thinking',
  'looking_up_cases',
  'reading_case',
  'finding_path',
  'writing',
  'saving',
  'modifying',
  'checking',
  'saved',
  'repairing',
  'blocked',
] as const

export type AuthoringStage = (typeof AUTHORING_STAGES)[number]

/** Stages after which nothing more arrives for this turn. */
export const TERMINAL_STAGES: readonly AuthoringStage[] = ['saved', 'blocked']

export type RunChatProgress = {
  type: 'progress'
  stage: AuthoringStage
  /**
   * 셀 수 있는 단계의 진행 (ARTEL-952). 없으면 셀 것이 없는 단계다.
   *
   * `writing` 이 묶음마다 반복되기 때문에 필요하다. 수가 없으면 같은 단계가 잇달아 온 것으로만
   * 보이고 — 화면이 그것을 되풀이 횟수로 접는다 — 몇 개 중 몇 번째인지 말할 수 없다.
   * 실측(런 87)에서 한 묶음이 29~54초였다.
   */
  done?: number
  total?: number
}

/**
 * 마지막 진행 표시 이후 이만큼 지나면 끊긴 것으로 본다 (ARTEL-952, 단위 ms).
 *
 * 한 값으로 두지 않는 이유는 노드마다 걸리는 시간이 자리수로 다르기 때문이다. 전량 저작 한 판이
 * 141초인데 90초 한 값으로 두면 정상 턴에 거짓 경고가 나오고, 반대로 라우터가 0.24초인데 같은
 * 값을 쓰면 죽은 턴을 한참 뒤에 알린다.
 *
 * 수는 실측에서 왔다 — 라우터는 ARTEL-944 의 163줄 측정, 나머지는 런 87 trace(2026-10-06):
 *
 *     묶기        25.7초 · 50.3초
 *     문장 쓰기    29.4초 · 54.2초  (묶음 하나)
 *     나눈다·메운다·검수·저장  0.2~0.5초 (코드)
 *
 * 실측의 세 배 남짓을 한도로 둔다. 느린 날을 끊긴 것으로 부르는 쪽이, 끊긴 것을 느리다고
 * 부르는 쪽보다 나쁘다 — 앞은 사용자가 멀쩡한 턴을 버리게 만들고, 뒤는 16시간을 기다리게 했다.
 */
export const STAGE_STALL_MS: Record<AuthoringStage, number> = {
  sent: 30_000,
  grouping: 180_000,
  grouped: 30_000,
  bridging: 180_000,
  thinking: 180_000,
  looking_up_cases: 60_000,
  reading_case: 60_000,
  finding_path: 60_000,
  writing: 180_000,
  saving: 60_000,
  modifying: 180_000,
  checking: 60_000,
  saved: Number.POSITIVE_INFINITY,
  repairing: 180_000,
  blocked: Number.POSITIVE_INFINITY,
}

/** An ASSISTANT line the *server* wrote (repair notice, audit refusal, remaining count). */
export type RunChatNotice = {
  type: 'notice'
  message: string
}

/**
 * One option on a question the server asked.
 *
 * The label is phrased as what the user would have typed ("담아 줘"), because that
 * is exactly what gets relayed back to the agent when it is picked — nothing has to
 * translate an option id into an instruction.
 */
export type RunChatQuestionOption = {
  id: string
  label: string
  detail: string | null
}

/**
 * A question waiting for the user (ARTEL-487).
 *
 * Authoring cannot compute everything, and until now the parts it could not settle
 * were written into prose the user read as explanation. A question is that same
 * uncertainty with somewhere to click.
 *
 * `why` carries the ground for asking — a question with a reason is answerable; a bare
 * one just asks the user to guess what the tool wants.
 */
export type RunChatQuestion = {
  id: string
  text: string
  why: string | null
  options: RunChatQuestionOption[]
  allowFreeText: boolean
}

export type RunChatQuestionEvent = {
  type: 'question'
  question: RunChatQuestion
  /**
   * Everything authoring could not settle this turn (ARTEL-630).
   *
   * The server used to send one and stay silent about the rest, so a run with five
   * blocked spots asked about one and the user read the scenarios as finished.
   * `question` is the first of these and stays for older clients; render this.
   */
  questions?: RunChatQuestion[]
  /** Names for the markers in the question text (ARTEL-933). */
  refs: ChatRef[]
}

/**
 * Scenarios changed without a turn (ARTEL-487).
 *
 * Answering "how do you get across this gap?" is filled in by the server itself — the
 * place to put it is known, so no model runs and no `result` arrives. The composition
 * still has to reload, or the warning the user just answered stays on screen.
 */
export type RunChatApplied = {
  type: 'applied'
}

export type RunChatStreamEvent =
  | RunChatResult
  | RunChatFailure
  | RunChatProgress
  | RunChatNotice
  | RunChatQuestionEvent
  | RunChatApplied

/** Absolute URL for the SSE stream (EventSource can't go through `apiFetch`). */
export function runChatStreamUrl(projectId: string, runId: string): string {
  return orchestrationUrlFor(chatPath(projectId, runId, '/stream'))
}

/** Sends a user message; the agent's result arrives on the SSE stream. */
/**
 * An answer to a question the server asked. Sent with the message, not instead of it —
 * picking an option and adding a line is the common shape, and splitting them would
 * force the screen to send twice or drop one.
 */
export type RunChatAnswer = {
  questionId: string
  optionIds: string[]
  text?: string
  /**
   * What to show in the user's own bubble — the picked labels, read back as if typed.
   * Client-only: the server rebuilds the instruction from the option ids, so sending
   * this too would relay the same sentence twice.
   */
  displayText?: string
}

export async function sendRunChatMessage(
  projectId: string,
  runId: string,
  message: string,
  autoApply: boolean,
  answer?: RunChatAnswer,
): Promise<void> {
  const response = await apiFetch(chatPath(projectId, runId, '/message'), {
    method: 'POST',
    ...jsonRequest({
      message,
      autoApply,
      answer: answer
        ? { question_id: answer.questionId, option_ids: answer.optionIds, text: answer.text ?? null }
        : null,
      // `displayText` stays here on purpose — see its doc comment.
    }),
  })
  if (!response.ok) {
    throw await toApiError(response)
  }
}

/** The run's private chat thread (revisit restore). */
export async function listRunChatMessages(
  projectId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const response = await apiFetch(chatPath(projectId, runId, '/messages'), { signal })
  const raw = await readJson(response)
  if (!Array.isArray(raw)) return []
  // Questions the user has already answered. The server writes an `answered` payload
  // when it closes one, and without this the buttons come back on every reload — the
  // in-session strip (see the hook) only knows about answers made in that session.
  // Clicking a revived button sends an answer to a question nobody is waiting on any
  // more, which is exactly how an empty turn reached the model (run 150).
  const answered = new Set(
    raw
      .map((entry) => asRecord(asRecord(entry)?.payload))
      .filter((payload) => payload?.kind === 'answered')
      .map((payload) => asString(payload?.id))
      .filter((id) => id.length > 0),
  )
  return raw.map((entry, index) => {
    const record = asRecord(entry) ?? {}
    const role = asString(record.role) === 'USER' ? 'USER' : 'ASSISTANT'
    const payload = asRecord(record.payload)
    const question = payload?.kind === 'question' ? parseQuestion(payload) : null
    // **되살릴 때도 함께 낸 것을 다 읽는다**(ARTEL-677). 스트림은 `questions` 를 읽는데 여기서는
    // 첫 것만 읽고 있었다 — 새로고침 한 번에 여섯 건이 한 건으로 줄어 있었고, 나머지 다섯은
    // 화면 어디에도 없었다.
    const rest =
      payload?.kind === 'question' && Array.isArray(payload.questions)
        ? payload.questions
            .map(parseQuestion)
            .filter((one): one is RunChatQuestion => one !== null && !answered.has(one.id))
        : []
    return {
      id: `msg-${index}`,
      role: role as ScenarioRole,
      content: asString(record.content),
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
      pending: false,
      // Restored so a reload does not leave the question on screen with nothing to
      // click — unless it has been answered, in which case it keeps its text and
      // loses its buttons, the same as it did the moment it was answered.
      question: question !== null && !answered.has(question.id) ? question : null,
      questions: rest.length > 0 ? rest : undefined,
      reply: payload?.kind === 'reply' ? parseReply(payload) : null,
      refs: parseRefs(payload?.refs),
    }
  })
}

/**
 * 도는 저작 요청 **하나만** 끊는다(ARTEL-956). 화면에서 ESC 를 두 번 누른 길이다.
 *
 * @property cancelled 끊을 요청이 **있었나**. `false` 면 화면은 아무것도 치우지 않는다 — 답이
 *   방금 도착했는데 ESC 를 누른 경우가 그 길이고, 그때 기다림을 지우면 방금 받은 답 위에
 *   "취소했습니다" 가 얹힌다.
 * @property saved 끊기 전에 **이미 저장된** 시나리오 수. 지우지 않는다 — 멈춘 것은 남은
 *   작업이고, 끝난 작업은 그대로 남는다. 카드 검토 모드에서는 저장한 것이 없어 0 이다.
 */
export type RunChatCancellation = {
  cancelled: boolean
  saved: number
}

/**
 * 도는 요청을 취소한다. **세션은 닫지 않는다** — 아래 [closeRunChat] 과 다른 창구인 것이
 * 이 기능의 전부다. 사용자가 멈추려는 것은 기다림이지 대화가 아니다.
 */
export async function cancelRunChat(
  projectId: string,
  runId: string,
): Promise<RunChatCancellation> {
  const response = await apiFetch(chatPath(projectId, runId, '/cancel'), { method: 'POST' })
  if (!response.ok) {
    throw await toApiError(response)
  }
  const raw = asRecord(await readJson(response))
  return {
    // 옛 서버는 이 창구를 모른다 — 그쪽은 위에서 이미 던졌다. 여기 기본값은 칸이 비어 온
    // 경우를 위한 것이고, 그때는 **끊지 못한 것으로 읽는다.**
    cancelled: raw?.cancelled === true,
    saved: Number(raw?.saved ?? 0) || 0,
  }
}

/** Ends the authoring session (Agent WS + SSE). Chat and scenarios are kept. */
export async function closeRunChat(projectId: string, runId: string): Promise<void> {
  const response = await apiFetch(chatPath(projectId, runId, '/close'), { method: 'POST' })
  if (!response.ok) {
    throw await toApiError(response)
  }
}

/**
 * Applies user-approved proposals to the run (card-commit mode). Uses the same
 * reconcile engine as server auto-apply: `scenarioId` null inserts, a number
 * edits. Sent with snake_case keys to match the orchestration contract.
 */
export async function commitRunScenarios(
  projectId: string,
  runId: string,
  scenarios: ScenarioProposal[],
): Promise<void> {
  const path = `/api/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/scenarios/commit`
  const response = await apiFetch(path, {
    method: 'POST',
    ...jsonRequest({
      scenarios: scenarios.map((s) => ({
        scenario_id: s.scenarioId,
        title: s.title,
        description: s.description,
        steps: s.steps,
      })),
    }),
  })
  if (!response.ok) {
    throw await toApiError(response)
  }
}

function parseProposal(value: unknown): ScenarioProposal {
  const record = asRecord(value) ?? {}
  const rawId = record.scenario_id
  const scenarioId =
    typeof rawId === 'number' ? rawId : typeof rawId === 'string' ? Number(rawId) : null
  return {
    scenarioId: scenarioId !== null && Number.isFinite(scenarioId) ? scenarioId : null,
    title: asString(record.title),
    description: asString(record.description),
    steps: parseSteps(record.steps),
  }
}

function isAuthoringStage(value: unknown): value is AuthoringStage {
  return AUTHORING_STAGES.includes(value as AuthoringStage)
}

/**
 * Parses one SSE frame. `result` carries the message + a scenarios[] proposal
 * array; `error` carries code/detail; `progress` a stage; `notice` a
 * server-written assistant line. Unknown frames (e.g. an internal
 * `test_case_search` that leaked) degrade to null and are dropped, never thrown.
 *
 * An unrecognised stage degrades to null too. A server that learns a new stage
 * should not make this client render an empty step — silence is the honest
 * fallback, and the terminal stages it does know still close the indicator.
 */
/**
 * Reads a question from a stream frame or a stored message payload — one reader for
 * both, because a question that arrives live and the same question after a reload
 * have to render identically. A question with no text is dropped rather than shown
 * as an empty prompt.
 */
export function parseQuestion(value: unknown): RunChatQuestion | null {
  const record = asRecord(value)
  if (record === null) return null
  const text = asString(record.text)
  const id = asString(record.id)
  if (text.length === 0 || id.length === 0) return null
  const rawOptions = Array.isArray(record.options) ? record.options : []
  return {
    id,
    text,
    why: typeof record.why === 'string' && record.why.length > 0 ? record.why : null,
    options: rawOptions.flatMap((entry) => {
      const option = asRecord(entry)
      if (option === null) return []
      const optionId = asString(option.id)
      const label = asString(option.label)
      if (optionId.length === 0 || label.length === 0) return []
      return [{
        id: optionId,
        label,
        detail: typeof option.detail === 'string' && option.detail.length > 0 ? option.detail : null,
      }]
    }),
    // The server spells it snake_case on the wire; both spellings are read so a
    // stored payload and a live frame do not diverge on this one field.
    allowFreeText: record.allow_free_text !== false && record.allowFreeText !== false,
  }
}

export function parseRunStreamEvent(data: string): RunChatStreamEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  const record = asRecord(parsed)
  if (record === null) return null

  if (record.type === 'result') {
    const scenarios = Array.isArray(record.scenarios)
      ? record.scenarios.map(parseProposal)
      : []
    return {
      type: 'result',
      message: asString(record.message),
      scenarios,
      reply: parseReply(record.reply),
      refs: parseRefs(record.refs),
    }
  }
  if (record.type === 'error') {
    return { type: 'error', code: asString(record.code), detail: asString(record.detail) }
  }
  if (record.type === 'progress') {
    if (!isAuthoringStage(record.stage)) return null
    // 수는 **숫자일 때만** 읽는다. 서버는 셀 것이 없으면 `null` 을 실어 보내고(그 DTO 는
    // null 을 그대로 싣는다), 옛 서버는 칸 자체가 없다. 둘 다 "셀 것이 없다" 로 같게 읽힌다.
    const count = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined
    return {
      type: 'progress',
      stage: record.stage,
      done: count(record.done),
      total: count(record.total),
    }
  }
  if (record.type === 'notice') {
    return { type: 'notice', message: asString(record.message) }
  }
  if (record.type === 'question') {
    const question = parseQuestion(record.question)
    if (question === null) return null
    // 함께 낸 것을 다 읽는다(ARTEL-630). 옛 서버는 `questions` 를 안 보내므로 첫 것만 남는다 —
    // 그때도 화면은 지금까지처럼 하나를 그린다.
    const rest = Array.isArray(record.questions)
      ? record.questions.map(parseQuestion).filter((q): q is RunChatQuestion => q !== null)
      : []
    return {
      type: 'question',
      question,
      questions: rest.length > 0 ? rest : [question],
      refs: parseRefs(record.refs),
    }
  }
  if (record.type === 'applied') {
    return { type: 'applied' }
  }
  return null
}
