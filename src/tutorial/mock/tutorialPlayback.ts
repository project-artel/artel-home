import type { TutorialData } from './tutorialFixtures'

/**
 * 튜토리얼의 QA 실행 장면(ARTEL-1461). 사용자가 "QA 실행"을 누르면 목데이터에 새 실행이 생기고, 실행 화면이 열리면 이
 * 각본이 실시간 스트림처럼 로그를 한 줄씩 흘려보낸다. Agent 가 단계마다 생각하고, 누르고, 판정하는 모습이 실제 실행
 * 화면에 그대로 쌓인다.
 *
 * 판정은 같은 테스트 런의 지난 실행(목데이터)과 같게 나온다. 끝나면 이 실행이 실행 기록에 더해져 다음 단계(결과 확인)가
 * 방금 돌린 실행을 연다.
 */

export type MockLog = {
  id: string
  qaTryId: string
  messageId: null
  correlationId: null
  direction: string
  type: string
  message: string
  payload: unknown
  createdAt: string
}

export type LiveRun = {
  runId: string
  tryId: string
  testRunId: string
  scenarioId: number
  sourceRunId: string
  startedAt: string
  completedAt: string | null
  logs: MockLog[]
  started: boolean
  done: boolean
}

type Verdict = { logId: string; step: number; caseId: string; passed: boolean; message: string; stepTitle: string }
type VerdictRun = { qaRunId: string; tries: { qaTryId: string; testScenarioId: string; steps: { step: number; title: string; caseId: string | null }[]; verdicts: Verdict[] }[] }

/** 단계 하나에 걸리는 시간. 다섯 단계면 20초 남짓이다. */
const STEP_MS = 3600
const BEAT_MS = 700

let live: LiveRun | null = null
const listeners = new Map<string, Set<(log: MockLog) => void>>()
/** 예시 게임 화면이 듣는다. 실행 화면의 스트림과 같은 줄을 받는다. */
const watchers = new Set<(log: MockLog) => void>()

export function watchLiveLogs(watcher: (log: MockLog) => void): () => void {
  watchers.add(watcher)
  return () => watchers.delete(watcher)
}

export function liveRun(): LiveRun | null {
  return live
}

export function resetPlayback(): void {
  live = null
  listeners.clear()
}

/** 새 실행을 만든다. 같은 테스트 런의 지난 실행이 없으면 null 이다(시나리오가 없는 런). */
export function createLiveRun(d: TutorialData, testRunId: string): LiveRun | null {
  const source = d.qaRuns.find((one) => one.testRunId === testRunId)
  const scenario = d.scenarios.find((one) => one.runId === testRunId)
  if (source === undefined || scenario === undefined) return null
  live = {
    runId: String(d.nextId++),
    tryId: String(d.nextId++),
    testRunId,
    scenarioId: scenario.testScenarioId,
    sourceRunId: source.id,
    startedAt: d.now(),
    completedAt: null,
    logs: [],
    started: false,
    done: false,
  }
  return live
}

/**
 * 실행 화면이 스트림을 열 때 부른다. 처음 열 때 각본을 시작하고, 그 뒤로 나오는 줄을 `emit` 으로 보낸다.
 * 돌려준 함수로 그만 받는다.
 */
export function attachPlayback(d: TutorialData, tryId: string, emit: (log: MockLog) => void, onDone: () => void): () => void {
  const run = live
  if (run === null || run.tryId !== tryId) return () => undefined
  let set = listeners.get(tryId)
  if (set === undefined) {
    set = new Set()
    listeners.set(tryId, set)
  }
  set.add(emit)
  if (!run.started) {
    run.started = true
    play(d, run, onDone)
  }
  return () => set?.delete(emit)
}

function play(d: TutorialData, run: LiveRun, onDone: () => void) {
  const source = (d.verdicts as Record<string, VerdictRun>)[run.sourceRunId]
  const sourceTry = source?.tries[0]
  if (sourceTry === undefined) return
  let nextLog = Number(run.tryId) * 1000
  const push = (direction: string, type: string, message: string, payload: unknown) => {
    const log: MockLog = {
      id: String(nextLog++),
      qaTryId: run.tryId,
      messageId: null,
      correlationId: null,
      direction,
      type,
      message,
      payload,
      createdAt: d.now(),
    }
    run.logs.push(log)
    listeners.get(run.tryId)?.forEach((emit) => emit(log))
    watchers.forEach((watch) => watch(log))
  }
  const later = (ms: number, act: () => void) => window.setTimeout(() => {
    if (live === run) act()
  }, ms)

  sourceTry.steps.forEach((step, index) => {
    const at = 900 + index * STEP_MS
    const verdict = sourceTry.verdicts.find((one) => one.step === step.step)
    const testCase = d.cases.find((one) => one.id === step.caseId)
    const caseNumber = testCase === undefined ? '' : String(testCase.number)
    later(at, () => push('AGENT_TO_ORCHE', 'LOG', `Step ${step.step}: ${thought(d, testCase?.scene ?? '', step.title)}`, {
      step: step.step,
      scene: testCase?.scene ?? null,
      level: 'INFO',
      message: thought(d, testCase?.scene ?? '', step.title),
      category: 'THOUGHT',
    }))
    later(at + BEAT_MS, () => push('AGENT_TO_ORCHE', 'ACTION', step.title, {
      step: step.step,
      scene: testCase?.scene ?? null,
      actions: [{ id: 1, method: 'button_click', params: [step.title], jsonrpc: '2.0' }],
      message: step.title,
    }))
    later(at + BEAT_MS * 2, () => push('ORCHE_TO_AGENT', 'ACTION_RESULT', 'Action result is available.', { results: [{ ok: true }] }))
    if (verdict === undefined) return
    later(at + BEAT_MS * 3.5, () => push('AGENT_TO_ORCHE', 'STATUS', verdict.message, {
      step: step.step,
      scene: testCase?.arrivesAt ?? testCase?.scene ?? null,
      status: verdict.passed ? 'COMPLETED' : 'FAILED',
      case_id: Number(verdict.caseId),
      message: verdict.message,
      is_verification: true,
      verdict: { insight: '', game_insight: verdict.message, evidence_sufficient: true },
    }))
    later(at + BEAT_MS * 3.8, () => push('ORCHE_INTERNAL', 'CASE_VERDICT', `TC-${caseNumber.padStart(3, '0')} → ${verdict.passed ? 'VERIFIED' : 'FAILED'}`, {
      case_id: Number(verdict.caseId),
      case_number: caseNumber,
      verification_status: verdict.passed ? 'VERIFIED' : 'FAILED',
    }))
  })

  later(900 + sourceTry.steps.length * STEP_MS, () => {
    run.done = true
    run.completedAt = d.now()
    push('ORCHE_INTERNAL', 'STATUS', 'QA run completed.', { status: 'COMPLETED', completedAt: run.completedAt })
    record(d, run)
    onDone()
  })
}

function thought(d: TutorialData, scene: string, step: string): string {
  return d.locale === 'en' ? `${scene} is on screen. Next: ${step}.` : `${scene} 화면이다. 다음 할 일: ${step}.`
}

/** 끝난 실행을 실행 기록 · 판정 · TC 시도에 더한다. 판정 내용은 같은 테스트 런의 지난 실행과 같다. */
function record(d: TutorialData, run: LiveRun) {
  const source = d.qaRuns.find((one) => one.id === run.sourceRunId)
  const verdicts = (d.verdicts as Record<string, VerdictRun & Record<string, unknown>>)[run.sourceRunId]
  if (source === undefined || verdicts === undefined) return
  d.qaRuns = [{ ...source, id: run.runId, startedAt: run.startedAt, completedAt: run.completedAt ?? d.now() }, ...d.qaRuns]
  const logId = (old: string) => `${run.tryId}${old.slice(-2)}`
  ;(d.verdicts as Record<string, unknown>)[run.runId] = {
    ...verdicts,
    qaRunId: run.runId,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    tries: verdicts.tries.map((one) => ({
      ...one,
      qaTryId: run.tryId,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      verdicts: one.verdicts.map((verdict) => ({ ...verdict, logId: logId(verdict.logId), judgedAt: run.completedAt })),
    })),
  }
  const sourceTryId = verdicts.tries[0]?.qaTryId
  d.attempts = [
    ...d.attempts
      .filter((one) => one.qaTryId === sourceTryId)
      .map((one) => ({ ...one, id: `attempt-${logId(one.logId)}`, qaTryId: run.tryId, qaRunId: run.runId, logId: logId(one.logId), review: null })),
    ...d.attempts,
  ]
  d.runs = d.runs.map((one) => (one.id === run.testRunId && one.lastQaRun !== null ? { ...one, lastQaRun: { ...one.lastQaRun, qaRunId: run.runId, startedAt: run.startedAt } } : one))
}
