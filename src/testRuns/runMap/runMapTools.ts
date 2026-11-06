export type RunMapTool = 'select' | 'hand' | 'ts' | 'note' | 'text' | 'rect' | 'ellipse' | 'section' | 'arrow' | 'pen'

/** 단축키. 글을 고치는 중이 아닐 때만 받는다. */
export const TOOL_KEYS: Record<string, RunMapTool> = { v: 'select', h: 'hand', s: 'ts', n: 'note', t: 'text', r: 'rect', o: 'ellipse', f: 'section', a: 'arrow', p: 'pen' }

/**
 * 누른 키의 글자. `event.key` 가 아니라 자판 자리(`event.code`)로 읽는다. 한글 입력 상태에서는 N 을 눌러도
 * `event.key` 가 `ㅜ` 라서 단축키가 먹지 않는다.
 */
export function letterOf(event: Pick<KeyboardEvent, 'code'>): string | null {
  return /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : null
}
