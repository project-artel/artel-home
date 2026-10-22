/**
 * `artel-macro-mcp` 가 사용자를 home 으로 보내며 붙이는 주소와, 거절했을 때 되돌려 보낼 주소.
 *
 * 계약은 `.plan/general/2026-10-15-developer-macro-mcp.md` 의 `레포 사이 계약 › 1. 로그인 넘겨주기`
 * 다. MCP 는 `/authorize` 요청을 저장한 뒤 `{HOME}/mcp/connect?request={request_id}&client={client_name}`
 * 으로 보낸다. `McpConnectPage` 와 떨어뜨려 둔 것은 앱 루트가 경로와 resume 함수만 가져가게 하고,
 * 테스트가 component 없이 이 규칙을 확인하게 하려는 것이다.
 */

import { appPath } from '../appPath'

export const MCP_CONNECT_PATH = appPath('/mcp/connect')

const PARKED_REQUEST_KEY = 'artel.mcpConnectRequest'

/**
 * MCP 서버의 origin(경로가 붙어도 된다). 거절 주소를 만드는 데만 쓴다 — 허용 쪽 주소는 orchestration
 * 이 응답으로 준다. 이 값을 알려 주는 API 가 없어 build 시점 환경 변수로 받는다.
 */
export const MCP_BASE_URL: string | undefined = import.meta.env.VITE_MCP_BASE_URL

/**
 * `request_id` 에 허용하는 문자. RFC 3986 의 unreserved 문자뿐이라 주소에 그대로 실어도
 * 바뀌지 않는다. 128자는 MCP 가 만드는 id 보다 넉넉하고, 손으로 만든 긴 값은 막는다.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/

/**
 * 화면에 보이는 `client_name` 의 최대 길이. `client_name` 은 OAuth 클라이언트가 등록할 때 스스로
 * 정한 값이라 아무 문자열이나 될 수 있고, 긴 문장으로 동의 화면 문구를 덮을 수 있다.
 */
export const CLIENT_NAME_MAX_LENGTH = 64

/**
 * 제어 문자와 bidi 방향 제어 문자. 방향 제어 문자는 `client_name` 의 글자 순서를 화면에서만 뒤집어
 * 다른 이름처럼 보이게 할 수 있어서 지운다.
 */
// eslint-disable-next-line no-control-regex
const HIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g

export type McpConnectRequest = {
  requestId: string
  /** 화면에 보일 수 있게 다듬은 `client_name`. 비었거나 없으면 `null`. */
  clientName: string | null
}

/** 주소를 쓸 수 없을 때. 계약상 `request` 가 없거나 형식이 틀린 경우 하나뿐이다. */
export type McpConnectRequestFault = 'invalidRequest'

/**
 * `client_name` 을 화면용 문자열로 만든다. 이 값은 text node 로만 그린다 — HTML 이나 링크로
 * 해석하지 않는다. 자르는 단위는 code point 라서 surrogate pair 를 반으로 가르지 않는다.
 */
export function displayClientName(raw: string | null): string | null {
  if (raw === null) return null

  const cleaned = raw.replace(HIDDEN_CHARACTERS, '').replace(/\s+/g, ' ').trim()
  if (cleaned === '') return null

  const codePoints = Array.from(cleaned)
  if (codePoints.length <= CLIENT_NAME_MAX_LENGTH) return cleaned
  return `${codePoints.slice(0, CLIENT_NAME_MAX_LENGTH).join('').trimEnd()}…`
}

export function isValidRequestId(value: string | null): value is string {
  return value !== null && REQUEST_ID_PATTERN.test(value)
}

export function readMcpConnectRequest(search: string): McpConnectRequest | McpConnectRequestFault {
  const params = new URLSearchParams(search)
  const requestId = params.get('request')
  if (!isValidRequestId(requestId)) return 'invalidRequest'

  return { requestId, clientName: displayClientName(params.get('client')) }
}

/**
 * 브라우저를 보내도 되는 주소인지. `javascript:` 나 `data:` 를 `location.assign` 에 넘기면 이
 * 페이지 안에서 실행되므로 http(s) 만 받는다.
 */
export function isNavigableUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * 거절 주소. `VITE_MCP_BASE_URL` 이 없거나 http(s) 주소가 아니면 `null` — 그때 화면은 이동하지 않고
 * 거절했다는 문구만 보인다. MCP 쪽에 저장된 요청은 만료로 사라진다.
 */
export function buildDenyUrl(mcpBaseUrl: string | undefined, requestId: string): string | null {
  const base = (mcpBaseUrl ?? '').trim().replace(/\/+$/, '')
  if (base === '' || !isNavigableUrl(base)) return null

  return `${base}/oauth/handoff/deny?request=${encodeURIComponent(requestId)}`
}

/**
 * OAuth 로그인은 콘솔 루트로만 돌아오고 아무것도 들고 오지 않는다(`sdkLoginRequest.ts` 와 같은
 * 사정). 그래서 로그인 전에 주소를 남겨 두고, 세션이 생기면 앱 루트가 다시 연다. 탭이 닫히면
 * 같이 사라지도록 `sessionStorage` 에 둔다.
 */
export function parkMcpConnectRequest(): void {
  sessionStorage.setItem(PARKED_REQUEST_KEY, window.location.search)
}

/**
 * 이 페이지에 로그인한 채로 도착했을 때 부른다. 남아 있으면 나중에 다른 화면에서 이 주소로 다시
 * 끌려온다.
 */
export function discardParkedMcpConnectRequest(): void {
  sessionStorage.removeItem(PARKED_REQUEST_KEY)
}

/** 앱 루트에서 부른다. 남겨 둔 요청으로 이동했으면 `true`. */
export function resumeMcpConnect(): boolean {
  const search = sessionStorage.getItem(PARKED_REQUEST_KEY)
  if (search === null) return false

  sessionStorage.removeItem(PARKED_REQUEST_KEY)
  window.location.replace(`${MCP_CONNECT_PATH}${search}`)
  return true
}
