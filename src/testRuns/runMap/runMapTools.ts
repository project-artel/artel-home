export type RunMapTool = 'select' | 'hand' | 'ts' | 'note' | 'text' | 'rect' | 'ellipse' | 'arrow' | 'pen'

/** 단축키. 글을 고치는 중이 아닐 때만 받는다. */
export const TOOL_KEYS: Record<string, RunMapTool> = { v: 'select', h: 'hand', s: 'ts', n: 'note', t: 'text', r: 'rect', o: 'ellipse', a: 'arrow', p: 'pen' }
