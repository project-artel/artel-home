/** 설치 안내의 세 쪽(ARTEL-1208). `?guide=` 값이다. */
export const SETUP_GUIDES = ['sdk', 'cli', 'skills'] as const
export type SetupGuideId = (typeof SETUP_GUIDES)[number]

/** 모르는 값이나 없는 값은 ARTEL 플러그인 쪽이다 — 스킬과 스테이징 MCP 를 한 번에 까는 길이라 처음 오는 사람이 먼저 볼 곳이다(ARTEL-1433). */
export function setupGuideFrom(value: string | null): SetupGuideId {
  return SETUP_GUIDES.find((one) => one === value) ?? 'skills'
}
