import {
  AdminApiError as SharedAdminApiError,
  apiFetch,
  asNullableNumber,
  asNullableString,
  asRecord,
  asString,
  readJson as readPlainJson,
} from '../shared/adminApi'

/**
 * Every `/api/admin/*` endpoint shape lives in this file, so a server-side
 * rename touches one module. The shapes follow the "API contract" table in
 * `.plan/general/2026-10-06-self-host-with-email-login-and-openrouter-key.md`;
 * where the plan names no field, the camelCase name used here is an assumption
 * and the parsers accept the obvious alternatives.
 */

export type PlatformRole = 'USER' | 'DEVELOPER' | 'ADMIN'
export const PLATFORM_ROLES: readonly PlatformRole[] = ['USER', 'DEVELOPER', 'ADMIN']

export interface AdminUser {
  id: string
  /** The name shown for the account; `nickname` and `userTag` are not needed here. */
  displayName: string
  /** Address the person signs in with by email. `null` for an account that only uses GitHub. */
  loginEmail: string | null
  /** Contact address, which may exist without a password login. */
  email: string | null
  platformRole: PlatformRole
  disabled: boolean
  hasPassword: boolean
  mustChangePassword: boolean
  oauthProviders: string[]
  createdAt: string | null
}

/** A password the server shows exactly once. Never persist it beyond the screen that displays it. */
export interface TemporaryPasswordResult {
  user: AdminUser
  temporaryPassword: string
}

export interface CreateUserRequest {
  email: string
  name: string
  platformRole: PlatformRole
}

export type LlmKeySource = 'admin' | 'none'

export type LlmCheckError = 'no_key' | 'invalid_key' | 'upstream_unavailable'

export interface LlmKeyCheck {
  checkedAt: string | null
  source: LlmKeySource
  maskedKey: string | null
  /** Whether OpenRouter accepted the key. `null` when no check reached it. */
  keyValid: boolean | null
  requiredModels: string[]
  reachableModels: string[]
  missingModels: string[]
  /** Why the check could not finish, or `null` when it did. */
  error: LlmCheckError | null
}

export interface LlmSettings {
  /** Whether some key is in effect. */
  configured: boolean
  source: LlmKeySource
  /** 서버가 끝부분만 남기고 가린 값(예: `****abcd`). 키 전체는 내려오지 않는다. */
  maskedKey: string | null
  adminKeyStored: boolean
  /** A stored key exists but cannot be decrypted, so it must be set again. */
  adminKeyUnreadable: boolean
  adminKeyUpdatedAt: string | null
  /** False when `ARTEL_SECRETS_KEY` is missing, so the admin page cannot store a key. */
  secretsKeyConfigured: boolean
  lastCheck: LlmKeyCheck | null
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * An admin call the server refused with `{code, message, fields}`. `code` is
 * what screens map to a sentence (`last_admin`, `secrets_key_missing`, ...);
 * it is empty when the body had none.
 */
export class SettingsApiError extends SharedAdminApiError {
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(status, message)
    this.name = 'SettingsApiError'
    this.code = code
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (response.ok) return readPlainJson(response)
  let code = ''
  let message = `Request refused (HTTP ${response.status})`
  try {
    const body = (await response.json()) as Record<string, unknown>
    if (typeof body.code === 'string') code = body.code
    if (typeof body.message === 'string' && body.message !== '') message = body.message
  } catch {
    // The body is optional; the status alone still describes the refusal.
  }
  throw new SettingsApiError(response.status, code, message)
}

export function parseRole(value: unknown): PlatformRole {
  return value === 'ADMIN' || value === 'DEVELOPER' ? value : 'USER'
}

export function parseAdminUser(raw: unknown): AdminUser {
  const row = asRecord(raw)
  return {
    id: String(row.id ?? ''),
    displayName: asNullableString(row.displayName) ?? asNullableString(row.nickname) ?? '',
    loginEmail: asNullableString(row.loginEmail),
    email: asNullableString(row.email),
    platformRole: parseRole(row.platformRole),
    disabled: row.disabled === true,
    hasPassword: row.hasPassword === true,
    mustChangePassword: row.mustChangePassword === true,
    oauthProviders: Array.isArray(row.oauthProviders)
      ? row.oauthProviders.filter((value): value is string => typeof value === 'string')
      : [],
    createdAt: asNullableString(row.createdAt),
  }
}

function parseUserList(body: unknown): AdminUser[] {
  const items = Array.isArray(body) ? body : asRecord(body).items
  return Array.isArray(items) ? items.map(parseAdminUser) : []
}

export function parseTemporaryPassword(body: unknown): TemporaryPasswordResult {
  const record = asRecord(body)
  return {
    temporaryPassword: asString(record.temporaryPassword, 'temporaryPassword'),
    user: parseAdminUser(record.user),
  }
}

export async function listAdminUsers(signal?: AbortSignal): Promise<AdminUser[]> {
  return parseUserList(await readJson(await apiFetch('/api/admin/users', { signal })))
}

export async function createAdminUser(request: CreateUserRequest): Promise<TemporaryPasswordResult> {
  const response = await apiFetch('/api/admin/users', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(request),
  })
  return parseTemporaryPassword(await readJson(response))
}

export async function resetAdminUserPassword(userId: string): Promise<TemporaryPasswordResult> {
  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
  })
  return parseTemporaryPassword(await readJson(response))
}

/** Sends only the fields that change. */
export async function updateAdminUser(
  userId: string,
  change: { platformRole?: PlatformRole; disabled?: boolean },
): Promise<AdminUser> {
  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(change),
  })
  return parseAdminUser(await readJson(response))
}

function parseSource(value: unknown): LlmKeySource {
  // The server no longer reads an environment variable, so anything but `admin` means no key.
  return value === 'admin' ? value : 'none'
}

function parseStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function parseCheckError(value: unknown): LlmCheckError | null {
  return value === 'no_key' || value === 'invalid_key' || value === 'upstream_unavailable' ? value : null
}

export function parseLlmKeyCheck(raw: unknown): LlmKeyCheck {
  const record = asRecord(raw)
  return {
    checkedAt: asNullableString(record.checkedAt),
    source: parseSource(record.source),
    maskedKey: asNullableString(record.maskedKey),
    keyValid: typeof record.keyValid === 'boolean' ? record.keyValid : null,
    requiredModels: parseStringList(record.requiredModels),
    reachableModels: parseStringList(record.reachableModels),
    missingModels: parseStringList(record.missingModels),
    error: parseCheckError(record.error),
  }
}

export function parseLlmSettings(body: unknown): LlmSettings {
  const record = asRecord(body)
  const lastCheck = record.lastCheck
  return {
    configured: record.configured === true,
    source: parseSource(record.source),
    maskedKey: asNullableString(record.maskedKey),
    adminKeyStored: record.adminKeyStored === true,
    adminKeyUnreadable: record.adminKeyUnreadable === true,
    adminKeyUpdatedAt: asNullableString(record.adminKeyUpdatedAt),
    // Missing means an older server that never needed the key; do not block saving.
    secretsKeyConfigured: record.secretsKeyConfigured !== false,
    lastCheck: typeof lastCheck === 'object' && lastCheck !== null ? parseLlmKeyCheck(lastCheck) : null,
  }
}

export async function getLlmSettings(signal?: AbortSignal): Promise<LlmSettings> {
  return parseLlmSettings(await readJson(await apiFetch('/api/admin/settings/llm', { signal })))
}

/**
 * Sets the key, or clears it when `apiKey` is `null`. The answer is read back as
 * settings, which carry only the masked tail, so the plain key never returns.
 */
export async function putLlmKey(apiKey: string | null): Promise<LlmSettings> {
  const response = await apiFetch('/api/admin/settings/llm', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ apiKey }),
  })
  return parseLlmSettings(await readJson(response))
}

export async function checkLlmModels(): Promise<LlmKeyCheck> {
  const response = await apiFetch('/api/admin/settings/llm/check', { method: 'POST' })
  return parseLlmKeyCheck(await readJson(response))
}

export type LlmModelRoute = 'openrouter' | 'bedrock' | 'claude' | 'gpt'

const LLM_MODEL_ROUTES: readonly LlmModelRoute[] = ['openrouter', 'bedrock', 'claude', 'gpt']

/** One row of the model catalog. Only `enabled` can be changed from the admin page. */
export interface AdminLlmModel {
  id: string
  label: string
  provider: string
  route: LlmModelRoute
  enabled: boolean
  supportsVision: boolean
  maxInputTokens: number | null
  updatedAt: string | null
}

function parseLlmModelRoute(value: unknown, id: string): LlmModelRoute {
  const known = LLM_MODEL_ROUTES.find((route) => route === value)
  if (known !== undefined) return known
  return value === undefined && id.startsWith('bedrock/') ? 'bedrock' : 'openrouter'
}

export function parseAdminLlmModel(raw: unknown): AdminLlmModel {
  const row = asRecord(raw)
  const id = String(row.id ?? '')
  return {
    id,
    label: asNullableString(row.label) ?? id,
    provider: asNullableString(row.provider) ?? '',
    // The server derives the route from the id prefix; do the same when it is missing.
    route: parseLlmModelRoute(row.route, id),
    enabled: row.enabled === true,
    supportsVision: row.supportsVision === true,
    maxInputTokens: asNullableNumber(row.maxInputTokens),
    updatedAt: asNullableString(row.updatedAt),
  }
}

export async function listLlmModels(signal?: AbortSignal): Promise<AdminLlmModel[]> {
  const body = await readJson(await apiFetch('/api/admin/llm-models', { signal }))
  const items = Array.isArray(body) ? body : asRecord(body).items
  return Array.isArray(items) ? items.map(parseAdminLlmModel) : []
}

/** The id goes in the body because model ids contain `/` and `:`. Answers the updated row. */
export async function setLlmModelEnabled(id: string, enabled: boolean): Promise<AdminLlmModel> {
  const response = await apiFetch('/api/admin/llm-models', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ id, enabled }),
  })
  return parseAdminLlmModel(await readJson(response))
}

/** Replaces the row with the same id, leaving every other row as it was. */
export function replaceLlmModel(models: AdminLlmModel[], updated: AdminLlmModel): AdminLlmModel[] {
  return models.map((model) => (model.id === updated.id ? updated : model))
}

/** One Bedrock model the check called. `error` is the provider's message or the transport error. */
export interface BedrockModelCheck {
  id: string
  reachable: boolean
  error: string | null
}

export interface BedrockCheck {
  checkedAt: string | null
  keyConfigured: boolean
  models: BedrockModelCheck[]
}

export interface BedrockSettings {
  configured: boolean
  /** The server's masked tail such as `…abcd`. The full key is never sent. */
  maskedKey: string | null
  updatedAt: string | null
  region: string | null
  lastCheck: BedrockCheck | null
}

export function parseBedrockCheck(raw: unknown): BedrockCheck {
  const record = asRecord(raw)
  return {
    checkedAt: asNullableString(record.checkedAt),
    keyConfigured: record.keyConfigured === true,
    models: Array.isArray(record.models)
      ? record.models.map((entry) => {
          const row = asRecord(entry)
          return {
            id: String(row.id ?? ''),
            reachable: row.reachable === true,
            error: asNullableString(row.error),
          }
        })
      : [],
  }
}

export function parseBedrockSettings(body: unknown): BedrockSettings {
  const record = asRecord(body)
  const lastCheck = record.lastCheck
  return {
    configured: record.configured === true,
    maskedKey: asNullableString(record.maskedKey),
    updatedAt: asNullableString(record.updatedAt),
    region: asNullableString(record.region),
    lastCheck: typeof lastCheck === 'object' && lastCheck !== null ? parseBedrockCheck(lastCheck) : null,
  }
}

export async function getBedrockSettings(signal?: AbortSignal): Promise<BedrockSettings> {
  return parseBedrockSettings(await readJson(await apiFetch('/api/admin/settings/bedrock', { signal })))
}

/** Sets the key, or deletes it (and the last check) when `apiKey` is `null`. */
export async function putBedrockKey(apiKey: string | null): Promise<BedrockSettings> {
  const response = await apiFetch('/api/admin/settings/bedrock', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ apiKey }),
  })
  return parseBedrockSettings(await readJson(response))
}

export async function checkBedrockModels(): Promise<BedrockCheck> {
  const response = await apiFetch('/api/admin/settings/bedrock/check', { method: 'POST' })
  return parseBedrockCheck(await readJson(response))
}

/** Claude API(Anthropic) 키. 상태 모양은 Bedrock 키와 같고 region 만 없다. */
export type ClaudeCheck = BedrockCheck

export interface ClaudeSettings {
  configured: boolean
  /** 서버가 끝부분만 남기고 가린 값(예: `****abcd`). 키 전체는 내려오지 않는다. */
  maskedKey: string | null
  updatedAt: string | null
  lastCheck: ClaudeCheck | null
}

export function parseClaudeSettings(body: unknown): ClaudeSettings {
  const record = asRecord(body)
  const lastCheck = record.lastCheck
  return {
    configured: record.configured === true,
    maskedKey: asNullableString(record.maskedKey),
    updatedAt: asNullableString(record.updatedAt),
    lastCheck: typeof lastCheck === 'object' && lastCheck !== null ? parseBedrockCheck(lastCheck) : null,
  }
}

export async function getClaudeSettings(signal?: AbortSignal): Promise<ClaudeSettings> {
  return parseClaudeSettings(await readJson(await apiFetch('/api/admin/settings/anthropic', { signal })))
}

/** 키를 저장한다(`sk-ant-` 로 시작해야 한다). `apiKey` 가 `null` 이면 삭제한다. */
export async function putClaudeKey(apiKey: string | null): Promise<ClaudeSettings> {
  const response = await apiFetch('/api/admin/settings/anthropic', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ apiKey }),
  })
  return parseClaudeSettings(await readJson(response))
}

export async function checkClaudeModels(): Promise<ClaudeCheck> {
  const response = await apiFetch('/api/admin/settings/anthropic/check', { method: 'POST' })
  return parseBedrockCheck(await readJson(response))
}

/** The direct TypeSafe (Jev) API key. Same status shape as the Anthropic key, without a model check. */
export interface TypesafeSettings {
  configured: boolean
  /** 서버가 끝부분만 남기고 가린 값(예: `****abcd`). 키 전체는 내려오지 않는다. */
  maskedKey: string | null
  updatedAt: string | null
}

export function parseTypesafeSettings(body: unknown): TypesafeSettings {
  const record = asRecord(body)
  return {
    configured: record.configured === true,
    maskedKey: asNullableString(record.maskedKey),
    updatedAt: asNullableString(record.updatedAt),
  }
}

export async function getTypesafeSettings(signal?: AbortSignal): Promise<TypesafeSettings> {
  return parseTypesafeSettings(await readJson(await apiFetch('/api/admin/settings/typesafe', { signal })))
}

/** Sets the key, or deletes it when `apiKey` is `null`. */
export async function putTypesafeKey(apiKey: string | null): Promise<TypesafeSettings> {
  const response = await apiFetch('/api/admin/settings/typesafe', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ apiKey }),
  })
  return parseTypesafeSettings(await readJson(response))
}

export interface CacheInvalidation {
  agentServerInvalidated: boolean
  /** Why the agent-server call failed, or `null` when it did not. */
  error: string | null
}

export function parseCacheInvalidation(body: unknown): CacheInvalidation {
  const record = asRecord(body)
  return {
    agentServerInvalidated: record.agentServerInvalidated === true,
    error: asNullableString(record.error),
  }
}

export async function invalidateLlmCache(): Promise<CacheInvalidation> {
  const response = await apiFetch('/api/admin/settings/llm/invalidate-cache', { method: 'POST' })
  return parseCacheInvalidation(await readJson(response))
}


/** The `decisionModel` value that means the Jev decision interface on OpenRouter. */
export const JEV_MODEL_ID = 'typesafe/jev-1.13'

/** Which model each feature uses. `null` means the feature's own default. */
export interface FeatureModels {
  scenarioAuthoringModel: string | null
  /** What the server uses while `scenarioAuthoringModel` is `null`; `null` means the agent-server default. */
  scenarioAuthoringFallback: string | null
  decisionModel: string | null
  /** `null` 이면 scenario authoring 모델을 따른다. */
  projectAgentModel: string | null
  /** `projectAgentModel` 이 `null` 일 때 서버가 쓰는 모델. `null` 이면 agent-server 기본값이다. */
  projectAgentFallback: string | null
  /** platform 키가 없는 route 의 저장된 모델 id. 이런 모델도 저장은 할 수 있다. */
  keyMissing: string[]
  updatedAt: string | null
}

export function parseFeatureModels(body: unknown): FeatureModels {
  const row = asRecord(body)
  return {
    scenarioAuthoringModel: asNullableString(row.scenarioAuthoringModel),
    scenarioAuthoringFallback: asNullableString(row.scenarioAuthoringFallback),
    decisionModel: asNullableString(row.decisionModel),
    projectAgentModel: asNullableString(row.projectAgentModel),
    projectAgentFallback: asNullableString(row.projectAgentFallback),
    keyMissing: Array.isArray(row.keyMissing)
      ? row.keyMissing.filter((id): id is string => typeof id === 'string')
      : [],
    updatedAt: asNullableString(row.updatedAt),
  }
}

export async function getFeatureModels(signal?: AbortSignal): Promise<FeatureModels> {
  return parseFeatureModels(await readJson(await apiFetch('/api/admin/settings/models', { signal })))
}

/** 모든 field 를 항상 보내고, `null` 은 그 기능의 선택을 지운다. 응답은 저장된 상태다. */
export async function putFeatureModels(
  request: Pick<FeatureModels, 'scenarioAuthoringModel' | 'decisionModel' | 'projectAgentModel'>,
): Promise<FeatureModels> {
  const response = await apiFetch('/api/admin/settings/models', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      scenarioAuthoringModel: request.scenarioAuthoringModel,
      decisionModel: request.decisionModel,
      projectAgentModel: request.projectAgentModel,
    }),
  })
  return parseFeatureModels(await readJson(response))
}

/** Where the effective consent comes from: the stored admin choice or the `ARTEL_TELEMETRY` environment variable. */
export type TelemetrySource = 'setting' | 'environment'

export interface TelemetrySettings {
  /** False when the server has no telemetry endpoint, so the whole section is hidden. */
  available: boolean
  enabled: boolean
  source: TelemetrySource
  installId: string | null
  /** The UTC date (`YYYY-MM-DD`) of the last report that was sent, or `null` when none was. */
  lastSentDate: string | null
}

export function parseTelemetrySettings(body: unknown): TelemetrySettings {
  const record = asRecord(body)
  return {
    available: record.available === true,
    enabled: record.enabled === true,
    source: record.source === 'setting' ? 'setting' : 'environment',
    installId: asNullableString(record.installId),
    lastSentDate: asNullableString(record.lastSentDate),
  }
}

export async function getTelemetrySettings(signal?: AbortSignal): Promise<TelemetrySettings> {
  return parseTelemetrySettings(await readJson(await apiFetch('/api/admin/settings/telemetry', { signal })))
}

/** `deleteSentData` is sent only when asked for; it makes the server delete the reports already received. */
export async function putTelemetryConsent(enabled: boolean, deleteSentData?: boolean): Promise<TelemetrySettings> {
  const body = deleteSentData === undefined ? { enabled } : { enabled, deleteSentData }
  const response = await apiFetch('/api/admin/settings/telemetry', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
  return parseTelemetrySettings(await readJson(response))
}

/** The report for yesterday, exactly as it would be sent, pretty-printed for display. */
export async function getTelemetryPreview(signal?: AbortSignal): Promise<string> {
  const body = await readJson(await apiFetch('/api/admin/settings/telemetry/preview', { signal }))
  return JSON.stringify(body, null, 2)
}
