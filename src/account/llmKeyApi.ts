import { apiFetch } from '../auth/authApi'
import {
  asRecord,
  isOneOf,
  jsonRequest,
  ProjectApiError,
  readJson,
  toApiError,
} from '../projects/projectApi'
import { LLM_KEY_SERVICES, type LlmKey, type LlmKeyRefusal, type LlmKeyService } from './llmKeyTypes'

/*
 * 사용자가 등록한 LLM API 키 (ARTEL-1035). 원본과 검증은 orchestration 몫이다 — 등록 요청을
 * 받으면 그 서비스에 키가 있어야 하는 읽기 호출을 한 번 해 보고(Claude · GPT 는 `GET /v1/models`,
 * OpenRouter 는 `GET /api/v1/key`), 통과한 키만 암호화해 저장한다. 이 화면은 원문을 보내기만 하고
 * 다시 받지 않는다.
 */
const ROOT = '/api/auth/me/llm-keys'

/** 서버가 거절 이유를 싣는 `code`. 503 은 code 와 상관없이 `unverified` 다. */
const REFUSAL_CODES: Record<string, LlmKeyRefusal> = {
  llm_key_invalid: 'invalid',
  llm_key_permission_denied: 'permission_denied',
}

/** 서비스를 모르거나 가린 키가 없는 줄은 버린다 — 무엇이 등록됐는지 말할 수 없다. */
export function parseLlmKey(data: unknown): LlmKey | null {
  const record = asRecord(data)
  if (
    record === null
    || !isOneOf(record.service, LLM_KEY_SERVICES)
    || typeof record.keyHint !== 'string'
    || record.keyHint.length === 0
  ) {
    return null
  }
  return {
    service: record.service,
    keyHint: record.keyHint,
    verifiedAt: typeof record.verifiedAt === 'string' ? record.verifiedAt : '',
  }
}

export function parseLlmKeys(data: unknown): LlmKey[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((item) => {
    const key = parseLlmKey(item)
    return key === null ? [] : [key]
  })
}

/** `GET /api/auth/me/llm-keys` — the keys this user has registered, one per service at most. */
export async function listLlmKeys(signal?: AbortSignal): Promise<LlmKey[]> {
  const response = await apiFetch(ROOT, { signal })
  return parseLlmKeys(await readJson(response))
}

/**
 * `PUT /api/auth/me/llm-keys/{service}` — verify `apiKey` with the service and
 * store it, replacing any key already there. Throws when it is not stored;
 * `llmKeyRefusal` says why.
 */
export async function registerLlmKey(service: LlmKeyService, apiKey: string): Promise<LlmKey> {
  const response = await apiFetch(`${ROOT}/${service}`, {
    method: 'PUT',
    ...jsonRequest({ apiKey }),
  })
  const key = parseLlmKey(await readJson(response))
  if (key === null) {
    throw new ProjectApiError(response.status, 'The server did not describe the stored key.')
  }
  return key
}

/** `DELETE /api/auth/me/llm-keys/{service}`. */
export async function deleteLlmKey(service: LlmKeyService): Promise<void> {
  const response = await apiFetch(`${ROOT}/${service}`, { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}

/** Why `registerLlmKey` failed, read from the status and `code`, never from the message. */
export function llmKeyRefusal(error: unknown): LlmKeyRefusal {
  if (!(error instanceof ProjectApiError)) return 'failed'
  if (error.status === 503) return 'unverified'
  return (error.code !== null ? REFUSAL_CODES[error.code] : undefined) ?? 'failed'
}
