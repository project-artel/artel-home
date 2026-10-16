/*
 * 시나리오 스튜디오의 아이콘(ARTEL-1107). 그리지 않고 Tabler Icons(MIT, https://tabler.io/icons) outline
 * 세트에서 그대로 가져왔다 — 유니코드 글리프(↶ ↷ ⠿ ⚠ ⓘ ✕)는 글꼴마다 굵기와 크기가 달라 줄이 맞지 않았다.
 * 모두 `currentColor` 선 아이콘이라 둘러싼 글자색을 따른다. 옆 글자나 `aria-label` 이 같은 것을 말하므로
 * `aria-hidden` 이다.
 */

const PATHS = {
  undo: ['M9 14l-4 -4l4 -4', 'M5 10h11a4 4 0 1 1 0 8h-1'],
  redo: ['M15 14l4 -4l-4 -4', 'M19 10h-11a4 4 0 1 0 0 8h1'],
  search: ['M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
  chevronUp: ['M6 15l6 -6l6 6'],
  chevronDown: ['M6 9l6 6l6 -6'],
  close: ['M18 6l-12 12', 'M6 6l12 12'],
  grip: [
    'M8 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M8 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M14 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  ],
  alert: [
    'M12 9v4',
    'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z',
    'M12 16h.01',
  ],
  plus: ['M12 5l0 14', 'M5 12l14 0'],
  check: ['M5 12l5 5l10 -10'],
  circle: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0'],
  refresh: ['M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4', 'M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'],
  minus: ['M5 12l14 0'],
  external: ['M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6', 'M11 13l9 -9', 'M15 4h5v5'],
  arrowUp: ['M12 5l0 14', 'M18 11l-6 -6', 'M6 11l6 -6'],
  arrowDown: ['M12 5l0 14', 'M18 13l-6 6', 'M6 13l6 6'],
  trash: ['M4 7l16 0', 'M10 11l0 6', 'M14 11l0 6', 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12', 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3'],
  panelBottom: ['M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z', 'M4 15l16 0'],
  info: ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 9h.01', 'M11 12h1v4h1'],
  sparkles: [
    'M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z',
  ],
} as const

export type StudioIconName = keyof typeof PATHS

export function StudioIcon({ name, size = 16, className }: { name: StudioIconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size}>
      {PATHS[name].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  )
}
