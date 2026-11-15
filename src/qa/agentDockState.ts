import { asRecord } from '../projects/projectApi'
import { withoutStopNote } from './peWords'
import type { QaLog } from './qaTypes'

/**
 * 실행 화면 오른쪽 에이전트 창의 상태.
 *
 * planner–executer 엔진의 `LOG`(`step_macros`, `segment_step`, `turn`, `evidence` …)와 step `STATUS` 를 차례로 읽어,
 * 지금 step 에서 무엇이 일어나는지로 줄인다: 이 step 을 맡은 계획과 그 `goals`, Executor 의 마지막 turn, `done` 여부,
 * 그리고 따로 도는 판정. 판정은 뒤에서 돌아 step N 의 판정이 step N+1 이 시작한 뒤에 올 수 있어, 늘 step 번호와 함께 둔다.
 */

export type AgentName = 'planner' | 'executor' | 'evaluator'

export type AgentPlan = {
  number: number
  /** 계획을 쓴 step. 여러 step 을 맡은 계획이면 그 첫 step 이다. */
  step: number
  summary: string | null
  actions: string[]
  facts: number
  /** 순서대로 이룰 하위 목표. 목표를 남기기 전의 런이면 비어 있다. */
  goals: { name: string; goal: string }[]
  /** `decision.segment` 의 step → 그 step 의 goal 이름. 이 step 만 맡은 계획이면 비어 있다. */
  segment: Record<number, string[]>
  /** 이 계획이 맡은 step 들. 오름차순이다. */
  covers: number[]
}

export type AgentTurn = {
  turn: number
  scene: string | null
  picked: string | null
  options: string[]
  result: string | null
  /** 고른 행동의 확률. 점수를 남기기 전의 런이나 점수를 안 주는 model 이면 없다. */
  confidence: number | null
  probabilities: Record<string, number> | null
  /** 이 turn 이 맡은 하위 목표 이름. */
  goal: string | null
  /** 게임이 바쁠 확률. 0.7 이상이면 그 turn 은 기다렸다. */
  wait: number | null
}

export type AgentVerdict = { step: number; passed: boolean; message: string; stopped: string | null }

/**
 * Planner 가 답을 받는 동안 몇 초마다 남기는 진행(`planner_progress`). 글이 아직 없으면 추론 중이고, provider 가 추론 요약을
 * 주면 `thinking` 에 그 끝부분이 실린다.
 */
export type AgentProgress = { elapsed: number; chars: number; tail: string; thinking: string }

/**
 * 판정 줄. 판정은 실행이 끝난 step 을 앞에서부터 하나씩 한다. 한 계획이 함께 맡은 묶음의 step 은 묶음이 끝난 뒤 묶음 전체의
 * 기록으로 판정하므로(`segment_judgement`), 그때까지는 `segment` 에 묶음 범위를 달고 기다린다.
 */
export type AgentJudgement =
  | { step: number; state: 'judged'; verdict: AgentVerdict }
  | { step: number; state: 'judging' | 'waiting'; segment?: { from: number; to: number } }

export type AgentStatus =
  | { kind: 'writing' | 'replanning' | 'rewriting' | 'reusing' | 'turn' | 'finished' }
  | { kind: 'handoff'; plan: number }

export type AgentDockState = {
  step: number | null
  /** 지금 행동 중인 쪽. Evaluator 는 뒤에서 따로 돌아 여기 들지 않는다. */
  active: Exclude<AgentName, 'evaluator'> | null
  status: AgentStatus | null
  plan: AgentPlan | null
  refusal: { answer: string; reason: string } | null
  turn: AgentTurn | null
  /** 이 step 의 실행이 끝났는가(`evidence`). */
  executed: boolean
  /** 이 step 에서 `done` 이 참인 turn 이 나왔는가. 참이면 입력을 멈추고 step 이 끝난다. */
  done: boolean
  /** 이 step 에서 같은 행동을 연달아 고른 횟수. 기다린 turn(`none_fits`)은 세지 않는다. */
  repeat: { picked: string; count: number } | null
  /** `segment_step` 이 알려 준 이 step 의 goal 이름. */
  stepGoals: string[]
  /** 마지막으로 온 판정. 지금 step 의 것이 아닐 수 있다. */
  verdict: AgentVerdict | null
  /** 아직 판정이 안 온 가장 앞 step. `played` 면 실행이 끝나 판정을 기다린다. */
  pending: { step: number; played: boolean } | null
  /** Planner 의 마지막 진행. 계획을 쓰는 동안만 있다. */
  progress: AgentProgress | null
  /** 판정 줄: 끝난 판정(오래된 것부터), 지금 판정 중인 step, 판정을 기다리는 step. */
  judgements: AgentJudgement[]
}

export type AgentGoal = { name: string; goal: string; step: number | null; state: 'done' | 'current' | 'next' }

/** 한 계획이 함께 맡은 step 묶음. 두 step 이상일 때만 만든다. */
export type PlanSegment = { planStep: number; steps: number[] }

const PLAN_KINDS = new Set(['step_macros', 'replan_macros', 'travel_macros'])
const REFUSED_KINDS = new Set(['step_macros_refused', 'replan_macros_refused', 'travel_macros_refused'])
const WRITING = /the planner is writing macros/
/** 창이 읽는 로그만 받는다. `PULSE` 는 전혀 안 쓴다. */
export const AGENT_LOG_TYPES = ['LOG', 'STATUS'] as const

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function score(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function stepNumber(value: unknown): number | null {
  const step = typeof value === 'string' ? Number(value) : value
  return typeof step === 'number' && Number.isInteger(step) ? step : null
}

function kindOf(log: QaLog): string | null {
  return log.type === 'LOG' ? text(asRecord(log.payload)?.kind) : null
}

function isVerdict(log: QaLog): boolean {
  const payload = asRecord(log.payload)
  return (
    log.type === 'STATUS' &&
    stepNumber(payload?.step) !== null &&
    (payload?.status === 'COMPLETED' || payload?.status === 'FAILED')
  )
}

function isWriting(log: QaLog): boolean {
  if (log.type !== 'LOG') return false
  const payload = asRecord(log.payload)
  return kindOf(log) === null && WRITING.test(text(payload?.message) ?? '')
}

function isPlan(log: QaLog): boolean {
  const kind = kindOf(log)
  return kind !== null && PLAN_KINDS.has(kind)
}

/** 창이 읽는 줄인가. `action_timing` 처럼 turn 마다 수십 줄씩 쌓이는 것을 먼저 거른다. */
export function isAgentLog(log: QaLog): boolean {
  if (log.type === 'STATUS') return isVerdict(log)
  if (log.type !== 'LOG') return false
  const kind = kindOf(log)
  if (kind === null) return isWriting(log)
  return (
    kind === 'turn' ||
    kind === 'evidence' ||
    kind === 'segment_step' ||
    kind === 'planner_progress' ||
    kind === 'segment_judgement' ||
    PLAN_KINDS.has(kind) ||
    REFUSED_KINDS.has(kind)
  )
}

/** planner–executer 런인가. 이 엔진만 남기는 줄로 가른다. 창은 이 런에서만 보인다. */
export function isAgentRun(logs: readonly QaLog[]): boolean {
  return logs.some((log) => {
    const kind = kindOf(log)
    return kind === 'turn' || kind === 'segment_step' || isPlan(log) || isWriting(log)
  })
}

function refusalOf(message: string, refusal: string | null): { answer: string; reason: string } {
  const match = /answer (\d+) of (\d+)/.exec(message)
  const reason = (refusal ?? message).replace(/^[A-Z_]+ — /, '').replace(/```/g, '')
  return { answer: match === null ? '' : `${match[1]}/${match[2]}`, reason }
}

function turnOf(payload: Record<string, unknown>): (AgentTurn & { done: boolean }) | null {
  const record = asRecord(payload.turn)
  const turn = record === null ? null : score(record.turn)
  if (record === null || turn === null) return null
  const probabilities = asRecord(record.probabilities)
  return {
    turn,
    scene: text(record.scene),
    picked: text(record.picked),
    options: strings(record.options),
    result: text(record.result),
    confidence: score(record.confidence),
    probabilities:
      probabilities === null
        ? null
        : Object.fromEntries(
            Object.entries(probabilities).flatMap(([name, value]) => {
              const number = score(value)
              return number === null ? [] : [[name, number] as const]
            }),
          ),
    goal: text(record.goal),
    wait: score(record.wait),
    done: record.done === true,
  }
}

/** `decision.segment` 를 step → goal 이름으로 읽는다. 없거나 비면 빈 객체다. */
function segmentOf(decision: Record<string, unknown> | null): Record<number, string[]> {
  const segment = asRecord(decision?.segment)
  if (segment === null) return {}
  return Object.fromEntries(
    Object.entries(segment).flatMap(([key, value]) => {
      const step = stepNumber(key)
      return step === null ? [] : [[step, strings(asRecord(value)?.goals)] as const]
    }),
  )
}

function goalsOf(decision: Record<string, unknown> | null): { name: string; goal: string }[] {
  if (!Array.isArray(decision?.goals)) return []
  return decision.goals.flatMap((item) => {
    const record = asRecord(item)
    const name = text(record?.name)
    return name === null ? [] : [{ name, goal: text(record?.goal) ?? name }]
  })
}

function sortedSteps(steps: Iterable<number>): number[] {
  return [...new Set(steps)].sort((left, right) => left - right)
}

const EMPTY: AgentDockState = {
  step: null,
  active: null,
  status: null,
  plan: null,
  refusal: null,
  turn: null,
  executed: false,
  done: false,
  repeat: null,
  stepGoals: [],
  verdict: null,
  pending: null,
  progress: null,
  judgements: [],
}

/**
 * 로그를 순서대로 읽어 마지막 상태를 만든다. `logs` 는 id 오름차순이다.
 * 끝난 런(`live` 가 false)은 마지막 내용만 두고 아무도 행동 중으로 그리지 않는다.
 */
export function deriveAgentDock(logs: readonly QaLog[], live: boolean): AgentDockState {
  let state = EMPTY
  const seen = new Set<number>()
  const played = new Set<number>()
  const judged = new Set<number>()
  const verdicts: AgentVerdict[] = []
  for (const log of logs) {
    if (!isAgentLog(log)) continue
    const payload = asRecord(log.payload) ?? {}
    const step = stepNumber(payload.step)
    if (isVerdict(log)) {
      // 판정은 뒤에서 돌아 지금 step 과 다를 수 있다. 판정 칸만 바꾸고 지금 step 의 내용은 그대로 둔다.
      const verdict = asRecord(payload.verdict)
      const playedRecord = asRecord(payload.played)
      if (step !== null) judged.add(step)
      const arrived: AgentVerdict = {
        step: step ?? 0,
        passed: payload.status === 'COMPLETED',
        message: withoutStopNote(text(payload.message) ?? text(verdict?.reason) ?? ''),
        // `done` 은 목표를 이뤄 끝난 것이라 중단이 아니다.
        stopped: playedRecord?.stopped === 'done' ? null : text(playedRecord?.stopped),
      }
      verdicts.push(arrived)
      state = { ...state, verdict: arrived }
      continue
    }
    if (step !== null) seen.add(step)
    // 새 step 이면 앞 step 의 실행 내용을 비운다. 계획은 새 step 도 맡았으면 남긴다.
    if (step !== null && step !== state.step) {
      if (state.step !== null) played.add(state.step)
      const plan = state.plan !== null && state.plan.covers.includes(step) ? state.plan : null
      state = { ...EMPTY, step, plan, verdict: state.verdict }
    }
    const kind = kindOf(log)
    if (kind === 'planner_progress') {
      const decision = asRecord(payload.decision)
      state = {
        ...state,
        active: 'planner',
        progress: {
          elapsed: score(decision?.elapsed) ?? 0,
          chars: score(decision?.chars) ?? 0,
          tail: text(decision?.tail) ?? '',
          thinking: text(decision?.thinking) ?? '',
        },
      }
      continue
    }
    if (kind === null) {
      const replan = /\(replan\)/.test(text(payload.message) ?? '')
      const again = /again/.test(text(payload.message) ?? '')
      state = {
        ...state,
        active: 'planner',
        status: { kind: again ? 'rewriting' : replan ? 'replanning' : 'writing' },
        progress: null,
        refusal: again ? state.refusal : null,
        turn: null,
        executed: false,
        done: false,
        repeat: null,
      }
    } else if (REFUSED_KINDS.has(kind)) {
      const decision = asRecord(payload.decision)
      state = {
        ...state,
        active: 'planner',
        status: { kind: 'rewriting' },
        refusal: refusalOf(text(payload.message) ?? '', text(decision?.refusal)),
        progress: null,
      }
    } else if (PLAN_KINDS.has(kind)) {
      const decision = asRecord(payload.decision)
      const number = (state.plan?.number ?? 0) + 1
      const segment = segmentOf(decision)
      const planStep = step ?? state.step ?? 0
      state = {
        ...state,
        active: 'planner',
        status: { kind: 'handoff', plan: number },
        refusal: null,
        turn: null,
        executed: false,
        progress: null,
        plan: {
          number,
          step: planStep,
          summary: text(decision?.summary) ?? text(payload.message),
          actions: strings(decision?.actions),
          facts: strings(decision?.facts).length,
          goals: goalsOf(decision),
          segment,
          covers: sortedSteps([planStep, ...Object.keys(segment).map(Number)]),
        },
      }
    } else if (kind === 'segment_step') {
      // 앞 step 에서 쓴 계획으로 이 step 을 돈다. Planner 는 새로 부르지 않는다.
      const plan = state.plan
      state = {
        ...state,
        active: 'planner',
        status: { kind: 'reusing' },
        stepGoals: strings(asRecord(payload.decision)?.goals),
        plan: plan === null || step === null ? plan : { ...plan, covers: sortedSteps([...plan.covers, step]) },
      }
    } else if (kind === 'turn') {
      const turn = turnOf(payload)
      if (turn === null) continue
      const { done, ...shown } = turn
      // `done` 만 담은 마지막 turn 은 행동이 없다. 앞 turn 을 그대로 보이고 끝났다는 것만 적는다.
      if (shown.picked === null && done) {
        state = { ...state, done: true }
        continue
      }
      const repeat =
        shown.picked === null || shown.picked === 'none_fits'
          ? state.repeat
          : state.repeat?.picked === shown.picked
            ? { picked: shown.picked, count: state.repeat.count + 1 }
            : { picked: shown.picked, count: 1 }
      state = {
        ...state,
        active: 'executor',
        status: { kind: 'turn' },
        refusal: null,
        progress: null,
        turn: shown,
        executed: false,
        done: state.done || done,
        repeat,
      }
    } else if (kind === 'evidence') {
      if (step !== null) played.add(step)
      state = { ...state, active: 'executor', status: { kind: 'finished' }, executed: true }
    }
  }
  const waiting = live ? sortedSteps(seen).find((step) => !judged.has(step)) : undefined
  const pending =
    waiting === undefined ? null : { step: waiting, played: played.has(waiting) || [...seen].some((step) => step > waiting) }
  // 실행이 끝났는데 판정이 안 온 step. 판정은 앞 step 부터 하나씩이라 맨 앞이 판정 중이고 나머지는 기다린다.
  const unjudged = live
    ? sortedSteps(seen).filter((step) => !judged.has(step) && (played.has(step) || [...seen].some((later) => later > step)))
    : []
  // 묶음의 step 은 에이전트가 아직 그 묶음 안에 있고 묶음 판정이 시작되지 않았으면 묶음이 끝나기를 기다린다.
  const startedTogether = new Set<number>()
  for (const log of logs) {
    if (kindOf(log) !== 'segment_judgement') continue
    const steps = asRecord(asRecord(log.payload)?.decision)?.steps
    if (Array.isArray(steps)) for (const value of steps) if (typeof value === 'number') startedTogether.add(value)
  }
  const segments = unjudged.length > 0 ? deriveStepSegments(logs) : []
  const openSegment = (step: number) =>
    startedTogether.has(step) || state.step === null
      ? undefined
      : segments.find((segment) => segment.steps.includes(step) && segment.steps.includes(state.step as number))
  const judgements: AgentJudgement[] = [
    ...verdicts.map((verdict) => ({ step: verdict.step, state: 'judged' as const, verdict })),
    ...unjudged.map((step, at) => {
      const segment = openSegment(step)
      if (segment !== undefined) {
        return { step, state: 'waiting' as const, segment: { from: segment.steps[0], to: segment.steps[segment.steps.length - 1] } }
      }
      return { step, state: at === 0 ? ('judging' as const) : ('waiting' as const) }
    }),
  ]
  // 앞 step 이 묶음을 기다리면 뒤 step 도 판정 중일 수 없다.
  const firstWaiting = judgements.findIndex((item) => item.state === 'waiting')
  for (let at = firstWaiting + 1; firstWaiting >= 0 && at < judgements.length; at += 1) {
    const item = judgements[at]
    if (item.state === 'judging') judgements[at] = { step: item.step, state: 'waiting' }
  }
  return live
    ? { ...state, pending, judgements }
    : { ...state, active: null, status: null, pending: null, progress: null, judgements }
}

/**
 * 계획이 여러 step 을 함께 맡은 묶음. 계획의 `decision.segment` 와 `segment_step` 줄로 만든다.
 * 뒤 step 에서 계획을 새로 쓰면 앞 계획의 묶음은 그 step 앞에서 끊는다.
 */
export function deriveStepSegments(logs: readonly QaLog[]): PlanSegment[] {
  let segments: PlanSegment[] = []
  for (const log of logs) {
    const payload = asRecord(log.payload)
    const step = stepNumber(payload?.step)
    if (step === null) continue
    if (isPlan(log)) {
      // 같은 step 에서 다시 쓴 계획은 앞 계획을 대신해 앞 묶음이 비고 빠진다.
      segments = segments
        .map((segment) => ({ ...segment, steps: segment.steps.filter((covered) => covered < step) }))
        .filter((segment) => segment.steps.length > 0)
      const keys = Object.keys(segmentOf(asRecord(payload?.decision))).map(Number)
      segments.push({ planStep: step, steps: sortedSteps([step, ...keys]) })
    } else if (kindOf(log) === 'segment_step') {
      const last = segments.at(-1)
      if (last !== undefined && step > last.planStep) last.steps = sortedSteps([...last.steps, step])
    }
  }
  return segments.filter((segment) => segment.steps.length > 1)
}

/**
 * Planner 칸의 goal 줄: 계획의 goal 을 순서대로 두고, 지금 turn 이 맡은 것을 `current`, 그 앞을 `done` 으로 둔다.
 * turn 이 아직 없으면 이 step 의 첫 goal 이 `current` 다. step 이 `done` 이면 이 step 의 goal 까지 다 `done` 이다.
 */
export function agentGoals(dock: AgentDockState): AgentGoal[] {
  const plan = dock.plan
  if (plan === null || plan.goals.length === 0) return []
  const stepOf = new Map<string, number>()
  for (const [step, names] of Object.entries(plan.segment)) for (const name of names) stepOf.set(name, Number(step))
  const index = (name: string | null | undefined) => (name == null ? -1 : plan.goals.findIndex((goal) => goal.name === name))
  const own = dock.step === null ? [] : (plan.segment[dock.step] ?? dock.stepGoals)
  let current = index(dock.turn?.goal)
  if (current < 0) current = index(own[0])
  // 끝난 step 은 지금 goal 이 없다. 그 step 의 goal 까지 이뤘고 뒤 goal 은 다음 step 의 것이다.
  const finished = dock.done && current >= 0 ? Math.max(current, ...own.map(index)) : null
  return plan.goals.map((goal, at) => ({
    ...goal,
    step: stepOf.get(goal.name) ?? null,
    state:
      finished !== null
        ? at <= finished ? 'done' : 'next'
        : current < 0 ? 'next' : at < current ? 'done' : at === current ? 'current' : 'next',
  }))
}

/**
 * 지금 step 을 맡은 계획까지 거슬러 받았는가. 지금 step 에서 쓴 계획이 있거나, 앞 step 에서 쓴 계획과 그 뒤 step 마다의
 * `segment_step` 이 다 있어야 한다. 그리고 그 계획 앞 step 의 줄도 하나 있어야 계획 번호를 셀 수 있다.
 */
export function agentHistoryComplete(logs: readonly QaLog[]): boolean {
  const agentLogs = logs.filter(isAgentLog)
  const steps = agentLogs.map((log) => stepNumber(asRecord(log.payload)?.step)).filter((step) => step !== null)
  if (steps.length === 0) return false
  const latest = Math.max(...steps)
  const reused = new Set(
    agentLogs.filter((log) => kindOf(log) === 'segment_step').map((log) => stepNumber(asRecord(log.payload)?.step)),
  )
  const planSteps = agentLogs.filter(isPlan).map((log) => stepNumber(asRecord(log.payload)?.step)).filter((step) => step !== null)
  const planStep = planSteps
    .filter((step) => step <= latest)
    .sort((left, right) => right - left)
    .find((step) => {
      for (let between = step + 1; between <= latest; between += 1) if (!reused.has(between)) return false
      return true
    })
  return planStep !== undefined && steps.some((step) => step < planStep)
}

/** Executor 칸의 선택지 줄: 점수가 있으면 큰 순서로, 없으면 받은 차례대로. */
export function agentOptions(turn: AgentTurn): { name: string; probability: number | null; picked: boolean }[] {
  const scored = turn.probabilities
  if (scored !== null && Object.keys(scored).length > 0) {
    return Object.entries(scored)
      .sort((left, right) => right[1] - left[1])
      .map(([name, probability]) => ({ name, probability, picked: name === turn.picked }))
  }
  return turn.options.map((name) => ({ name, probability: null, picked: name === turn.picked }))
}
