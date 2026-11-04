import { asRecord } from '../projects/projectApi'
import { withoutStopNote } from './peWords'
import type { QaLog } from './qaTypes'

/**
 * 실행 화면 하단 에이전트 창의 상태.
 *
 * planner–executer 엔진의 `LOG`(`step_macros`, `turn`, `evidence` …)와 step `STATUS` 를 차례로 읽어, 지금 어느
 * 에이전트가 행동 중이고 무엇을 넘기는지로 줄인다. 지난 turn 은 남기지 않는다.
 */

export type AgentName = 'planner' | 'executor' | 'evaluator'

export type AgentPlan = {
  number: number
  summary: string | null
  actions: string[]
  facts: number
}

export type AgentTurn = {
  turn: number
  scene: string | null
  picked: string | null
  options: string[]
  result: string | null
  /** Jev 가 준 점수. 점수를 남기기 전의 런이나 점수를 안 주는 model 이면 없다. */
  confidence: number | null
  probabilities: Record<string, number> | null
}

export type AgentVerdict = { step: number; passed: boolean; message: string; stopped: string | null }

export type AgentEdge =
  | { kind: 'plan'; plan: number; actions: number }
  | { kind: 'replan'; reads: number | null }
  | { kind: 'evaluate'; reads: number | null }

export type AgentStatus =
  | { kind: 'writing' | 'replanning' | 'rewriting' | 'judging' | 'judged' | 'turn' }
  | { kind: 'handoff'; plan: number }

export type AgentDockState = {
  step: number | null
  active: AgentName | null
  status: AgentStatus | null
  /** 지금 넘어가는 것. 선 위에 그린다. */
  edge: AgentEdge | null
  plan: AgentPlan | null
  refusal: { answer: string; reason: string } | null
  turn: AgentTurn | null
  /** 이 step 의 실행이 끝났는가. Executor 칸의 빈 글을 가른다. */
  executed: boolean
  verdict: AgentVerdict | null
}

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

/** 창이 읽는 줄인가. `action_timing` 처럼 turn 마다 수십 줄씩 쌓이는 것을 먼저 거른다. */
export function isAgentLog(log: QaLog): boolean {
  if (log.type === 'STATUS') return isVerdict(log)
  if (log.type !== 'LOG') return false
  const kind = kindOf(log)
  if (kind === null) return isWriting(log)
  return kind === 'turn' || kind === 'evidence' || PLAN_KINDS.has(kind) || REFUSED_KINDS.has(kind)
}

/** planner–executer 런인가. 이 엔진만 남기는 줄로 가른다. 창은 이 런에서만 보인다. */
export function isAgentRun(logs: readonly QaLog[]): boolean {
  return logs.some((log) => {
    const kind = kindOf(log)
    return kind === 'turn' || (kind !== null && PLAN_KINDS.has(kind)) || isWriting(log)
  })
}

function refusalOf(message: string, refusal: string | null): { answer: string; reason: string } {
  const match = /answer (\d+) of (\d+)/.exec(message)
  const reason = (refusal ?? message).replace(/^[A-Z_]+ — /, '').replace(/```/g, '')
  return { answer: match === null ? '' : `${match[1]}/${match[2]}`, reason }
}

function turnOf(payload: Record<string, unknown>): AgentTurn | null {
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
  }
}

const EMPTY: AgentDockState = {
  step: null,
  active: null,
  status: null,
  edge: null,
  plan: null,
  refusal: null,
  turn: null,
  executed: false,
  verdict: null,
}

/**
 * 로그를 순서대로 읽어 마지막 상태를 만든다. `logs` 는 id 오름차순이다.
 * 끝난 런(`live` 가 false)은 마지막 내용만 두고 아무도 행동 중으로 그리지 않는다.
 */
export function deriveAgentDock(logs: readonly QaLog[], live: boolean): AgentDockState {
  let state = EMPTY
  let reads: number | null = null
  for (const log of logs) {
    if (!isAgentLog(log)) continue
    const payload = asRecord(log.payload) ?? {}
    const step = stepNumber(payload.step)
    // 새 step 이면 앞 step 의 계획은 끝난 것이다. 판정은 다음 판정까지 남긴다.
    if (step !== null && !isVerdict(log) && step !== state.step) {
      state = { ...EMPTY, step, verdict: state.verdict }
      reads = null
    }
    if (isVerdict(log)) {
      const verdict = asRecord(payload.verdict)
      const played = asRecord(payload.played)
      state = {
        ...state,
        step: step ?? state.step,
        active: 'evaluator',
        status: { kind: 'judged' },
        edge: null,
        turn: null,
        executed: true,
        verdict: {
          step: step ?? 0,
          passed: payload.status === 'COMPLETED',
          message: withoutStopNote(text(payload.message) ?? text(verdict?.reason) ?? ''),
          // `done` 은 목표를 이뤄 끝난 것이라 중단이 아니다.
          stopped: played?.stopped === 'done' ? null : text(played?.stopped),
        },
      }
      continue
    }
    const kind = kindOf(log)
    if (kind === null) {
      // 재계획이면 Executor 가 넘긴 evidence 를 선 위에 그린다.
      const replan = /\(replan\)/.test(text(payload.message) ?? '')
      const again = /again/.test(text(payload.message) ?? '')
      state = {
        ...state,
        active: 'planner',
        status: { kind: again ? 'rewriting' : replan ? 'replanning' : 'writing' },
        edge: replan && !again ? { kind: 'replan', reads } : null,
        refusal: again ? state.refusal : null,
        turn: null,
        executed: false,
      }
    } else if (REFUSED_KINDS.has(kind)) {
      const decision = asRecord(payload.decision)
      state = {
        ...state,
        active: 'planner',
        status: { kind: 'rewriting' },
        edge: null,
        refusal: refusalOf(text(payload.message) ?? '', text(decision?.refusal)),
      }
    } else if (PLAN_KINDS.has(kind)) {
      const decision = asRecord(payload.decision)
      const number = (state.plan?.number ?? 0) + 1
      const actions = strings(decision?.actions)
      state = {
        ...state,
        active: 'planner',
        status: { kind: 'handoff', plan: number },
        edge: { kind: 'plan', plan: number, actions: actions.length },
        refusal: null,
        turn: null,
        executed: false,
        plan: {
          number,
          summary: text(decision?.summary) ?? text(payload.message),
          actions,
          facts: strings(decision?.facts).length,
        },
      }
    } else if (kind === 'turn') {
      const turn = turnOf(payload)
      if (turn === null) continue
      state = { ...state, active: 'executor', status: { kind: 'turn' }, edge: null, refusal: null, turn, executed: false }
    } else if (kind === 'evidence') {
      // 뒤이어 재계획 줄이 오면 Planner 로, 안 오면 Evaluator 가 이 기록으로 판정한다.
      const match = /read (\d+) times/.exec(text(payload.message) ?? '')
      reads = match === null ? null : Number(match[1])
      state = { ...state, active: 'evaluator', status: { kind: 'judging' }, edge: { kind: 'evaluate', reads }, turn: null, executed: true }
    }
  }
  return live ? state : { ...state, active: null, status: null, edge: null }
}

/** 지금 step 의 계획 번호까지 셀 만큼 거슬러 받았는가: 지금 step 의 계획과 그 앞 step 의 줄이 다 있어야 한다. */
export function agentHistoryComplete(logs: readonly QaLog[]): boolean {
  const steps = logs.filter(isAgentLog).map((log) => stepNumber(asRecord(log.payload)?.step)).filter((step) => step !== null)
  if (steps.length === 0) return false
  const latest = Math.max(...steps)
  const earlier = steps.some((step) => step < latest)
  const planned = logs.some((log) => {
    const kind = kindOf(log)
    return kind !== null && PLAN_KINDS.has(kind) && stepNumber(asRecord(log.payload)?.step) === latest
  })
  return earlier && planned
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
