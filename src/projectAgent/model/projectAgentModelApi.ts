import { apiFetch } from '../../auth/authApi'
import { listQaModels } from '../../qa/qaApi'
import { qaModelOptionKey, type QaKeySource, type QaModel } from '../../qa/qaTypes'
import { asRecord, jsonRequest, readJson, toApiError } from '../../projects/projectApi'

const MODEL_PATH = '/api/auth/me/project-agent-model'

/** 사용자가 고른 프로젝트 agent 모델. `model` 이 null 이면 관리자 기본값을 쓴다. */
export type ProjectAgentModelPreference = {
  model: string | null
  keySource: QaKeySource | null
  effectiveModel: string | null
  effectiveKeySource: QaKeySource | null
  /** 저장된 선택을 지금은 쓸 수 없을 때 서버가 보내는 원인 코드. */
  problem: string | null
}

function asKeySource(value: unknown): QaKeySource | null {
  return value === 'platform' || value === 'user' ? value : null
}

function asNullableText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** 서버가 필드를 아직 안 보내도 받는다. 읽을 수 없는 칸은 null 이다. */
export function parseProjectAgentModel(data: unknown): ProjectAgentModelPreference {
  const record = asRecord(data)
  return {
    model: asNullableText(record?.model),
    keySource: asKeySource(record?.keySource),
    effectiveModel: asNullableText(record?.effectiveModel),
    effectiveKeySource: asKeySource(record?.effectiveKeySource),
    problem: asNullableText(record?.problem),
  }
}

/** 프로젝트를 주면 서버가 그 프로젝트 기준의 effective 모델을 돌려준다. */
export function projectAgentModelPath(projectId?: string): string {
  return projectId === undefined ? MODEL_PATH : `${MODEL_PATH}?projectId=${encodeURIComponent(projectId)}`
}

export async function getProjectAgentModel(
  projectId?: string,
  signal?: AbortSignal,
): Promise<ProjectAgentModelPreference> {
  const response = await apiFetch(projectAgentModelPath(projectId), { signal })
  return parseProjectAgentModel(await readJson(response))
}

export type ProjectAgentModelChoice = { model: string | null; keySource: QaKeySource | null }

/** `projectId` 를 주면 응답의 effective 모델이 그 프로젝트의 모델 설정까지 따진 값이다. */
export async function putProjectAgentModel(
  choice: ProjectAgentModelChoice,
  projectId?: string,
): Promise<ProjectAgentModelPreference> {
  const response = await apiFetch(projectAgentModelPath(projectId), { method: 'PUT', ...jsonRequest(choice) })
  if (!response.ok) throw await toApiError(response)
  return parseProjectAgentModel(await readJson(response))
}

export function listProjectAgentModels(signal?: AbortSignal): Promise<QaModel[]> {
  return listQaModels(signal)
}

/** 선택 목록의 값. 기본 모델은 빈 문자열이다. */
export function preferenceOptionKey(preference: ProjectAgentModelPreference): string {
  if (preference.model === null) return ''
  return qaModelOptionKey({ id: preference.model, keySource: preference.keySource ?? 'platform' })
}

/** 선택 목록의 값을 저장 body 로 바꾼다. 목록에 없는 값은 null 이다. */
export function choiceFromOptionKey(optionKey: string, models: QaModel[]): ProjectAgentModelChoice | null {
  if (optionKey === '') return { model: null, keySource: null }
  const model = models.find((one) => qaModelOptionKey(one) === optionKey)
  return model === undefined ? null : { model: model.id, keySource: model.keySource }
}

/** 기본 모델 항목에 붙일 이름. 서버가 모델을 말해 주지 않으면 null 이다. */
export function defaultModelName(preference: ProjectAgentModelPreference | null, models: QaModel[]): string | null {
  const id = preference === null ? null : preference.model === null ? preference.effectiveModel : null
  if (id === null) return null
  const known = models.find((model) => model.id === id)
  return known === undefined ? id : known.label
}

/** 저장 실패를 화면에 쓸 문구로 바꾼다. 서버의 error code 를 그대로 보인다. */
export function saveFailureText(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : null
  if (typeof code === 'string' && code.length > 0) return code
  return error instanceof Error ? error.message : ''
}

/** 프로젝트 단위 설정. 플랫폼 key 모델만 쓰므로 key source 칸이 없다. */
export type ProjectLevelAgentModel = {
  model: string | null
  effectiveModel: string | null
  problem: string | null
}

export function parseProjectLevelAgentModel(data: unknown): ProjectLevelAgentModel {
  const parsed = parseProjectAgentModel(data)
  return { model: parsed.model, effectiveModel: parsed.effectiveModel, problem: parsed.problem }
}

function projectLevelPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/project-agent-model`
}

export async function getProjectLevelAgentModel(projectId: string, signal?: AbortSignal): Promise<ProjectLevelAgentModel> {
  const response = await apiFetch(projectLevelPath(projectId), { signal })
  return parseProjectLevelAgentModel(await readJson(response))
}

export async function putProjectLevelAgentModel(projectId: string, model: string | null): Promise<ProjectLevelAgentModel> {
  const response = await apiFetch(projectLevelPath(projectId), { method: 'PUT', ...jsonRequest({ model }) })
  if (!response.ok) throw await toApiError(response)
  return parseProjectLevelAgentModel(await readJson(response))
}

/** 프로젝트 설정의 선택지. 플랫폼 key 로 쓸 수 있는 모델만 둔다. */
export function platformModels(models: QaModel[]): QaModel[] {
  return models.filter((model) => model.keySource === 'platform')
}
