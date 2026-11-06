import { apiFetch } from '../auth/authApi'
import type { Messages } from '../i18n/messages'
import { apiErrorMessage } from '../projects/apiErrorMessage'
import { asRecord, jsonRequest, ProjectApiError, readJson } from '../projects/projectApi'
import { isNavigableUrl } from './mcpConnectRequest'

/*
 * 동의 화면의 허용 버튼이 부르는 orchestration 호출. orchestration 이 사용자 cookie 로 `sub` 를 정해
 * handoff JWT 를 만들고, 그 JWT 를 실은 MCP 주소(`{MCP}/oauth/handoff?token=…`)를 돌려준다.
 */

/** 응답이 `redirectUrl` 을 http(s) 주소로 싣지 않았을 때의 client code. */
export const MALFORMED_HANDOFF_CODE = 'CLIENT_MALFORMED_MCP_HANDOFF'

/** orchestration 에 handoff 서명 키가 없을 때 503 과 함께 오는 code. */
const NOT_CONFIGURED_CODE = 'mcp_handoff_not_configured'

/**
 * 응답에서 이동할 주소를 꺼낸다. http(s) 가 아니면 이동하지 않는다 — 이 값은 곧바로
 * `location.assign` 에 들어간다.
 */
export function parseHandoffRedirect(data: unknown): string {
  const redirectUrl = asRecord(data)?.redirectUrl
  if (typeof redirectUrl !== 'string' || !isNavigableUrl(redirectUrl)) {
    throw new ProjectApiError(200, 'The server did not return a usable MCP address.', MALFORMED_HANDOFF_CODE)
  }
  return redirectUrl
}

/** `POST /api/mcp/handoffs` — 돌려받은 MCP 주소를 준다. */
export async function createMcpHandoff(requestId: string): Promise<string> {
  const response = await apiFetch('/api/mcp/handoffs', { method: 'POST', ...jsonRequest({ requestId }) })
  return parseHandoffRedirect(await readJson(response))
}

export type HandoffFailure = {
  message: string
  /** 같은 요청으로 다시 눌러도 결과가 같으면 `false`. 화면은 그때 버튼을 숨긴다. */
  isRetryable: boolean
}

/**
 * 허용 실패를 화면 문구로 바꾼다. 400 은 MCP 에 저장된 요청이 없거나 만료된 경우라 에이전트에서
 * 처음부터 다시 해야 하고, 503 `mcp_handoff_not_configured` 는 서버 설정 문제라 다시 눌러도 같다.
 */
export function handoffFailure(error: unknown, t: Messages): HandoffFailure {
  const copy = t.common.mcpConnect

  if (!(error instanceof ProjectApiError)) {
    return { message: t.projects.apiErrors.CLIENT_GENERIC, isRetryable: true }
  }
  if (error.code === NOT_CONFIGURED_CODE) {
    return { message: copy.notConfigured, isRetryable: false }
  }
  if (error.status === 400) {
    return { message: copy.invalidHandoff, isRetryable: false }
  }
  if (error.code === MALFORMED_HANDOFF_CODE) {
    return { message: copy.malformedRedirect, isRetryable: true }
  }
  return { message: apiErrorMessage(error, t), isRetryable: true }
}
