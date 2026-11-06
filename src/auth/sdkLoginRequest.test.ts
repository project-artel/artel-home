import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SDK_LOGIN_PATH, parkRequest, readRelayRequest, resumeSdkLogin } from './sdkLoginRequest'

describe('readRelayRequest', () => {
  it('parses a well-formed SDK address with no kind', () => {
    const request = readRelayRequest('?challenge=abc&port=5000&state=xyz')
    assert.deepEqual(request, { challenge: 'abc', port: 5000, state: 'xyz', kind: 'sdk' })
  })

  it('defaults an absent kind to "sdk", so links minted before the CLI existed still work', () => {
    const request = readRelayRequest('?challenge=abc&port=5000&state=xyz')
    assert.notEqual(typeof request, 'string')
    assert.equal((request as { kind: string }).kind, 'sdk')
  })

  it('parses a kind=cli address', () => {
    const request = readRelayRequest('?challenge=abc&port=5000&state=xyz&kind=cli')
    assert.deepEqual(request, { challenge: 'abc', port: 5000, state: 'xyz', kind: 'cli' })
  })

  it('rejects a kind the server does not know as invalidKind', () => {
    assert.equal(readRelayRequest('?challenge=abc&port=5000&state=xyz&kind=unity'), 'invalidKind')
  })

  it('rejects a port outside 1024-65535 as invalidPort', () => {
    assert.equal(readRelayRequest('?challenge=abc&port=80&state=xyz'), 'invalidPort')
    assert.equal(readRelayRequest('?challenge=abc&state=xyz'), 'invalidPort')
  })

  it('rejects a port carrying more than digits, rather than parsing its leading number', () => {
    assert.equal(readRelayRequest('?challenge=abc&port=5000/evil&state=xyz'), 'invalidPort')
  })

  it('rejects a missing challenge or state as missingRequest', () => {
    assert.equal(readRelayRequest('?port=5000&state=xyz'), 'missingRequest')
    assert.equal(readRelayRequest('?challenge=abc&port=5000'), 'missingRequest')
  })
})

/**
 * `parkRequest` and `resumeSdkLogin` have no DOM under `node --test`, so these
 * stand in a minimal `window` and `sessionStorage` for the duration of the
 * test rather than pulling in a browser environment this project does not
 * otherwise depend on.
 */
function withMockedBrowser<T>(search: string, run: (replayed: string[]) => T): T {
  const store = new Map<string, string>()
  const replayed: string[] = []

  const originalWindow = (globalThis as { window?: unknown }).window
  const originalSessionStorage = (globalThis as { sessionStorage?: unknown }).sessionStorage

  ;(globalThis as { window: unknown }).window = {
    location: {
      search,
      replace: (url: string) => replayed.push(url),
    },
  }
  ;(globalThis as { sessionStorage: unknown }).sessionStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }

  try {
    return run(replayed)
  } finally {
    ;(globalThis as { window?: unknown }).window = originalWindow
    ;(globalThis as { sessionStorage?: unknown }).sessionStorage = originalSessionStorage
  }
}

describe('parkRequest / resumeSdkLogin', () => {
  it('carries kind=cli through a park-and-resume round trip, because the parked search is replayed verbatim', () => {
    withMockedBrowser('?challenge=abc&port=5000&state=xyz&kind=cli', (replayed) => {
      parkRequest()
      resumeSdkLogin()

      assert.deepEqual(replayed, [`${SDK_LOGIN_PATH}?challenge=abc&port=5000&state=xyz&kind=cli`])
    })
  })

  it('carries an address with no kind through the same round trip', () => {
    withMockedBrowser('?challenge=abc&port=5000&state=xyz', (replayed) => {
      parkRequest()
      resumeSdkLogin()

      assert.deepEqual(replayed, [`${SDK_LOGIN_PATH}?challenge=abc&port=5000&state=xyz`])
    })
  })

  it('does nothing when nothing was parked', () => {
    withMockedBrowser('', (replayed) => {
      resumeSdkLogin()

      assert.deepEqual(replayed, [])
    })
  })
})
