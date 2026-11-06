import assert from 'node:assert/strict'
import { it } from 'node:test'
import { matchRoutes } from 'react-router-dom'

import.meta.env.BASE_URL = '/console/'
const { appBasename, appPath } = await import('./appPath')
const { SDK_LOGIN_PATH, resumeSdkLogin } = await import('./auth/sdkLoginRequest')
const { MCP_CONNECT_PATH, resumeMcpConnect } = await import('./mcp/mcpConnectRequest')
const { getOAuthLoginUrl } = await import('./auth/authApi')

it('/console 및 하위 경로에서 basename을 적용한다', () => {
  assert.equal(appBasename, '/console')
  const routes = [{ path: '/' }, { path: '/projects/:projectId' }]
  assert.ok(matchRoutes(routes, '/console', appBasename))
  assert.ok(matchRoutes(routes, '/console/projects/123', appBasename))
  assert.equal(matchRoutes(routes, '/console-other', appBasename), null)
  assert.equal(appPath('/artel-mark.svg'), '/console/artel-mark.svg')
})

it('SDK와 MCP 연결 요청을 /console 안에서 재개한다', () => {
  const stored = new Map([
    ['artel.sdkLoginRequest', '?challenge=abc&port=5000&state=xyz'],
    ['artel.mcpConnectRequest', '?request=abc&client=editor'],
  ])
  const destinations: string[] = []
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => stored.get(key) ?? null,
    removeItem: (key: string) => stored.delete(key),
  } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { replace: (url: string) => destinations.push(url) },
  } })
  assert.equal(SDK_LOGIN_PATH, '/console/sdk-login')
  assert.equal(MCP_CONNECT_PATH, '/console/mcp/connect')
  resumeSdkLogin()
  assert.equal(resumeMcpConnect(), true)
  assert.deepEqual(destinations, [
    '/console/sdk-login?challenge=abc&port=5000&state=xyz',
    '/console/mcp/connect?request=abc&client=editor',
  ])
  assert.equal(stored.size, 0)
})

it('OAuth 복귀 주소에 subpath와 요청 값을 보존하고 이전 오류를 제거한다', () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: {
      origin: 'https://artel.kr',
      href: 'https://artel.kr/console/mcp/connect?request=abc&auth_error=oauth&error=server',
    },
  } })
  const url = new URL(getOAuthLoginUrl('/oauth2/authorization/github'))
  assert.equal(url.pathname, '/oauth2/authorization/github')
  assert.equal(url.searchParams.get('return_to'), 'https://artel.kr/console/mcp/connect?request=abc')
})
