import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, isOneOf, jsonRequest, readJson, toApiError } from '../projects/projectApi'
import { parseTestCase } from '../testCases/testCaseApi'
import { CASE_STEP_KINDS, type CaseStep, type ScenarioCaseItem } from '../testCases/testCaseTypes'

/*
 * A scenario's ordered case composition: `/api/test-scenario/{id}/cases`.
 *
 * This is the scenario body in the 3-tier model — the ordered list of reusable
 * TestCases the scenario runs. It is separate from the scenario's `payload`
 * (the agent-authored draft); the two are edited through different endpoints.
 *
 * The read resolves each referenced case in full; the write replaces the whole
 * composition with `caseIds`, whose order is the position. Ids are strings.
 */

function casesPath(testScenarioId: number): string {
  return `/api/test-scenario/${encodeURIComponent(testScenarioId)}/cases`
}

/**
 * Parses one composition row. A row without a resolvable case is dropped rather
 * than rendered as a hole — the server already omits cases that no longer
 * exist, and a half-parsed row would only be a hole the user cannot act on.
 */
/** 저작 Step 한 칸. kind가 미지값이면 `guide`로 접는다(데이터는 버리지 않고 최선 해석). */
function parseCaseStep(data: unknown): CaseStep | null {
  const record = asRecord(data)
  if (record === null) return null
  const rawKind = asString(record.kind)
  return {
    id: asString(record.id),
    kind: isOneOf(rawKind, CASE_STEP_KINDS) ? rawKind : 'guide',
    // 서버는 `assert`(setup은 false)로 보낸다. 없으면 판정으로 본다.
    assert: record.assert === false ? false : true,
    intent: asString(record.intent),
    hint: asNullableString(record.hint),
    input: asNullableString(record.input),
    observe: asNullableString(record.observe),
  }
}

function parseScenarioCaseItem(data: unknown): ScenarioCaseItem | null {
  const record = asRecord(data)
  if (record === null) return null

  const testCase = parseTestCase(record.case)
  if (testCase === null) return null

  const position = typeof record.position === 'number' ? record.position : 0
  const steps = Array.isArray(record.steps)
    ? record.steps.map(parseCaseStep).filter((step): step is CaseStep => step !== null)
    : []
  return { position, case: testCase, steps }
}

function parseComposition(data: unknown): ScenarioCaseItem[] {
  const items = asRecord(data)?.items
  const list = Array.isArray(items) ? items : []
  return list
    .map(parseScenarioCaseItem)
    .filter((item): item is ScenarioCaseItem => item !== null)
    .sort((left, right) => left.position - right.position)
}

/** `GET /api/test-scenario/{id}/cases` — the ordered, resolved composition. */
export async function getScenarioCases(
  testScenarioId: number,
  signal?: AbortSignal,
): Promise<ScenarioCaseItem[]> {
  const response = await apiFetch(casesPath(testScenarioId), { signal })
  return parseComposition(await readJson(response))
}

/**
 * `PUT /api/test-scenario/{id}/cases` — replaces the composition wholesale.
 *
 * The order of `caseIds` becomes the position, so a reorder, an insert, and a
 * removal are all the same call: send the list the user now sees. The server
 * returns the resolved composition, which the caller adopts as the new
 * baseline.
 */
export async function setScenarioCases(
  testScenarioId: number,
  caseIds: string[],
): Promise<ScenarioCaseItem[]> {
  const response = await apiFetch(casesPath(testScenarioId), {
    method: 'PUT',
    ...jsonRequest({ caseIds }),
  })
  if (!response.ok) throw await toApiError(response)
  return parseComposition(await readJson(response))
}

/**
 * `PUT /api/test-scenario/{id}/cases` with `items` — 순서 + 자리별 저작 Step까지 함께 저장
 * (ARTEL-269/280). caseIds만 보내는 위 경로와 달리, 여기선 입력 steps가 **권위**다(빈 목록이면
 * 그 자리 steps를 비운다). items 순서가 곧 position.
 */
export async function setScenarioCasesWithSteps(
  testScenarioId: number,
  items: { caseId: string; steps: CaseStep[] }[],
): Promise<ScenarioCaseItem[]> {
  const response = await apiFetch(casesPath(testScenarioId), {
    method: 'PUT',
    ...jsonRequest({ items }),
  })
  if (!response.ok) throw await toApiError(response)
  return parseComposition(await readJson(response))
}
