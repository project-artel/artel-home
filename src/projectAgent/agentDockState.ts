/** 프로젝트 agent 대화창이 쓰는 순수 로직. 저장소와 크기 계산만 있고 React 는 없다. */

const OPEN_KEY = 'artel.projectAgent.open'
const WIDTH_KEY = 'artel.projectAgent.width'

export const CHAT_WIDTH_DEFAULT = 400
export const CHAT_WIDTH_MIN = 320
export const CHAT_WIDTH_MAX = 720
/** 대화창이 아무리 넓어져도 page slot 은 이만큼 남는다. */
export const PAGE_SLOT_MIN_PX = 640
export const SPLIT_PX = 6

/** 기능 flag. `VITE_PROJECT_AGENT=true` 일 때만 켜진다. */
export function isProjectAgentEnabled(env: { VITE_PROJECT_AGENT?: string }): boolean {
  return env.VITE_PROJECT_AGENT === 'true'
}

export function readAgentOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== 'false'
  } catch {
    // private mode 등에서 storage 가 막힐 수 있다. 열린 상태가 기본값이다.
    return true
  }
}

export function storeAgentOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, String(open))
  } catch {
    // 저장에 실패해도 다음 방문에 기본값으로 돌아갈 뿐이다.
  }
}

export function readAgentWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY))
    if (!Number.isFinite(saved) || saved <= 0) return CHAT_WIDTH_DEFAULT
    return Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, saved))
  } catch {
    return CHAT_WIDTH_DEFAULT
  }
}

export function storeAgentWidth(width: number): void {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(width))
  } catch {
    // 저장이 막혀도 이번 방문에서는 넓어진 채로 쓴다.
  }
}

/** 창이 좁으면 최소 폭 아래로는 줄이지 않는다. 그 경우 page slot 이 640px 보다 좁아질 수 있다. */
export function chatWidthCeiling(viewportWidth: number, railWidth: number): number {
  const room = viewportWidth - railWidth - SPLIT_PX - PAGE_SLOT_MIN_PX
  return Math.max(CHAT_WIDTH_MIN, Math.min(CHAT_WIDTH_MAX, room))
}

export function clampChatWidth(width: number, viewportWidth: number, railWidth: number): number {
  const ceiling = chatWidthCeiling(viewportWidth, railWidth)
  return Math.min(ceiling, Math.max(CHAT_WIDTH_MIN, width))
}

/**
 * 런 편집과 시나리오 상세는 오른쪽 열에 자기 대화(RunChat, 시나리오 chat)를 이미 갖는다.
 * 두 대화를 나란히 두지 않으려고 프로젝트 대화창은 이 경로에서 접힌다.
 */
export function isFoldedRoute(projectId: string, pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'projects' || segments[1] !== projectId) return false
  if (segments[2] === 'test-runs') return segments.length === 5 && segments[4] === 'edit'
  if (segments[2] === 'test-scenarios') return segments.length === 4
  return false
}

export function effectiveOpen(input: { stored: boolean; folded: boolean; reopenedHere: boolean }): boolean {
  if (input.folded) return input.reopenedHere
  return input.stored
}
