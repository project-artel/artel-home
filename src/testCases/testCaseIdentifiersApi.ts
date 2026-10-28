import { apiFetch } from '../auth/authApi'
import { asRecord, readJson, toApiError } from '../projects/projectApi'

export async function listTestCaseIdentifiers(projectId: string, signal?: AbortSignal): Promise<ReadonlyMap<string, string>> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/test-case-identifiers`, { signal })
  if (!response.ok) throw await toApiError(response)
  const body: unknown = await readJson(response)
  if (!Array.isArray(body)) throw new Error('Invalid test case identifiers')
  const numbers = new Map<string, string>()
  const assigned = new Set<string>()
  for (const item of body) {
    const row = asRecord(item)
    if (!row || typeof row.testCaseId !== 'string' || typeof row.caseNumber !== 'string' || !/^[1-9]\d*$/.test(row.caseNumber)
      || numbers.has(row.testCaseId) || assigned.has(row.caseNumber)) throw new Error('Invalid test case identifier')
    numbers.set(row.testCaseId, row.caseNumber)
    assigned.add(row.caseNumber)
  }
  return numbers
}
