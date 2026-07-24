import { apiFetch } from '../auth/authApi'
import {
  asNullableString,
  asRecord,
  asString,
  jsonRequest,
  projectPath,
  ProjectApiError,
  readJson,
  toApiError,
} from './projectApi'
import {
  DEFAULT_GAME_PLATFORM,
  type GameBuild,
  type GameBuildPatch,
  type GameInstance,
  type GameInstanceDraft,
  type GameInstancePatch,
} from './gameTypes'

/*
 * Every call here goes through `apiFetch`, which sets `credentials: 'include'`
 * and owns the single 401 branch for the whole client. Nothing in this file
 * inspects 401 itself.
 *
 * `ProjectApiError` is reused rather than re-declared: these endpoints are
 * project-scoped, they return the same `{ code, message, fields }` error body,
 * and a second error class would mean every component had to test for two.
 */

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * The contract returns `{ items: [...] }`. A bare array is accepted too, for
 * the same reason `parseDocumentList` accepts one: the shape of the envelope is
 * not worth an empty screen if a proxy or a future server version flattens it.
 */
function toItemArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data

  const items = asRecord(data)?.items
  return Array.isArray(items) ? items : []
}

/**
 * Only `id` and `name` are required — they are what identifies an instance to
 * the user and what every action needs. Everything else degrades to a value the
 * UI knows how to render, because dropping a whole list over one cosmetic field
 * would leave the user with no way forward.
 *
 * `platform` degrades to Unity rather than to an empty badge: Unity is the only
 * engine ARTEL-75 can store, so a missing value means the field was omitted,
 * not that the instance belongs to some other engine.
 */
function parseInstance(data: unknown): GameInstance | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asNullableString(record.id)
  const name = asNullableString(record.name)
  if (id === null || name === null) return null

  return {
    id,
    projectId: asString(record.projectId),
    name,
    platform: asString(record.platform, DEFAULT_GAME_PLATFORM),
    instanceKey: asString(record.instanceKey),
    connected: asBoolean(record.connected),
    lastConnectedAt: asString(record.lastConnectedAt),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  }
}

/** `version` is the build's identity to the user, so it is required alongside `id`. */
function parseBuild(data: unknown): GameBuild | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asNullableString(record.id)
  const version = asNullableString(record.version)
  if (id === null || version === null) return null

  return {
    id,
    projectId: asString(record.projectId),
    version,
    label: asNullableString(record.label),
    notes: asNullableString(record.notes),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  }
}

/**
 * A mutation response has to parse: the caller applies it to the screen instead
 * of refetching, so a response we cannot read would silently leave stale data
 * on display. A list can tolerate a dropped row; a single applied entity cannot.
 */
function requireInstance(data: unknown, status: number): GameInstance {
  const instance = parseInstance(data)
  if (instance === null) {
    throw new ProjectApiError(
      status,
      'The server described the game instance oddly.',
      'CLIENT_MALFORMED_INSTANCE',
    )
  }
  return instance
}

function requireBuild(data: unknown, status: number): GameBuild {
  const build = parseBuild(data)
  if (build === null) {
    throw new ProjectApiError(
      status,
      'The server described the build oddly.',
      'CLIENT_MALFORMED_BUILD',
    )
  }
  return build
}

/** Instance and build IDs are opaque strings, so they are escaped, not parsed. */
function instancePath(projectId: string, instanceId: string): string {
  return projectPath(projectId, `/game-instances/${encodeURIComponent(instanceId)}`)
}

function buildPath(projectId: string, buildId: string): string {
  return projectPath(projectId, `/game-builds/${encodeURIComponent(buildId)}`)
}

export async function listGameInstances(
  projectId: string,
  signal?: AbortSignal,
): Promise<GameInstance[]> {
  const response = await apiFetch(projectPath(projectId, '/game-instances'), { signal })
  return toItemArray(await readJson(response))
    .map(parseInstance)
    .filter((instance): instance is GameInstance => instance !== null)
}

/**
 * The response carries the freshly issued `instanceKey` — the whole point of the
 * call, since it is what the developer pastes into Unity. The key is durable and
 * the list endpoint returns it on every row, so this is not a show-once value;
 * losing it costs a reload, not a new instance. There is no endpoint that
 * re-issues it, which is exactly why it must stay readable.
 */
export async function createGameInstance(
  projectId: string,
  draft: GameInstanceDraft,
): Promise<GameInstance> {
  const response = await apiFetch(projectPath(projectId, '/game-instances'), {
    method: 'POST',
    ...jsonRequest(draft),
  })
  return requireInstance(await readJson(response), response.status)
}

export async function updateGameInstance(
  projectId: string,
  instanceId: string,
  patch: GameInstancePatch,
): Promise<GameInstance> {
  const response = await apiFetch(instancePath(projectId, instanceId), {
    method: 'PATCH',
    ...jsonRequest(patch),
  })
  return requireInstance(await readJson(response), response.status)
}

/**
 * Returns `204`, so there is no body to read. Deleting an instance revokes its
 * key; the SDK install that used it stops reporting and cannot be re-linked
 * without a new instance.
 */
export async function deleteGameInstance(projectId: string, instanceId: string): Promise<void> {
  const response = await apiFetch(instancePath(projectId, instanceId), { method: 'DELETE' })
  if (!response.ok) {
    throw await toApiError(response)
  }
}

export async function listGameBuilds(
  projectId: string,
  signal?: AbortSignal,
): Promise<GameBuild[]> {
  const response = await apiFetch(projectPath(projectId, '/game-builds'), { signal })
  return toItemArray(await readJson(response))
    .map(parseBuild)
    .filter((build): build is GameBuild => build !== null)
}

/**
 * Only `label` and `notes` are patchable. `version` is observed from Player
 * Settings on every registration, so there is no endpoint to change it and no
 * control that offers to.
 */
export async function updateGameBuild(
  projectId: string,
  buildId: string,
  patch: GameBuildPatch,
): Promise<GameBuild> {
  const response = await apiFetch(buildPath(projectId, buildId), {
    method: 'PATCH',
    ...jsonRequest(patch),
  })
  return requireBuild(await readJson(response), response.status)
}
