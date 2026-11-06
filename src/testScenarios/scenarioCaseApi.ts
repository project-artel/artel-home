import { apiFetch } from '../auth/authApi'
import { asRecord, jsonRequest, readJson, toApiError } from '../projects/projectApi'
import { parseTestCase } from '../testCases/testCaseApi'
import type { ScenarioCaseItem } from '../testCases/testCaseTypes'

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
function parseScenarioCaseItem(data: unknown): ScenarioCaseItem | null {
  const record = asRecord(data)
  if (record === null) return null

  const testCase = parseTestCase(record.case)
  if (testCase === null) return null

  const position = typeof record.position === 'number' ? record.position : 0
  return { position, case: testCase }
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
