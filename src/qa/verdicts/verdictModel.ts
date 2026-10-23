import type { QaStepAction, QaStepIssue, QaStepVerdict, QaTryVerdicts } from '../qaVerdictApi'

/**
 * 판정 근거 화면의 스텝 한 줄(ARTEL-1135). 시나리오의 모든 스텝에 판정 · 이슈를 붙인 것이다.
 *
 * - `passed` · `failed`: 판정이 났다. 행동 스텝도 판정을 받는다(그 행동을 했는가).
 * - `running`: 판정 전이고 실행이 지금 여기에 있다(ORDERED 의 다음 스텝).
 * - `pending`: 판정 전이고 실행이 아직 닿지 않았다.
 * - `unreported`: 실행이 끝났는데 판정이 없다.
 */
export type StepState = 'passed' | 'failed' | 'running' | 'pending' | 'unreported'

export type StepRow = {
  step: number
  title: string
  expected: string | null
  /** 기대 결과를 보는 스텝인가. 아니면 행동 스텝이다. */
  verifying: boolean
  state: StepState
  verdict: QaStepVerdict | null
  /** 이 스텝에서 보고된 이슈. */
  issues: QaStepIssue[]
  /** 사람이 추가로 검토할 판정인가(ARTEL-1253). */
  review: boolean
}

const ACTIVE = new Set(['PENDING', 'STARTING', 'RUNNING'])

export function isActiveStatus(status: string): boolean {
  return ACTIVE.has(status)
}

/**
 * 판정이 없는 스텝이 검증 스텝인지는 시나리오 모양으로 정한다 — agent 가 정하는 규칙과 같다. ORDERED 는 같은 TC 가
 * 이어진 구간의 마지막 스텝, FREE 는 TC 가 붙은 모든 스텝이다. 판정이 있으면 판정이 말한 대로다.
 */
export function stepRows(scenario: QaTryVerdicts): StepRow[] {
  const verdicts = new Map(scenario.verdicts.map((verdict) => [verdict.step, verdict]))
  const steps = scenario.steps.length > 0
    ? scenario.steps
    : scenario.verdicts.map((verdict) => ({ step: verdict.step, title: verdict.stepTitle ?? '', caseId: verdict.caseId, expected: null }))
  const active = isActiveStatus(scenario.status)
  const highest = scenario.verdicts.reduce((max, verdict) => Math.max(max, verdict.step), 0)
  const free = scenario.executionMode === 'FREE'

  return steps.map((step, index) => {
    const verdict = verdicts.get(step.step) ?? null
    const next = steps[index + 1]
    const verifying = verdict !== null
      ? verdict.isVerification
      : step.caseId !== null && (free || next === undefined || next.caseId !== step.caseId)
    const state: StepState = verdict !== null
      ? (verdict.passed ? 'passed' : 'failed')
      : !active
        ? 'unreported'
        : !free && step.step === highest + 1 ? 'running' : 'pending'
    return {
      step: step.step,
      title: step.title || verdict?.stepTitle || '',
      expected: step.expected,
      verifying,
      state,
      verdict,
      issues: scenario.issues.filter((issue) => issue.step === step.step),
      review: verdict?.needsReview === true,
    }
  })
}

export type StepTally = { checks: number; passed: number; failed: number; actions: number; issues: number; judged: number; review: number }

export function tallyRows(rows: StepRow[]): StepTally {
  const checks = rows.filter((row) => row.verifying)
  return {
    checks: checks.length,
    passed: checks.filter((row) => row.state === 'passed').length,
    failed: rows.filter((row) => row.state === 'failed').length,
    actions: rows.filter((row) => !row.verifying).length,
    issues: rows.reduce((sum, row) => sum + row.issues.length, 0),
    judged: rows.filter((row) => row.verdict !== null).length,
    review: rows.filter((row) => row.review).length,
  }
}

/** 이 스텝보다 앞에서(또는 이 스텝에서) 보고된 이슈 중 가장 가까운 것. 뒤 실패가 앞 결함 탓인지 보게 한다. */
export function earlierIssue(rows: StepRow[], step: number): (QaStepIssue & { step: number }) | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row.step > step) continue
    const issue = row.issues.at(-1)
    if (issue !== undefined) return { ...issue, step: row.step }
  }
  return null
}

/** 처음으로 판정이 났거나 실행이 머문 스텝 — 아무것도 고르지 않았을 때 열 스텝. 실패가 있으면 첫 실패다. */
export function defaultStep(rows: StepRow[]): number | null {
  return (
    rows.find((row) => row.state === 'failed' && row.verifying)?.step
    ?? rows.find((row) => row.state === 'running')?.step
    ?? rows.find((row) => row.verdict !== null)?.step
    ?? rows[0]?.step
    ?? null
  )
}

/** 목록 · 칸 제목은 한 줄이라 코드 칩 없이 백틱만 걷는다. */
export function plainText(text: string): string {
  return text.replaceAll('`', '')
}

/** 기대 문구의 백틱은 코드 이름이다. 화면은 백틱 대신 코드 칩으로 그린다. */
export function textParts(text: string): { text: string; code: boolean }[] {
  return text
    .split('`')
    .map((part, index) => ({ text: part, code: index % 2 === 1 }))
    .filter((part) => part.text.length > 0)
}

export function actionLabel(action: QaStepAction, words: { click: string; drag: string }): string {
  const name = action.kind === 'click' ? words.click : action.kind === 'drag' ? words.drag : (action.label ?? action.kind)
  return action.count > 1 ? `${name} ×${action.count}` : name
}
