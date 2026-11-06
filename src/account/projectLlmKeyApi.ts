import { apiFetch } from '../auth/authApi'
import { asRecord, jsonRequest, readJson, toApiError } from '../projects/projectApi'
import { parseLlmKey } from './llmKeyApi'
import type { LlmKey, LlmKeyService } from './llmKeyTypes'

export type ProjectLlmKey = LlmKey & { linked?: boolean; ownLink?: boolean }

function root(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/llm-keys`
}

export async function listProjectLlmKeys(projectId: string, signal?: AbortSignal): Promise<ProjectLlmKey[]> {
  const data = await readJson(await apiFetch(root(projectId), { signal }))
  return Array.isArray(data) ? data.flatMap((item) => {
    const key = parseLlmKey(item)
    const row = asRecord(item)
    return key === null ? [] : [{ ...key, linked: row?.linked === true, ownLink: row?.ownLink === true }]
  }) : []
}

export async function registerProjectLlmKey(projectId: string, service: LlmKeyService, apiKey: string) {
  const response = await apiFetch(`${root(projectId)}/${service}`, { method: 'PUT', ...jsonRequest({ apiKey }) })
  if (!response.ok) throw await toApiError(response)
}

export async function changeProjectLlmKey(
  projectId: string,
  service: LlmKeyService,
  method: 'PUT' | 'DELETE',
  link: boolean,
) {
  const response = await apiFetch(`${root(projectId)}/${service}${link ? '/link' : ''}`, { method })
  if (!response.ok) throw await toApiError(response)
}
