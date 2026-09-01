import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuthApiError, parseAuthUser, registerEmail, verifyEmail } from './authApi'
import { isBattleTagValid, isEmailValid, resolveDisplayNickname, toAccountProfileDraft } from './authTypes'

/*
 * `ARTEL-730` adds `nickname` and `battleTag` to the session payload. The only new
 * logic on this side of that contract is: how the two fields degrade when the
 * session omits them, how a BattleTag candidate is judged, how a form's two text
 * fields become the wire payload, and what the screen shows when nickname is unset.
 */

const sessionPayload = {
  id: '52',
  displayName: 'octocat',
  email: 'octocat@example.com',
  emailVerified: true,
  pendingEmail: null,
  nickname: 'The Octocat',
  battleTag: 'Octocat#1234',
  locale: null,
  identities: [],
}

/**
 * Swaps `globalThis.fetch` for `handler` while `run` executes, then restores
 * the original — the request builders below call `apiFetch`, which reaches
 * the real `fetch`, and this is the only seam available to intercept it
 * without a mocking library this project does not depend on.
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

describe('parseAuthUser', () => {
  it('reads a session that carries both fields', () => {
    const user = parseAuthUser(sessionPayload)
    assert.equal(user.nickname, 'The Octocat')
    assert.equal(user.battleTag, 'Octocat#1234')
  })

  it('degrades a missing nickname or BattleTag to null rather than dropping the session', () => {
    const user = parseAuthUser({ ...sessionPayload, nickname: undefined, battleTag: undefined })
    assert.equal(user.nickname, null)
    assert.equal(user.battleTag, null)
  })

  it('degrades a non-string nickname or BattleTag to null', () => {
    const user = parseAuthUser({ ...sessionPayload, nickname: 12, battleTag: {} })
    assert.equal(user.nickname, null)
    assert.equal(user.battleTag, null)
  })

  it('reads a session that carries a verified email and no pending one', () => {
    const user = parseAuthUser(sessionPayload)
    assert.equal(user.emailVerified, true)
    assert.equal(user.pendingEmail, null)
  })

  it('reads a session mid-verification', () => {
    const user = parseAuthUser({ ...sessionPayload, emailVerified: false, pendingEmail: 'new@example.com' })
    assert.equal(user.emailVerified, false)
    assert.equal(user.pendingEmail, 'new@example.com')
  })

  it('degrades a missing emailVerified or pendingEmail to "not verified" rather than dropping the session', () => {
    const user = parseAuthUser({ ...sessionPayload, emailVerified: undefined, pendingEmail: undefined })
    assert.equal(user.emailVerified, false)
    assert.equal(user.pendingEmail, null)
  })

  it('degrades a wrong-typed emailVerified or pendingEmail the same way', () => {
    const user = parseAuthUser({ ...sessionPayload, emailVerified: 'true', pendingEmail: 12 })
    assert.equal(user.emailVerified, false)
    assert.equal(user.pendingEmail, null)
  })
})

describe('registerEmail', () => {
  it('posts the trimmed email address and resolves on 202', async () => {
    const calls: { url: string; init: RequestInit }[] = []

    await withMockedFetch(
      (url, init) => {
        calls.push({ url, init })
        return new Response(null, { status: 202 })
      },
      () => registerEmail('octocat@example.com'),
    )

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'http://localhost:8080/api/auth/me/email')
    assert.equal(calls[0].init.method, 'POST')
    assert.deepEqual(JSON.parse(calls[0].init.body as string), { email: 'octocat@example.com' })
  })

  it('throws an AuthApiError carrying 409 when another verified account already holds the address', async () => {
    await assert.rejects(
      () => withMockedFetch(() => new Response(null, { status: 409 }), () => registerEmail('octocat@example.com')),
      (error: unknown) => error instanceof AuthApiError && error.status === 409,
    )
  })

  it('throws an AuthApiError for any other non-202 response', async () => {
    await assert.rejects(
      () => withMockedFetch(() => new Response(null, { status: 500 }), () => registerEmail('octocat@example.com')),
      (error: unknown) => error instanceof AuthApiError && error.status === 500,
    )
  })
})

describe('verifyEmail', () => {
  it('posts the token and resolves on 204', async () => {
    const calls: { url: string; init: RequestInit }[] = []

    await withMockedFetch(
      (url, init) => {
        calls.push({ url, init })
        return new Response(null, { status: 204 })
      },
      () => verifyEmail('the-token'),
    )

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'http://localhost:8080/api/auth/me/email/verify')
    assert.equal(calls[0].init.method, 'POST')
    assert.deepEqual(JSON.parse(calls[0].init.body as string), { token: 'the-token' })
  })

  it('throws an AuthApiError carrying 400 for a token that is unknown, expired, or already used', async () => {
    await assert.rejects(
      () => withMockedFetch(() => new Response(null, { status: 400 }), () => verifyEmail('bad-token')),
      (error: unknown) => error instanceof AuthApiError && error.status === 400,
    )
  })
})

describe('isBattleTagValid', () => {
  it('accepts a name, "#", and 1 to 8 digits', () => {
    assert.equal(isBattleTagValid('Ashbringer#1'), true)
    assert.equal(isBattleTagValid('Ashbringer#12345678'), true)
  })

  it('rejects a missing or malformed separator', () => {
    assert.equal(isBattleTagValid('Ashbringer1234'), false)
    assert.equal(isBattleTagValid('Ashbringer#'), false)
  })

  it('rejects more than 8 digits', () => {
    assert.equal(isBattleTagValid('Ashbringer#123456789'), false)
  })

  it('rejects a name longer than 24 characters', () => {
    assert.equal(isBattleTagValid(`${'a'.repeat(25)}#1234`), false)
  })

  it('rejects a second "#" inside the name', () => {
    assert.equal(isBattleTagValid('Ash#bringer#1234'), false)
  })
})

describe('isEmailValid', () => {
  it('accepts a local part, "@", and a domain with a dot', () => {
    assert.equal(isEmailValid('octocat@example.com'), true)
    assert.equal(isEmailValid('octo.cat+test@sub.example.com'), true)
  })

  it('rejects a missing "@" or domain dot', () => {
    assert.equal(isEmailValid('octocat.example.com'), false)
    assert.equal(isEmailValid('octocat@example'), false)
  })

  it('rejects whitespace inside either half', () => {
    assert.equal(isEmailValid('octo cat@example.com'), false)
    assert.equal(isEmailValid('octocat@exam ple.com'), false)
  })

  it('rejects an address longer than 320 characters', () => {
    const longLocalPart = 'a'.repeat(310)
    assert.equal(isEmailValid(`${longLocalPart}@example.com`), false)
  })
})

describe('toAccountProfileDraft', () => {
  it('trims both fields', () => {
    assert.deepEqual(toAccountProfileDraft('  Ash  ', '  Ashbringer#1234  '), {
      nickname: 'Ash',
      battleTag: 'Ashbringer#1234',
    })
  })

  it('turns an empty or whitespace-only field into null, not an empty string', () => {
    assert.deepEqual(toAccountProfileDraft('', '   '), { nickname: null, battleTag: null })
  })
})

describe('resolveDisplayNickname', () => {
  it('prints the chosen nickname when one is set', () => {
    assert.equal(resolveDisplayNickname({ displayName: 'octocat', nickname: 'The Octocat' }), 'The Octocat')
  })

  it('falls back to displayName when nickname is unset', () => {
    assert.equal(resolveDisplayNickname({ displayName: 'octocat', nickname: null }), 'octocat')
  })
})
