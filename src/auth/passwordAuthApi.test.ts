import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { enabledOAuthProviders } from './oauthProviders'
import {
  changePassword,
  getAuthProviders,
  loginWithPassword,
  parseAuthProviders,
  signUpWithPassword,
} from './passwordAuthApi'

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

describe('parseAuthProviders', () => {
  it('reads the three flags', () => {
    assert.deepEqual(parseAuthProviders({ password: true, github: false, signupOpen: true }), {
      password: true,
      github: false,
      signupOpen: true,
    })
  })

  it('treats a missing github or signupOpen flag as false', () => {
    const providers = parseAuthProviders({ password: true })
    assert.equal(providers.github, false)
    assert.equal(providers.signupOpen, false)
  })

  it('throws on a non-object payload', () => {
    assert.throws(() => parseAuthProviders(null))
  })
})

describe('enabledOAuthProviders', () => {
  it('hides GitHub when the server reports github: false', () => {
    const providers = { password: true, github: false, signupOpen: false }
    assert.deepEqual(enabledOAuthProviders(providers), [])
  })

  it('shows GitHub when the server reports github: true', () => {
    const providers = { password: true, github: true, signupOpen: false }
    assert.deepEqual(enabledOAuthProviders(providers).map((provider) => provider.id), ['github'])
  })

  it('shows nothing until the providers are known', () => {
    assert.deepEqual(enabledOAuthProviders(null), [])
  })
})

describe('getAuthProviders', () => {
  it('falls back to the legacy GitHub-only behaviour when the call fails', async () => {
    const providers = await withMockedFetch(() => new Response('', { status: 404 }), () => getAuthProviders())
    assert.equal(providers.github, true)
    assert.equal(providers.signupOpen, false)
  })

  it('reads the server answer', async () => {
    const providers = await withMockedFetch(
      () => new Response(JSON.stringify({ password: true, github: false, signupOpen: true }), { status: 200 }),
      () => getAuthProviders(),
    )
    assert.deepEqual(providers, { password: true, github: false, signupOpen: true })
  })
})

describe('email and password calls', () => {
  it('posts the login body and rejects with the status', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    await assert.rejects(
      withMockedFetch(
        (url, init) => {
          calls.push({ url, init })
          return new Response('', { status: 401 })
        },
        () => loginWithPassword('a@b.co', 'secret'),
      ),
      (error: { status?: number }) => error.status === 401,
    )
    assert.equal(calls[0].url, 'http://localhost:8080/api/auth/login')
    assert.deepEqual(JSON.parse(calls[0].init.body as string), { email: 'a@b.co', password: 'secret' })
  })

  it('posts the signup body with name', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    await withMockedFetch(
      (url, init) => {
        calls.push({ url, init })
        return new Response('{}', { status: 201 })
      },
      () => signUpWithPassword('a@b.co', 'secret', 'Ada'),
    )
    assert.equal(calls[0].url, 'http://localhost:8080/api/auth/signup')
    assert.deepEqual(JSON.parse(calls[0].init.body as string), { email: 'a@b.co', password: 'secret', name: 'Ada' })
  })

  it('posts the password change body', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    await withMockedFetch(
      (url, init) => {
        calls.push({ url, init })
        return new Response(null, { status: 204 })
      },
      () => changePassword('old', 'new'),
    )
    assert.equal(calls[0].url, 'http://localhost:8080/api/auth/password')
    assert.deepEqual(JSON.parse(calls[0].init.body as string), { currentPassword: 'old', newPassword: 'new' })
  })
})

describe('error codes', () => {
  it('keeps the server code on a refused login', async () => {
    await assert.rejects(
      withMockedFetch(
        () => new Response(JSON.stringify({ code: 'too_many_attempts', message: 'x', fields: {} }), { status: 429 }),
        () => loginWithPassword('a@b.co', 'secret'),
      ),
      (error: { status?: number; code?: string }) => error.status === 429 && error.code === 'too_many_attempts',
    )
  })

  it('keeps the server code on a refused password change', async () => {
    await assert.rejects(
      withMockedFetch(
        () => new Response(JSON.stringify({ code: 'same_password' }), { status: 400 }),
        () => changePassword('old', 'old'),
      ),
      (error: { code?: string }) => error.code === 'same_password',
    )
  })

  it('falls back to an empty code when the body is not JSON', async () => {
    await assert.rejects(
      withMockedFetch(() => new Response('nope', { status: 500 }), () => signUpWithPassword('a@b.co', 'secret12', 'Ada')),
      (error: { code?: string }) => error.code === '',
    )
  })
})
