/*
 * 기획 문서 화면(ARTEL-1098)의 그림. 그리지 않고 Tabler Icons(MIT, https://tabler.io/icons) outline
 * 세트에서 그대로 가져왔다 — 태그: `scale` · `hand-click` · `target` · `app-window` · `info-circle` ·
 * `dots`, 단계: `database` · `file-text` · `share` · `robot`.
 * 모두 `currentColor` 선 아이콘이라 둘러싼 타일의 색을 따른다. 옆 글자가 같은 것을 말하므로 `aria-hidden`.
 */

const TAG_PATHS: Record<string, string> = {
  RULE: 'M7 20l10 0 M6 6l6 -1l6 1 M12 3l0 17 M9 12l-3 -6l-3 6a3 3 0 0 0 6 0 M21 12l-3 -6l-3 6a3 3 0 0 0 6 0',
  CONTROL:
    'M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5 M11 11.5v-2a1.5 1.5 0 0 1 3 0v2.5 M14 10.5a1.5 1.5 0 0 1 3 0v1.5 M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7l-.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47 M5 3l-1 -1 M4 7h-1 M14 3l1 -1 M15 6h1',
  OBJECTIVE: 'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M7 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
  UI: 'M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z M6 8h.01 M9 8h.01 M3 10h18',
  INFO: 'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0 M12 9h.01 M11 12h1v4h1',
  MISC: 'M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
}

export type DocumentStep = 'store' | 'extract' | 'knowledge' | 'qa'

const STEP_PATHS: Record<DocumentStep, string> = {
  store: 'M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0 M4 6v6a8 3 0 0 0 16 0v-6 M4 12v6a8 3 0 0 0 16 0v-6',
  extract:
    'M14 3v4a1 1 0 0 0 1 1h4 M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z M9 9l1 0 M9 13l6 0 M9 17l6 0',
  knowledge:
    'M5 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M15 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M15 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M8.7 10.7l6.6 -3.4 M8.7 13.3l6.6 3.4',
  qa: 'M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z M12 2v2 M9 12v9 M15 12v9 M5 16l4 -2 M15 14l4 2 M9 18h6 M10 8v.01 M14 8v.01',
}

function Glyph({ d, size }: { d: string; size: number }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={size}>
      <path d={d} />
    </svg>
  )
}

/** 모르는 태그는 "기타" 그림을 쓴다. 색도 `MISC` 와 같은 칸에 들어간다(`dw-tone--MISC`). */
export function KnowledgeTagGlyph({ tag, size = 20 }: { tag: string; size?: number }) {
  return <Glyph d={TAG_PATHS[tag] ?? TAG_PATHS.MISC} size={size} />
}

export function DocumentStepGlyph({ step, size = 22 }: { step: DocumentStep; size?: number }) {
  return <Glyph d={STEP_PATHS[step]} size={size} />
}
