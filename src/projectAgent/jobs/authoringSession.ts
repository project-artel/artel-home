import {
  STAGE_STALL_MS,
  type AuthoringStage,
  type RunChatAnswer,
  type RunChatQuestion,
  type RunChatStreamEvent,
  type ScenarioChange,
} from '../../testRuns/runChatApi'
import type { ChoiceOption, JobState, ToolResultBody } from '../chat/toolTypes'
import type { TasksCopy } from '../tasksCopy'
import { interpretFrame } from './authoringFrames'
import type { Clock } from './watchRunner'

/*
 * `author_scenarios` 의 본체. RunChat 의 stream 과 요청 함수를 주입받아, 지시를 보내고 `result` frame
 * 까지 따라간다. 브라우저에 붙이는 쪽은 `chat/tools/authorScenarios.ts` 에 있다.
 */

export type AuthoringStream = {
  /** 연결이 열렸거나 기다릴 만큼 기다렸으면 풀린다. 지시는 이 뒤에 보낸다. 안 그러면 앞선 frame 을 놓친다. */
  opened: Promise<void>
  close: () => void
}

export type AuthoringDependencies = {
  openStream: (onFrame: (frame: RunChatStreamEvent) => void) => AuthoringStream
  /** 지시나 답을 보낸다. 답만 보낼 때 `message` 는 빈 문자열이다. */
  send: (message: string, answer?: RunChatAnswer) => Promise<void>
  /** 도는 저작 요청 하나만 끊는다. 세션은 닫지 않는다. */
  cancel: () => Promise<unknown>
  askChoice: (question: string, options: ChoiceOption[]) => Promise<string[] | null>
  upsertJob: (job: JobState) => void
  clock: Clock
  copy: () => TasksCopy
}

/** 진행 카드의 kind. `JobKind` 에는 아직 없어서 호출하는 쪽이 `JobState` 로 넘긴다. */
export const AUTHORING_JOB_KIND = 'author_scenarios'

export type AuthoringJobState = Omit<JobState, 'kind'> & { kind: typeof AUTHORING_JOB_KIND }

/** frame 이 이만큼 끊기면 멈춘 것으로 본다. 단계마다 한도가 다르고, 한도가 없는 단계는 이 값으로 대신한다. */
export const MIN_STALL_MS = 60_000

export function stallLimitMs(stage: AuthoringStage | null): number {
  if (stage === null) return MIN_STALL_MS
  const limit = STAGE_STALL_MS[stage]
  return Number.isFinite(limit) ? Math.max(limit, MIN_STALL_MS) : MIN_STALL_MS
}

export function questionOptions(question: RunChatQuestion): ChoiceOption[] {
  return question.options.map((option) => ({ id: option.id, label: option.label }))
}

export type AuthoringInput = { runId: string; instruction: string; signal: AbortSignal }

export async function driveAuthoring(
  dependencies: AuthoringDependencies,
  input: AuthoringInput,
): Promise<ToolResultBody> {
  const copy = dependencies.copy()
  const jobKey = `${AUTHORING_JOB_KIND}:${input.runId}`
  const card = (state: JobState['state'], extra: Partial<Pick<JobState, 'progress' | 'detail'>>): void => {
    const job: AuthoringJobState = {
      key: jobKey,
      kind: AUTHORING_JOB_KIND,
      id: input.runId,
      label: copy.jobs.authoringLabel(input.runId),
      state,
      href: `test-runs/${encodeURIComponent(input.runId)}/edit`,
      ...extra,
    }
    // JobKind 에 'author_scenarios' 가 들어오기 전까지의 좁힘이다.
    dependencies.upsertJob(job as unknown as JobState)
  }

  return new Promise<ToolResultBody>((resolve) => {
    let settled = false
    let asking = false
    let stage: AuthoringStage | null = null
    let lastNotice: string | null = null
    const askedQuestionIds = new Set<string>()
    let stall = new AbortController()
    let stream: AuthoringStream | null = null

    const finish = (body: ToolResultBody, state: JobState['state'], detail?: string) => {
      if (settled) return
      settled = true
      stall.abort()
      input.signal.removeEventListener('abort', onAbort)
      stream?.close()
      card(state, detail === undefined ? {} : { detail })
      resolve(body)
    }
    const fail = (message: string) => finish({ status: 'error', error: message }, 'failed', message)

    const armStall = () => {
      stall.abort()
      stall = new AbortController()
      const current = stall
      void dependencies.clock.sleep(stallLimitMs(stage), current.signal).then((elapsed) => {
        if (elapsed && !settled && !asking) {
          void dependencies.cancel().catch(() => undefined)
          fail(copy.errors.authoringStalled)
        }
      })
    }

    const cancelTurn = () => {
      void dependencies.cancel().catch(() => undefined)
      finish({ status: 'cancelled' }, 'failed', undefined)
    }
    function onAbort() {
      cancelTurn()
    }

    const answerQuestions = async (questions: RunChatQuestion[]) => {
      const fresh = questions.filter((question) => !askedQuestionIds.has(question.id))
      if (fresh.length === 0) return
      fresh.forEach((question) => askedQuestionIds.add(question.id))
      asking = true
      stall.abort()
      const answers: RunChatAnswer[] = []
      for (const question of fresh) {
        if (question.options.length === 0) {
          fail(copy.errors.authoringNoOptions)
          return
        }
        const picked = await dependencies.askChoice(question.text, questionOptions(question))
        if (settled) return
        if (picked === null) {
          cancelTurn()
          return
        }
        answers.push({ questionId: question.id, optionIds: picked })
      }
      asking = false
      armStall()
      try {
        for (const answer of answers) await dependencies.send('', answer)
      } catch {
        fail(copy.errors.sendFailed)
      }
    }

    const onFrame = (frame: RunChatStreamEvent) => {
      if (settled) return
      const outcome = interpretFrame(frame, copy)
      if (outcome.kind === 'ignore') return
      // 질문에 답하는 동안 도착한 result 는 그 질문을 던진 턴의 것이라 끝으로 보지 않는다.
      if (asking && outcome.kind !== 'question') return
      if (outcome.kind === 'question') {
        void answerQuestions(outcome.questions)
        return
      }
      armStall()
      if (outcome.kind === 'progress') {
        stage = outcome.stage
        if (outcome.stage === 'blocked') {
          fail(lastNotice ?? copy.jobs.authoringStages.blocked)
          return
        }
        card('running', { progress: outcome.text })
        return
      }
      if (outcome.kind === 'notice') {
        lastNotice = outcome.message
        return
      }
      if (outcome.kind === 'failure') {
        fail(outcome.message)
        return
      }
      const changes: ScenarioChange[] = outcome.changes
      finish({ status: 'ok', result: { summary: outcome.summary, changes } }, 'finished', outcome.summary)
    }

    if (input.signal.aborted) {
      resolve({ status: 'cancelled' })
      return
    }
    input.signal.addEventListener('abort', onAbort, { once: true })

    card('running', { progress: copy.jobs.authoringRunning })
    stream = dependencies.openStream(onFrame)
    void stream.opened.then(async () => {
      if (settled) return
      try {
        await dependencies.send(input.instruction)
        armStall()
      } catch {
        fail(copy.errors.sendFailed)
      }
    })
  })
}
