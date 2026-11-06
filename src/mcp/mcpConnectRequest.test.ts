import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildDenyUrl,
  CLIENT_NAME_MAX_LENGTH,
  displayClientName,
  isNavigableUrl,
  readMcpConnectRequest,
} from './mcpConnectRequest'

describe('readMcpConnectRequest', () => {
  it('reads request and client', () => {
    assert.deepEqual(readMcpConnectRequest('?request=abc-123_.~Z&client=Claude%20Code'), {
      requestId: 'abc-123_.~Z',
      clientName: 'Claude Code',
    })
  })

  it('keeps a request without client, leaving the name to the screen', () => {
    assert.deepEqual(readMcpConnectRequest('?request=abc'), { requestId: 'abc', clientName: null })
    assert.deepEqual(readMcpConnectRequest('?request=abc&client=%20%20'), { requestId: 'abc', clientName: null })
  })

  it('refuses a missing or empty request', () => {
    assert.equal(readMcpConnectRequest(''), 'invalidRequest')
    assert.equal(readMcpConnectRequest('?client=x'), 'invalidRequest')
    assert.equal(readMcpConnectRequest('?request='), 'invalidRequest')
  })

  it('refuses characters outside [A-Za-z0-9._~-]', () => {
    for (const value of ['a b', 'a/b', 'a%2Fb', '<script>', 'a?b', 'a&b', '한글', 'a+b']) {
      assert.equal(readMcpConnectRequest(`?request=${encodeURIComponent(value)}`), 'invalidRequest', value)
    }
  })

  it('accepts 128 characters and refuses 129', () => {
    assert.notEqual(readMcpConnectRequest(`?request=${'a'.repeat(128)}`), 'invalidRequest')
    assert.equal(readMcpConnectRequest(`?request=${'a'.repeat(129)}`), 'invalidRequest')
  })
})

describe('displayClientName', () => {
  it('keeps markup as plain text', () => {
    assert.equal(displayClientName('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>')
  })

  it('removes control and bidi characters and collapses whitespace', () => {
    assert.equal(displayClientName('evil‮edoc\u0000\n  agent'), 'eviledoc agent')
  })

  it('caps the length by code point and marks the cut', () => {
    const capped = displayClientName('x'.repeat(CLIENT_NAME_MAX_LENGTH + 10))
    assert.equal(capped, `${'x'.repeat(CLIENT_NAME_MAX_LENGTH)}…`)
    assert.equal(displayClientName('x'.repeat(CLIENT_NAME_MAX_LENGTH)), 'x'.repeat(CLIENT_NAME_MAX_LENGTH))

    // surrogate pair 를 반으로 자르지 않는다.
    const emojiCapped = displayClientName('😀'.repeat(CLIENT_NAME_MAX_LENGTH + 1))
    assert.equal(emojiCapped, `${'😀'.repeat(CLIENT_NAME_MAX_LENGTH)}…`)
  })
})

describe('isNavigableUrl', () => {
  it('accepts http and https', () => {
    assert.equal(isNavigableUrl('https://mcp.example.com/oauth/handoff?token=a.b.c'), true)
    assert.equal(isNavigableUrl('http://localhost:8787/oauth/handoff?token=x'), true)
  })

  it('refuses other schemes, relative paths, and garbage', () => {
    for (const value of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:x',
      'file:///etc/passwd',
      '//evil.example.com',
      '/oauth/handoff',
      '',
      'not a url',
    ]) {
      assert.equal(isNavigableUrl(value), false, value)
    }
  })
})

describe('buildDenyUrl', () => {
  it('appends the deny path and the request', () => {
    assert.equal(
      buildDenyUrl('https://mcp.example.com', 'req-1'),
      'https://mcp.example.com/oauth/handoff/deny?request=req-1',
    )
  })

  it('drops trailing slashes and keeps a base path', () => {
    assert.equal(
      buildDenyUrl('https://example.com/mcp//', 'req-1'),
      'https://example.com/mcp/oauth/handoff/deny?request=req-1',
    )
  })

  it('returns null when the base is unset, empty, or not http(s)', () => {
    assert.equal(buildDenyUrl(undefined, 'req-1'), null)
    assert.equal(buildDenyUrl('', 'req-1'), null)
    assert.equal(buildDenyUrl('   ', 'req-1'), null)
    assert.equal(buildDenyUrl('javascript:alert(1)//', 'req-1'), null)
    assert.equal(buildDenyUrl('mcp.example.com', 'req-1'), null)
  })
})
