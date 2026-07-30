import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, readJson } from '../projects/projectApi'

/*
 * TestRun read API — the Map is read-only for now, so only the two GETs the
 * visualisation needs are here (run header + its ordered scenario composition).
 * Create/update/delete and scenario editing come with the editable Map later.
 */

export type TestRun = {
  id: string
  projectId: string
  name: string
  description: string | null
  createdAt: string
}

/** One slot of a run's scenario composition: position + the scenario id it points at. */
export type RunScenarioItem = {
  position: number
  testScenarioId: string
}

function runsRoot(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/test-runs`
}

export function parseTestRun(data: unknown): TestRun | null {
  const record = asRecord(data)
  if (record === null) return null
  const id = asString(record.id)
  if (id.length === 0) return null
  return {
    id,
    projectId: asString(record.projectId),
    name: asString(record.name),
    description: asNullableString(record.description),
    createdAt: asString(record.createdAt),
  }
}

export async function getTestRun(
  projectId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<TestRun | null> {
  const response = await apiFetch(`${runsRoot(projectId)}/${encodeURIComponent(runId)}`, { signal })
  return parseTestRun(await readJson(response))
}

/** `GET /api/projects/{projectId}/test-runs/{runId}/scenarios` — ordered slots. */
export async function getRunScenarios(
  projectId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<RunScenarioItem[]> {
  const response = await apiFetch(
    `${runsRoot(projectId)}/${encodeURIComponent(runId)}/scenarios`,
    { signal },
  )
  const items = asRecord(await readJson(response))?.items
  const list = Array.isArray(items) ? items : []
  return list
    .map((raw): RunScenarioItem | null => {
      const record = asRecord(raw)
      const testScenarioId = record === null ? '' : asString(record.testScenarioId)
      if (testScenarioId.length === 0) return null
      return { position: typeof record?.position === 'number' ? record.position : 0, testScenarioId }
    })
    .filter((item): item is RunScenarioItem => item !== null)
    .sort((left, right) => left.position - right.position)
}
