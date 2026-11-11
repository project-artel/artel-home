/** 설치 안내의 쪽(ARTEL-1208 · MCP 는 ARTEL-1433). `?guide=` 값이다. */
export const SETUP_GUIDES = ['sdk', 'cli', 'skills', 'mcp'] as const
export type SetupGuideId = (typeof SETUP_GUIDES)[number]

/** 모르는 값이나 없는 값은 첫 쪽(SDK)이다. */
export function setupGuideFrom(value: string | null): SetupGuideId {
  return SETUP_GUIDES.find((one) => one === value) ?? 'sdk'
}

/**
 * 스테이징 MCP 서버(artel-macro-mcp `docs/deployment.md`). 이름은 ARTEL 플러그인의 `mcp.json` 과 같다 — 플러그인과
 * 이 안내를 둘 다 따라도 같은 서버가 두 번 등록되지 않게.
 */
export const MCP_SERVER_NAME = 'artel-macro'
export const MCP_SERVER_URL = 'https://stage-mcp.artel.kr/mcp'
export const MCP_CLAUDE_ADD_COMMAND = `claude mcp add --transport http --scope user ${MCP_SERVER_NAME} ${MCP_SERVER_URL}`
export const MCP_CODEX_CONFIG = `[mcp_servers.${MCP_SERVER_NAME}]\nurl = "${MCP_SERVER_URL}"`
export const MCP_CODEX_LOGIN_COMMAND = `codex mcp login ${MCP_SERVER_NAME}`
export const MCP_JSON_CONFIG = JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { url: MCP_SERVER_URL } } }, null, 2)
