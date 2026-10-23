import { apiFetch, orchestrationUrlFor } from '../auth/authApi'
import { toApiError } from '../projects/projectApi'
import type { AnnotationInput, DemonstrationEvent, DemonstrationInstance, DemonstrationSession, EvidenceInput, ProcedureRevision, VerificationProcedure } from './types'

export function demonstrationRoot(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/demonstrations`
}

async function request<T>(projectId: string, path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(`${demonstrationRoot(projectId)}${path}`, {
    method, signal, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) throw await toApiError(response)
  return response.json() as Promise<T>
}

export const listInstances = (projectId: string, signal?: AbortSignal) => request<DemonstrationInstance[]>(projectId, '/instances', 'GET', undefined, signal)
export const listDemonstrations = (projectId: string, testCaseId: number, signal?: AbortSignal) => request<DemonstrationSession[]>(projectId, `?testCaseId=${testCaseId}`, 'GET', undefined, signal)
export const getDemonstration = (projectId: string, id: string, signal?: AbortSignal) => request<DemonstrationSession>(projectId, `/${encodeURIComponent(id)}`, 'GET', undefined, signal)
export const startDemonstration = (projectId: string, testCaseId: number, scenarioId: number, gameInstanceId: number) => request<DemonstrationSession>(projectId, '', 'POST', { testCaseId, scenarioId, gameInstanceId })
export const stopDemonstration = (projectId: string, id: string) => request<DemonstrationSession>(projectId, `/${encodeURIComponent(id)}/stop`, 'POST')
export const saveEvidence = (projectId: string, id: string, evidence: EvidenceInput) => request<DemonstrationEvent>(projectId, `/${encodeURIComponent(id)}/evidence`, 'POST', evidence)
export const saveAnnotation = (projectId: string, id: string, annotation: AnnotationInput) => request<DemonstrationEvent>(projectId, `/${encodeURIComponent(id)}/annotations`, 'POST', annotation)
export const extractProcedure = (projectId: string, id: string) => request<ProcedureRevision>(projectId, `/${encodeURIComponent(id)}/extract`, 'POST')
export const updateProcedure = (projectId: string, id: string, expectedRevision: number, procedure: VerificationProcedure) => request<ProcedureRevision>(projectId, `/${encodeURIComponent(id)}/procedure`, 'PUT', { expectedRevision, procedure })
export const reviewProcedure = (projectId: string, id: string, expectedRevision: number, action: 'approve' | 'revoke') => request<ProcedureRevision>(projectId, `/${encodeURIComponent(id)}/${action}`, 'POST', { expectedRevision })
export function controlUrl(id: string) {
  return orchestrationUrlFor(`/ws/demonstration?sessionId=${encodeURIComponent(id)}`).replace(/^http/, 'ws')
}
