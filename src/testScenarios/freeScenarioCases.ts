import type { TestCase } from '../testCases/testCaseTypes'
import type { ScenarioStep } from './scenarioTypes'

/**
 * Where the case a FREE line points at stands.
 * - `present`: in the list the scenario is checked against (the run's build, or the project).
 * - `notInBuild`: in the project, but the run's build has no version row for it, so a run on
 *   that build cannot verify it.
 * - `missing`: the project no longer holds it (deleted).
 */
export type FreeCaseAvailability = 'present' | 'notInBuild' | 'missing'

/**
 * One line of a FREE scenario: a test case, numbered by its place in the scenario.
 *
 * `testCase` is `null` when the project no longer holds the case the step points at. The line
 * is still drawn, because dropping it would make the scenario look shorter than what the run
 * will be asked to verify.
 */
export type FreeCaseRow = {
  /** 0-based index into the scenario's `steps`. */
  index: number
  /** 1-based listing order, shown in the row's badge. */
  number: number
  caseId: string
  testCase: TestCase | null
  availability: FreeCaseAvailability
}

/**
 * @param casesById every case of the project, unscoped — what tells a deleted case apart.
 * @param buildCasesById the cases of the run's build, in that build's content, or `null` when
 *   the scenario is not opened from a run with a build. A case found here is shown in this
 *   content; one found only in `casesById` is `notInBuild`.
 */
export function describeFreeCases(
  steps: readonly ScenarioStep[],
  casesById: ReadonlyMap<string, TestCase>,
  buildCasesById: ReadonlyMap<string, TestCase> | null = null,
): FreeCaseRow[] {
  const rows: FreeCaseRow[] = []
  steps.forEach((step, index) => {
    if (step.case_id === null) return
    const caseId = String(step.case_id)
    const inBuild = buildCasesById?.get(caseId)
    const inProject = casesById.get(caseId)
    const testCase = inBuild ?? inProject ?? null
    const availability: FreeCaseAvailability =
      inBuild !== undefined || (buildCasesById === null && inProject !== undefined)
        ? 'present'
        : inProject !== undefined
          ? 'notInBuild'
          : 'missing'
    rows.push({ index, number: rows.length + 1, caseId, testCase, availability })
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

export type CaseListStatus = 'loading' | 'ready' | 'error'

/**
 * The state of the lists a FREE editor reads together. Either failing is an error, and until
 * both arrive it is loading — a line must not read "no longer in the project" just because its
 * list has not come back yet.
 */
export function combineCaseListStatus(project: CaseListStatus, build: CaseListStatus | null): CaseListStatus {
  if (project === 'error' || build === 'error') return 'error'
  if (project === 'loading' || build === 'loading') return 'loading'
  return 'ready'
}
