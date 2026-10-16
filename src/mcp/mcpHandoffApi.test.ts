import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { messages } from '../i18n/messages'
import { ProjectApiError } from '../projects/projectApi'
import {
  createMcpHandoff,
  handoffFailure,
  MALFORMED_HANDOFF_CODE,
  parseHandoffRedirect,
} from './mcpHandoffApi'

/** `cliTokenApi.test.ts` 와 같은 모양. 이 프로젝트에는 mocking 라이브러리가 없다. */
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('parseHandoffRedirect', () => {
  it('returns an http(s) redirectUrl', () => {
    const redirectUrl = 'https://mcp.example.com/oauth/handoff?token=a.b.c'
    assert.equal(parseHandoffRedirect({ redirectUrl }), redirectUrl)
  })

  it('refuses a missing, non-string, or non-http(s) redirectUrl', () => {
    for (const body of [
      null,
      {},
      { redirectUrl: 42 },
      { redirectUrl: '' },
      { redirectUrl: 'javascript:alert(1)' },
      { redirectUrl: '/oauth/handoff?token=x' },
    ]) {
      assert.throws(
        () => parseHandoffRedirect(body),
        (error: unknown) => error instanceof ProjectApiError && error.code === MALFORMED_HANDOFF_CODE,
      )
    }
  })
})

describe('createMcpHandoff', () => {
  it('posts the requestId with the session cookie and returns redirectUrl', async () => {
    let seenUrl = ''
    let seenInit: RequestInit = {}
    const redirectUrl = await withMockedFetch(
      (url, init) => {
        seenUrl = url
        seenInit = init
        return jsonResponse(200, { redirectUrl: 'https://mcp.example.com/oauth/handoff?token=t' })
      },
      () => createMcpHandoff('req-1'),
    )

    assert.equal(redirectUrl, 'https://mcp.example.com/oauth/handoff?token=t')
    assert.match(seenUrl, /\/api\/mcp\/handoffs$/)
    assert.equal(seenInit.method, 'POST')
    assert.equal(seenInit.credentials, 'include')
    assert.deepEqual(JSON.parse(String(seenInit.body)), { requestId: 'req-1' })
  })

  it('throws a ProjectApiError carrying the status and code', async () => {
    await assert.rejects(
      withMockedFetch(
        () => jsonResponse(503, { code: 'mcp_handoff_not_configured', message: 'not configured' }),
        () => createMcpHandoff('req-1'),
      ),
      (error: unknown) =>
        error instanceof ProjectApiError && error.status === 503 && error.code === 'mcp_handoff_not_configured',
    )
  })
})

describe('handoffFailure', () => {
  for (const locale of ['ko', 'en'] as const) {
    const t = messages[locale]
    const copy = t.common.mcpConnect

    it(`${locale}: 503 mcp_handoff_not_configured is final`, () => {
      const error = new ProjectApiError(503, 'x', 'mcp_handoff_not_configured')
      assert.deepEqual(handoffFailure(error, t), { message: copy.notConfigured, isRetryable: false })
    })

    it(`${locale}: 400 asks to start again from the agent`, () => {
      const error = new ProjectApiError(400, 'request expired', 'mcp_handoff_request_invalid')
      assert.deepEqual(handoffFailure(error, t), { message: copy.invalidHandoff, isRetryable: false })
    })

    it(`${locale}: an unusable redirectUrl can be retried`, () => {
      const error = new ProjectApiError(200, 'x', MALFORMED_HANDOFF_CODE)
      assert.deepEqual(handoffFailure(error, t), { message: copy.malformedRedirect, isRetryable: true })
    })

    it(`${locale}: other server errors fall back to apiErrorMessage`, () => {
      assert.deepEqual(handoffFailure(new ProjectApiError(500, 'boom'), t), { message: 'boom', isRetryable: true })
      assert.deepEqual(
        handoffFailure(new ProjectApiError(502, 'x', 'CLIENT_GENERIC'), t),
        { message: t.projects.apiErrors.CLIENT_GENERIC, isRetryable: true },
      )
    })

    it(`${locale}: a network failure gets the generic message`, () => {
      assert.deepEqual(
        handoffFailure(new TypeError('Failed to fetch'), t),
        { message: t.projects.apiErrors.CLIENT_GENERIC, isRetryable: true },
      )
    })
  }
})
