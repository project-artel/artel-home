import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCliToken, deleteCliToken, parseCliToken, parseCliTokenCreated } from './cliTokenApi'
import { isCliTokenExpired, type CliToken } from './cliTokenTypes'

/*
 * `ARTEL-780` 이 서버 쪽을 세우기 전이라, 이 테스트는 계약 문서(`POST/GET/DELETE
 * /api/auth/cli-tokens`)에 맞춰 쓴 것이지 실제 서버로 확인한 것이 아니다. `authApi.test.ts` 와
 * 같은 `withMockedFetch` 모양을 그대로 복제한다.
 */

/**
 * `globalThis.fetch` 를 `handler` 로 바꿔 `run` 이 도는 동안만 쓰게 한다 — 아래 요청 함수들은
 * `apiFetch` 를 거쳐 실제 `fetch` 에 닿으므로, 이 프로젝트가 mocking 라이브러리를 두지 않은
 * 상태에서 가로챌 수 있는 유일한 자리다.
 */
async function withMockedFetch<T>(
  handler: (url: string, init: RequestInit) => Response,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch

  try {
    return await run()
  } finally {
    globalThis.fetch = originalFetch
  }
}

const validToken = {
  id: 'token-1',
  name: 'laptop',
  createdAt: '2026-01-01T00:00:00Z',
  lastUsedAt: '2026-02-01T00:00:00Z',
  expiresAt: '2026-04-01T00:00:00Z',
  revokedAt: null,
}

describe('parseCliToken', () => {
  it('reads a token with every field present', () => {
    assert.deepEqual(parseCliToken(validToken), validToken)
  })

  it('drops an element missing id, name, or createdAt', () => {
    assert.equal(parseCliToken({ ...validToken, id: undefined }), null)
    assert.equal(parseCliToken({ ...validToken, name: undefined }), null)
    assert.equal(parseCliToken({ ...validToken, createdAt: undefined }), null)
    assert.equal(parseCliToken({ ...validToken, id: '' }), null)
  })

  it('degrades a missing lastUsedAt, expiresAt, or revokedAt to null', () => {
    const token = parseCliToken({
      ...validToken,
      lastUsedAt: undefined,
      expiresAt: undefined,
      revokedAt: undefined,
    })
    assert.deepEqual(token, { ...validToken, lastUsedAt: null, expiresAt: null, revokedAt: null })
  })

  it('carries an explicit null through for lastUsedAt, expiresAt, and revokedAt', () => {
    const token = parseCliToken({ ...validToken, lastUsedAt: null, expiresAt: null, revokedAt: null })
    assert.deepEqual(token, { ...validToken, lastUsedAt: null, expiresAt: null, revokedAt: null })
  })
})

describe('parseCliTokenCreated', () => {
  const created = {
    id: 'token-1',
    name: 'laptop',
    token: 'artel_cli_secret',
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: '2026-04-01T00:00:00Z',
  }

  it('reads a response carrying the plaintext token', () => {
    assert.deepEqual(parseCliTokenCreated(created), created)
  })

  it('throws when token is missing', () => {
    assert.throws(() => parseCliTokenCreated({ ...created, token: undefined }))
  })

  it('throws when token is an empty string', () => {
    assert.throws(() => parseCliTokenCreated({ ...created, token: '' }))
  })

  it('reads a null expiresAt as unlimited', () => {
    const token = parseCliTokenCreated({ ...created, expiresAt: null })
    assert.equal(token.expiresAt, null)
  })
})

describe('createCliToken', () => {
  it('sends the name and a numeric expiresInDays in the request body', async () => {
    const calls: { url: string; init: RequestInit }[] = []

    await withMockedFetch(
      (url, init) => {
        calls.push({ url, init })
        return new Response(JSON.stringify({
          id: 'token-1',
          name: 'laptop',
          token: 'artel_cli_secret',
          createdAt: '2026-01-01T00:00:00Z',
          expiresAt: '2026-04-01T00:00:00Z',
        }), { status: 201 })
      },
      () => createCliToken('laptop', 90),
    )

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'http://localhost:8080/api/auth/cli-tokens')
    assert.equal(calls[0].init.method, 'POST')
    assert.deepEqual(JSON.parse(calls[0].init.body as string), { name: 'laptop', expiresInDays: 90 })
  })

  it('sends a null expiresInDays for an unlimited token', async () => {
    const calls: { url: string; init: RequestInit }[] = []

    await withMockedFetch(
      (url, init) => {
        calls.push({ url, init })
        return new Response(JSON.stringify({
          id: 'token-1',
          name: 'laptop',
          token: 'artel_cli_secret',
          createdAt: '2026-01-01T00:00:00Z',
          expiresAt: null,
        }), { status: 201 })
      },
      () => createCliToken('laptop', null),
    )

    assert.deepEqual(JSON.parse(calls[0].init.body as string), { name: 'laptop', expiresInDays: null })
  })

  it('throws when the response is not ok', async () => {
    await assert.rejects(
      () => withMockedFetch(() => new Response(null, { status: 500 }), () => createCliToken('laptop', 90)),
    )
  })
})

describe('deleteCliToken', () => {
  it('resolves on a 204 with no body, without trying to read one', async () => {
    await withMockedFetch(
      () => new Response(null, { status: 204 }),
      () => deleteCliToken('token-1'),
    )
  })

  it('sends a DELETE to the token path', async () => {
    const calls: { url: string; init: RequestInit }[] = []

    await withMockedFetch(
      (url, init) => {
        calls.push({ url, init })
        return new Response(null, { status: 204 })
      },
      () => deleteCliToken('token-1'),
    )

    assert.equal(calls[0].url, 'http://localhost:8080/api/auth/cli-tokens/token-1')
    assert.equal(calls[0].init.method, 'DELETE')
  })

  it('throws when the response is not ok', async () => {
    await assert.rejects(
      () => withMockedFetch(() => new Response(null, { status: 404 }), () => deleteCliToken('token-1')),
    )
  })
})

describe('isCliTokenExpired', () => {
  const baseToken: CliToken = {
    id: 'token-1',
    name: 'laptop',
    createdAt: '2026-01-01T00:00:00Z',
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
  }

  it('is always false when expiresAt is null', () => {
    assert.equal(isCliTokenExpired(baseToken, Date.now()), false)
  })

  it('is false before the expiry instant', () => {
    const token: CliToken = { ...baseToken, expiresAt: '2026-01-10T00:00:00Z' }
    const before = Date.parse('2026-01-09T23:59:59Z')
    assert.equal(isCliTokenExpired(token, before), false)
  })

  it('is true exactly at the expiry instant, matching isInvitationExpired\'s <= boundary', () => {
    const token: CliToken = { ...baseToken, expiresAt: '2026-01-10T00:00:00Z' }
    const atExpiry = Date.parse('2026-01-10T00:00:00Z')
    assert.equal(isCliTokenExpired(token, atExpiry), true)
  })

  it('is true after the expiry instant', () => {
    const token: CliToken = { ...baseToken, expiresAt: '2026-01-10T00:00:00Z' }
    const after = Date.parse('2026-01-11T00:00:00Z')
    assert.equal(isCliTokenExpired(token, after), true)
  })
})
