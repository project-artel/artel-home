import { apiFetch } from '../auth/authApi'
import { asRecord, jsonRequest, projectPath, readJson, toApiError } from './projectApi'

export const IDENTITY_KINDS = ['ordinal', 'enum', 'id', 'flag', 'text'] as const
export const IDENTITY_ROLES = ['current', 'progress', 'other'] as const
export interface GameIdentityDeclaration {
  name: string
  kind: typeof IDENTITY_KINDS[number]
  base: number | null
  meaning: string
  changesWhen: string
  identifies: string
  role: typeof IDENTITY_ROLES[number]
}
export interface GameIdentity extends GameIdentityDeclaration {
  id: string
  gameBuildId: string
  version: number
  revisionId: string
  source: 'SDK' | 'MCP' | 'WEB' | 'LEGACY'
  deleted: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}
export interface PutGameIdentity extends GameIdentityDeclaration {
  gameBuildId: string
  expectedVersion: number
}

export function parseGameIdentity(value: unknown): GameIdentity {
  const record = asRecord(value)
  const strings = ['id', 'name', 'gameBuildId', 'revisionId', 'meaning', 'changesWhen', 'identifies', 'createdAt', 'updatedAt']
  if (!record || strings.some((key) => typeof record[key] !== 'string') ||
      !IDENTITY_KINDS.some((kind) => kind === record.kind) ||
      !IDENTITY_ROLES.some((role) => role === record.role) ||
      !['SDK', 'MCP', 'WEB', 'LEGACY'].includes(String(record.source)) ||
      !Number.isSafeInteger(record.version) || Number(record.version) < 1 ||
      typeof record.deleted !== 'boolean' ||
      (record.base !== null && record.base !== 0 && record.base !== 1) ||
      (record.createdBy !== null && typeof record.createdBy !== 'string')) {
    throw new Error('Invalid game identity response')
  }
  return record as unknown as GameIdentity
}

export function parseGameIdentityList(value: unknown): GameIdentity[] {
  const identities = asRecord(value)?.identities
  if (!Array.isArray(identities)) throw new Error('Invalid game identity list response')
  return identities.map(parseGameIdentity)
}

export function identityExpectedVersion(identities: GameIdentity[], name: string): number {
  return identities.find((identity) => identity.name === name)?.version ?? 0
}

export async function listGameIdentities(projectId: string, gameBuildId: string, signal?: AbortSignal): Promise<GameIdentity[]> {
  const query = new URLSearchParams({ gameBuildId, includeDeleted: 'true' })
  const response = await apiFetch(`${projectPath(projectId, '/game-identities')}?${query}`, { signal })
  return parseGameIdentityList(await readJson(response))
}

export async function listGameIdentityHistory(projectId: string, name: string, signal?: AbortSignal): Promise<GameIdentity[]> {
  const query = new URLSearchParams({ name })
  const response = await apiFetch(`${projectPath(projectId, '/game-identities/history')}?${query}`, { signal })
  return parseGameIdentityList(await readJson(response))
}

export async function putGameIdentity(projectId: string, identity: PutGameIdentity): Promise<GameIdentity> {
  const response = await apiFetch(projectPath(projectId, '/game-identities'), { method: 'PUT', ...jsonRequest(identity) })
  return parseGameIdentity(await readJson(response))
}

export async function deleteGameIdentity(projectId: string, identity: GameIdentity): Promise<void> {
  const query = new URLSearchParams({ name: identity.name, gameBuildId: identity.gameBuildId, expectedVersion: String(identity.version) })
  const response = await apiFetch(`${projectPath(projectId, '/game-identities')}?${query}`, { method: 'DELETE' })
  if (!response.ok) throw await toApiError(response)
}
