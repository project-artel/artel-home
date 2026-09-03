import { apiFetch } from './authApi'
import type { CliToken, CliTokenCreated } from './cliTokenTypes'

/*
 * `artel-cli` 인증에 쓰는 CLI 토큰을 발급·조회·폐기한다. `ARTEL-780` 이 세운 계약을 그대로
 * 소비한다 — `authApi.ts` 의 `apiFetch` 를 그대로 써서 401 재시도를 다시 구현하지 않는다.
 */

function asRecord(data: unknown): Record<string, unknown> | null {
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * `id`/`name`/`createdAt` 이 없거나 빈 문자열이면 줄을 버린다 — 무엇을 가리키는지도, 언제
 * 만들었는지도 말할 수 없는 줄은 목록에 그릴 수 없다. `lastUsedAt`/`expiresAt`/`revokedAt` 은
 * 문자열이 아니면 `null` 로 내린다 — 셋 다 원래도 `null` 일 수 있는 값이라, 못 읽은 값과 정말
 * 없는 값을 구분하지 않는다.
 */
export function parseCliToken(data: unknown): CliToken | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asNullableString(record.id)
  const name = asNullableString(record.name)
  const createdAt = asNullableString(record.createdAt)
  if (id === null || id.length === 0 || name === null || name.length === 0 || createdAt === null || createdAt.length === 0) {
    return null
  }

  return {
    id,
    name,
    createdAt,
    lastUsedAt: asNullableString(record.lastUsedAt),
    expiresAt: asNullableString(record.expiresAt),
    revokedAt: asNullableString(record.revokedAt),
  }
}

/**
 * 발급 응답을 읽는다. `token` 이 비어 있지 않은 문자열이 아니면 던진다 — `createSdkLoginCode`
 * 가 발급한 code 를 검증하는 것과 같은 엄격도다. 이 응답에서 원문이 잘못되면 화면이 대신 채울
 * 안전한 기본값이 없다: 발급은 성공했는데 사용자가 볼 원문이 없는 채로 두는 것보다는, 화면이
 * 그 자리에서 실패로 말하는 쪽이 낫다.
 */
export function parseCliTokenCreated(data: unknown): CliTokenCreated {
  const record = asRecord(data)
  const id = record !== null ? asNullableString(record.id) : null
  const name = record !== null ? asNullableString(record.name) : null
  const createdAt = record !== null ? asNullableString(record.createdAt) : null
  const token = record !== null ? asNullableString(record.token) : null

  if (
    id === null || id.length === 0
    || name === null || name.length === 0
    || createdAt === null || createdAt.length === 0
    || token === null || token.length === 0
  ) {
    throw new Error('The server did not return a usable CLI token')
  }

  return {
    id,
    name,
    token,
    createdAt,
    expiresAt: record !== null ? asNullableString(record.expiresAt) : null,
  }
}

export async function listCliTokens(signal?: AbortSignal): Promise<CliToken[]> {
  const response = await apiFetch('/api/auth/cli-tokens', { signal })
  if (!response.ok) {
    throw new Error('Unable to load the CLI token list')
  }

  const data: unknown = await response.json()
  const rows = Array.isArray(data) ? data : []
  return rows.map(parseCliToken).filter((token): token is CliToken => token !== null)
}

export async function createCliToken(
  name: string,
  expiresInDays: number | null,
): Promise<CliTokenCreated> {
  const response = await apiFetch('/api/auth/cli-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, expiresInDays }),
  })

  if (!response.ok) {
    throw new Error('Unable to issue a CLI token')
  }

  return parseCliTokenCreated(await response.json())
}

/**
 * 폐기는 `204` 라 본문이 없다 — `revokeInvitation` 과 같은 모양으로, 성공 여부만 본다.
 */
export async function deleteCliToken(id: string): Promise<void> {
  const response = await apiFetch(`/api/auth/cli-tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Unable to revoke the CLI token')
  }
}
