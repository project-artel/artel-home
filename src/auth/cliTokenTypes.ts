/**
 * 목록이 그리는 CLI 토큰 한 줄. 서버는 원문 `token` 을 여기서는 절대 돌려주지 않는다 — 원문을
 * 싣는 응답은 [CliTokenCreated] 하나뿐이다.
 */
export type CliToken = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

/**
 * `POST /api/auth/cli-tokens` 의 응답. `token` 은 사용자에게 딱 한 번만 보여 주는 원문이다 —
 * 서버가 이 값을 다시 돌려주지 않으므로, 이 타입은 그 값을 발급 응답에서 reveal 블록까지 옮기는
 * 자리로만 쓰인다.
 */
export type CliTokenCreated = {
  id: string
  name: string
  token: string
  createdAt: string
  expiresAt: string | null
}

/**
 * 만료 select 가 들고 있는 값의 모양. `<select>` 값은 항상 문자열이라 이 타입도 문자열이고,
 * 무기한도 숫자 선택지와 같은 select 안에 놓여야 해서 sentinel `'never'` 를 쓴다. 제출 직전에
 * [toExpiresInDays] 가 이 값을 실제 요청 몸으로 바꾼다.
 */
export type CliTokenExpiryDraft = '30' | '90' | '180' | '365' | 'never'

/**
 * 이 콘솔이 제공하는 네 가지 기간과 무기한. `POST /api/auth/cli-tokens` 는 임의의 정수를
 * 받으므로 이 선택지는 서버 계약이 아니라 화면의 선택이다 — 나중에 값을 바꿔도 API 는 그대로다.
 */
export const CLI_TOKEN_EXPIRY_OPTIONS: CliTokenExpiryDraft[] = ['30', '90', '180', '365', 'never']

export const DEFAULT_CLI_TOKEN_EXPIRY: CliTokenExpiryDraft = '90'

export function toExpiresInDays(draft: CliTokenExpiryDraft): number | null {
  return draft === 'never' ? null : Number(draft)
}

/**
 * `expiresAt` 이 지났는지. `revokedAt` 은 여기서 보지 않는다 — 만료·폐기 둘 다 참일 수 있고,
 * 어느 쪽으로 그릴지는 [isCliTokenRevoked] 를 먼저 확인하는 호출부의 몫이다. `expiresAt` 이
 * `null` 이면 무기한이라 항상 `false`.
 */
export function isCliTokenExpired(token: CliToken, now: number = Date.now()): boolean {
  if (token.expiresAt === null) return false

  const expiresAt = Date.parse(token.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt <= now
}

export function isCliTokenRevoked(token: CliToken): boolean {
  return token.revokedAt !== null
}
