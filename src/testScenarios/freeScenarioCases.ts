import type { TestCase } from '../testCases/testCaseTypes'
import type { ScenarioStep } from './scenarioTypes'

/**
 * One line of a FREE scenario: a test case, numbered by its place in the scenario.
 *
 * `testCase` is `null` when the project no longer holds the case the step points at
 * (deleted, or the list has not arrived). The line is still drawn, because dropping it
 * would make the scenario look shorter than what the run will be asked to verify.
 */
export type FreeCaseRow = {
  /** 0-based index into the scenario's `steps`. */
  index: number
  /** 1-based listing order, shown in the row's badge. */
  number: number
  caseId: string
  testCase: TestCase | null
}

export function describeFreeCases(
  steps: readonly ScenarioStep[],
  casesById: ReadonlyMap<string, TestCase>,
): FreeCaseRow[] {
  const rows: FreeCaseRow[] = []
  steps.forEach((step, index) => {
    if (step.case_id === null) return
    const caseId = String(step.case_id)
    rows.push({ index, number: rows.length + 1, caseId, testCase: casesById.get(caseId) ?? null })
  })
  return rows
}

/**
 * The cases the "add test cases" dialog offers: every project case the scenario does not
 * already hold (a duplicate `case_id` is rejected by the server), narrowed by the search
 * text over step, scene and expected result.
 */
export function selectAddableCases(
  allCases: readonly TestCase[],
  steps: readonly ScenarioStep[],
  query: string,
): TestCase[] {
  const held = new Set(steps.flatMap((step) => (step.case_id === null ? [] : [String(step.case_id)])))
  const needle = query.trim().toLowerCase()
  return allCases.filter((testCase) => {
    if (held.has(testCase.id)) return false
    if (needle.length === 0) return true
    return [testCase.step, testCase.scene, testCase.expectedValue].some((text) => text.toLowerCase().includes(needle))
  })
}

/** Id → case lookup shared by the scenario page and the QA console. */
export function indexCasesById(cases: readonly TestCase[]): Map<string, TestCase> {
  return new Map(cases.map((testCase) => [testCase.id, testCase]))
}
