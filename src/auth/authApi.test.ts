import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuthApiError, parseAuthUser, registerEmail, verifyEmail } from './authApi'
import {
  composeNicknameTag,
  isEmailValid,
  parseNicknameTag,
  toAccountProfileDraft,
} from './authTypes'

/*
 * `ARTEL-731` renames the old player-handle field to `userTag` and drops its
 * client-side format check — the server now generates the tag, so the browser
 * never validates its shape. `nickname` and `userTag` are both required on the
 * session payload, so the only new logic on this side of that contract is:
 * parsing them, refusing a payload missing either one, trimming a nickname
 * candidate for the wire, and composing the `nickname#userTag` display form
 * both this screen and the member list need.
 */

const sessionPayload = {
  id: '52',
  displayName: 'octocat',
  email: 'octocat@example.com',
  emailVerified: true,
  pendingEmail: null,
  nickname: 'The Octocat',
  userTag: '1234',
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
    assert.equal(user.userTag, '1234')
  })

  it('throws on a session missing a nickname or userTag rather than inventing one', () => {
    assert.throws(() => parseAuthUser({ ...sessionPayload, nickname: undefined }))
    assert.throws(() => parseAuthUser({ ...sessionPayload, userTag: undefined }))
  })

  it('throws on a non-string nickname or userTag', () => {
    assert.throws(() => parseAuthUser({ ...sessionPayload, nickname: 12 }))
    assert.throws(() => parseAuthUser({ ...sessionPayload, userTag: {} }))
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
  it('trims the nickname', () => {
    assert.deepEqual(toAccountProfileDraft('  Ash  '), { nickname: 'Ash' })
  })

  it('trims a whitespace-only nickname down to an empty string rather than null', () => {
    assert.deepEqual(toAccountProfileDraft('   '), { nickname: '' })
  })
})

describe('composeNicknameTag', () => {
  it('joins the nickname and userTag with "#"', () => {
    assert.equal(composeNicknameTag('Ash', '1234'), 'Ash#1234')
  })

  it('does not assume the tag is four digits wide', () => {
    assert.equal(composeNicknameTag('Ash', '123456'), 'Ash#123456')
  })
})

/*
 * `ARTEL-735` reads the composed form back: the invite field lets someone paste
 * `Yuni#0042` instead of picking from the suggestion list, so the same format
 * now has to be split as well as joined. The server's `UserHandle.parse` makes
 * the same three decisions — split at the last separator, digits only in the
 * tag, and a `null` for anything else — and a disagreement here would send a
 * different string to be looked up than the one the person typed.
 */
describe('parseNicknameTag', () => {
  it('splits the composed form back into its two halves', () => {
    assert.deepEqual(parseNicknameTag('Yuni#0042'), { nickname: 'Yuni', userTag: '0042' })
    assert.deepEqual(parseNicknameTag(composeNicknameTag('Ash', '123456')), {
      nickname: 'Ash',
      userTag: '123456',
    })
  })

  // A nickname may contain the separator; a userTag never can, so the last one
  // is the boundary.
  it('splits at the last separator', () => {
    assert.deepEqual(parseNicknameTag('a#b#0001'), { nickname: 'a#b', userTag: '0001' })
  })

  it('rejects text that is not in that form', () => {
    assert.equal(parseNicknameTag('Yuni'), null)
    assert.equal(parseNicknameTag('Yuni#'), null)
    assert.equal(parseNicknameTag('Yuni#00a2'), null)
    assert.equal(parseNicknameTag('#0042'), null)
    assert.equal(parseNicknameTag('hubot@example.com'), null)
    assert.equal(parseNicknameTag(''), null)
  })
})
