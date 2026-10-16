import { asRecord, asString } from '../projects/projectApi'
import type { ExecutionMode, ScenarioStep } from '../testScenarios/scenarioTypes'
import { asVerificationStatus, type VerificationStatus } from '../testCases/testCaseTypes'
import { usedCheatsOf, type UsedCheat } from './qaFunctionTimeline'
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

/**
 * How the Agent's verdict compares with the expected one a person wrote down
 * (`expected_passed`, ARTEL-301).
 *
 * `null` covers both "nobody labelled this step" and "the run never judged it".
 * Those are different facts, but neither is a grade, and `state` already tells
 * the two apart — a step with no verdict is `pending`, `running`, `unreported`
 * or `unknown`, never `passed` or `failed`.
 */
export type QaStepGrade = 'correct' | 'wrong' | null

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
  /** What the step was supposed to do, or `null` where nobody said. */
  expectedPassed: boolean | null
  grade: QaStepGrade
  /**
   * The cheats the agent invoked during this step, from the verdict's `used_cheats`
   * (ARTEL-1051). Empty for a step without a verdict and for a run from before the field.
   */
  usedCheats: UsedCheat[]
}

export type QaProgress = {
  steps: QaStepProgress[]
  reported: number
  passed: number
  failed: number
  total: number
  /**
   * The answer-key tallies. `labeled` counts steps carrying an expectation,
   * whether or not the run reached them, so `labeled - correct - wrong` is the
   * number the run left unjudged — the same third state the server's grader keeps
   * out of its matrix rather than folding into either side.
   */
  labeled: number
  correct: number
  wrong: number
}

const EMPTY_PROGRESS: QaProgress = {
  steps: [], reported: 0, passed: 0, failed: 0, total: 0, labeled: 0, correct: 0, wrong: 0,
}

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
  usedCheats: UsedCheat[]
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
          usedCheats: usedCheatsOf(payload),
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
        usedCheats: known?.usedCheats ?? [],
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
  executionMode = 'ORDERED',
  logs,
  status,
  historyComplete,
}: {
  scenarioSteps: ScenarioStep[]
  /**
   * In a `FREE` scenario the agent picks the order, so a verdict for step 5 says nothing
   * about steps 1 to 4: there is no frontier, and a step without a verdict is simply not
   * judged yet (`pending`) until the run ends.
   */
  executionMode?: ExecutionMode
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
  const isFree = executionMode === 'FREE'

  const steps: QaStepProgress[] = []
  let passed = 0
  let failed = 0
  let labeled = 0
  let correct = 0
  let wrong = 0

  for (let step = 1; step <= total; step += 1) {
    const expectedPassed = scenarioSteps[step - 1]?.expected_passed ?? null
    if (expectedPassed !== null) labeled += 1
    const verdict = verdicts.get(step)
    if (verdict !== undefined) {
      if (verdict.passed) passed += 1
      else failed += 1
      const grade: QaStepGrade =
        expectedPassed === null ? null : verdict.passed === expectedPassed ? 'correct' : 'wrong'
      if (grade === 'correct') correct += 1
      else if (grade === 'wrong') wrong += 1
      steps.push({
        step,
        title: scenarioSteps[step - 1]?.action ?? '',
        state: verdict.passed ? 'passed' : 'failed',
        verdict: verdict.message.length > 0 ? verdict.message : null,
        verdictLogId: verdict.logId,
        expectedPassed,
        grade,
        usedCheats: verdict.usedCheats,
      })
      continue
    }

    const state: QaStepState = terminal
      ? settled
        ? 'unreported'
        : 'unknown'
      : isFree
        ? 'pending'
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
      expectedPassed,
      // No verdict, so nothing to compare the expectation against.
      grade: null,
      usedCheats: [],
    })
  }

  return { steps, reported: verdicts.size, passed, failed, total, labeled, correct, wrong }
}

/** How full the Agent's LLM context window is, as of its latest model call. */
export type QaContextUsage = {
  usedTokens: number
  maxTokens: number
  /** `usedTokens / maxTokens` as a percentage, rounded, not capped. */
  percent: number
}

function asTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * The newest context usage the Agent reported.
 *
 * Each model call emits a `LOG` frame whose payload carries a `context` object
 * (`used_tokens`, `max_tokens`); other `LOG` frames lack it. Frames with a
 * missing or malformed `context`, or a `max_tokens` of zero or less, are
 * skipped, so one bad frame does not hide an earlier good reading.
 * Returns `null` when no frame qualifies.
 */
export function deriveQaContextUsage(logs: QaLog[]): QaContextUsage | null {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const usage = readQaContextUsage(logs[index])
    if (usage !== null) return usage
  }
  return null
}

/**
 * Whether this frame only carries a context reading. The gauge is where that reading
 * is shown, so the log timeline leaves these frames out; one per model call would
 * otherwise bury the lines that matter.
 */
export function isQaContextLog(log: QaLog): boolean {
  return log.type === 'LOG' && asRecord(asRecord(log.payload)?.context) !== null
}

function readQaContextUsage(log: QaLog): QaContextUsage | null {
  if (log.type !== 'LOG') return null
  const context = asRecord(asRecord(log.payload)?.context)
  if (context === null) return null
  const usedTokens = asTokenCount(context.used_tokens)
  const maxTokens = asTokenCount(context.max_tokens)
  if (usedTokens === null || maxTokens === null || maxTokens <= 0) return null
  return { usedTokens, maxTokens, percent: Math.round((usedTokens / maxTokens) * 100) }
}

/**
 * 이 실행이 TC 상태로 저장한 판정(ARTEL-995). `case_id` → 저장된 상태이고, 같은 TC 가 두 번 오면 나중 것이다.
 *
 * 스텝 판정(`STATUS`)과 따로 읽는다. 스텝 판정은 agent 의 말이고, 이것은 서버가 그 말을 TC 에 실제로 적었다는
 * 기록이다 — `BROKEN` 인 TC 처럼 적지 않은 경우가 있어 둘이 늘 같지 않다.
 */
export function deriveCaseVerdicts(logs: readonly QaLog[]): Map<string, VerificationStatus> {
  const verdicts = new Map<string, VerificationStatus>()
  for (const log of logs) {
    if (log.type !== 'CASE_VERDICT') continue
    const payload = asRecord(log.payload)
    const caseId = payload?.case_id
    if (typeof caseId !== 'number' && typeof caseId !== 'string') continue
    verdicts.set(String(caseId), asVerificationStatus(payload?.verification_status))
  }
  return verdicts
}
