import { asRecord, asString } from '../projects/projectApi'
import type { ScenarioStep } from '../testScenarios/scenarioTypes'
import { isTerminalQaStatus, type QaLog, type QaTryStatus } from './qaTypes'

/**
 * What the run has done to each scenario step, read back from the log stream.
 *
 * The Agent reports a step exactly once, when it has judged it: `report_step`
 * emits a `STATUS` frame carrying `step`, the verdict, and the evidence for it.
 * Nothing announces a step *starting* — `StepStatus.STARTED` exists in the
 * protocol but no sender uses it, and `LOG`/`ACTION` frames leave their `step`
 * field null. So `running` is inferred from how far the verdicts have got, and
 * it is labelled as the run's frontier rather than presented as a report.
 */
export type QaStepState =
  /** Reported passed. */
  | 'passed'
  /** Reported failed. */
  | 'failed'
  /** No verdict, and the next one the Agent is expected to judge. */
  | 'running'
  /** No verdict, and the run has not reached it. */
  | 'pending'
  /** The run ended, or moved past, without judging this step. */
  | 'unreported'
  /** A verdict may exist in logs that have not been loaded yet. */
  | 'unknown'

export type QaStepProgress = {
  /** 1-based, matching `ScenarioStep.step` and the Agent's `step_number`. */
  step: number
  /** Empty when the scenario could not be read; the number still identifies it. */
  title: string
  state: QaStepState
  /** `report_step`'s evidence, when there is a verdict. */
  verdict: string | null
  /** The `STATUS` row holding that evidence — where a click on this step lands. */
  verdictLogId: string | null
}

export type QaProgress = {
  steps: QaStepProgress[]
  reported: number
  passed: number
  failed: number
  total: number
}

const EMPTY_PROGRESS: QaProgress = { steps: [], reported: 0, passed: 0, failed: 0, total: 0 }

function asStepNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null
}

/**
 * The scenario step a log belongs to, for the rows that name one.
 *
 * Only the per-step `STATUS` verdict carries this today. It is read generically
 * because the protocol allows every Agent frame to carry it, and a row that
 * starts naming its step should show it without another change here.
 */
export function stepOf(log: QaLog): number | null {
  const payload = asRecord(log.payload)
  if (payload === null) return null
  // The terminal frame's `step` is absent; its scope is the whole run.
  return asStepNumber(payload.step)
}

type Verdict = {
  passed: boolean
  message: string
  logId: string | null
}

function collectVerdicts(logs: QaLog[]): {
  verdicts: Map<number, Verdict>
  summaryTotal: number | null
  summarySeen: boolean
} {
  const verdicts = new Map<number, Verdict>()
  let summaryTotal: number | null = null
  let summarySeen = false

  for (const log of logs) {
    if (log.type !== 'STATUS') continue
    const payload = asRecord(log.payload)
    if (payload === null) continue

    const step = asStepNumber(payload.step)
    if (step !== null) {
      // A per-step frame. `COMPLETED`/`FAILED` here is the step's own verdict,
      // not the run's — the run-scoped frame is the one carrying `result`.
      const status = payload.status
      if (status === 'COMPLETED' || status === 'FAILED') {
        verdicts.set(step, {
          passed: status === 'COMPLETED',
          message: asString(payload.message),
          logId: log.id,
        })
      }
      continue
    }

    // The terminal frame's `summary` is the run's own rollup. It matters because
    // it survives when the per-step frames that produced it have scrolled out of
    // the loaded window: it is always the newest log, so it is always loaded.
    const summary = asRecord(payload.summary)
    if (summary === null) continue
    summarySeen = true
    // 2단 판정(재설계): summary.steps = {total, passed, failed, items:[...]}.
    // 구 평면 구조(summary.total, summary.steps=[...])도 방어적으로 지원.
    const stepsTier = asRecord(summary.steps)
    summaryTotal =
      asStepNumber(stepsTier?.total) ?? asStepNumber(summary.total) ?? summaryTotal
    const stepItems = stepsTier
      ? stepsTier.items
      : Array.isArray(summary.steps)
        ? summary.steps
        : null
    if (!Array.isArray(stepItems)) continue

    for (const entry of stepItems) {
      const record = asRecord(entry)
      const step = asStepNumber(record?.step)
      if (record === null || step === null || typeof record.passed !== 'boolean') continue
      // Keep the per-step frame's id: the rollup is not a row anyone can be sent
      // to, and that row is where the evidence reads in context.
      const known = verdicts.get(step)
      verdicts.set(step, {
        passed: record.passed,
        message: asString(record.message, known?.message ?? ''),
        logId: known?.logId ?? null,
      })
    }
  }

  return { verdicts, summaryTotal, summarySeen }
}

/**
 * @param historyComplete whether every log of the run is loaded. Without it a
 * missing verdict cannot be told apart from one that simply has not been fetched,
 * and the difference is the whole point of `unknown`.
 */
export function deriveQaProgress({
  scenarioSteps,
  logs,
  status,
  historyComplete,
}: {
  scenarioSteps: ScenarioStep[]
  logs: QaLog[]
  status: QaTryStatus
  historyComplete: boolean
}): QaProgress {
  const { verdicts, summaryTotal, summarySeen } = collectVerdicts(logs)

  const highestReported = verdicts.size === 0 ? 0 : Math.max(...verdicts.keys())
  const total =
    scenarioSteps.length > 0 ? scenarioSteps.length : (summaryTotal ?? highestReported)
  if (total === 0) return EMPTY_PROGRESS

  const terminal = isTerminalQaStatus(status)
  // Either source settles what is missing: the whole history, or the run's own
  // rollup of what it judged.
  const settled = historyComplete || summarySeen
  const frontier = highestReported + 1

  const steps: QaStepProgress[] = []
  let passed = 0
  let failed = 0

  for (let step = 1; step <= total; step += 1) {
    const verdict = verdicts.get(step)
    if (verdict !== undefined) {
      if (verdict.passed) passed += 1
      else failed += 1
      steps.push({
        step,
        title: scenarioSteps[step - 1]?.action ?? '',
        state: verdict.passed ? 'passed' : 'failed',
        verdict: verdict.message.length > 0 ? verdict.message : null,
        verdictLogId: verdict.logId,
      })
      continue
    }

    const state: QaStepState = terminal
      ? settled
        ? 'unreported'
        : 'unknown'
      : step >= frontier
        ? // `STARTING` has no Agent session yet, so nothing is under way: the
          // frontier is only where work *would* resume, not where it is.
          step === frontier && status === 'RUNNING'
          ? 'running'
          : 'pending'
        : // Behind the frontier with nothing recorded: the Agent moved on
          // without judging it, unless the record is simply not loaded.
          settled
          ? 'unreported'
          : 'unknown'

    steps.push({
      step,
      title: scenarioSteps[step - 1]?.action ?? '',
      state,
      verdict: null,
      verdictLogId: null,
    })
  }

  return { steps, reported: verdicts.size, passed, failed, total }
}
