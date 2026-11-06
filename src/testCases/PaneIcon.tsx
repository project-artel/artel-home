/**
 * 옆 창 접기 · 펴기 그림. 창 모양 안에 방향 표시를 넣어 "창을 접는다" 로 읽히게 한다.
 * [side] 는 창이 붙은 쪽이다 — 오른쪽 창(대화)은 거울로 뒤집어 화살표가 바깥을 향한다.
 */
export function PaneIcon({ collapsed, side = 'left' }: { collapsed: boolean; side?: 'left' | 'right' }) {
  return (
    <svg aria-hidden="true" className="tcl-pane-icon" style={side === 'right' ? { transform: 'scaleX(-1)' } : undefined} viewBox="0 0 20 20">
      <rect fill="none" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" width="16" x="2" y="3" />
      <path d="M7.5 3v14" stroke="currentColor" strokeWidth="1.5" />
      <path
        d={collapsed ? 'M11.5 8l2 2-2 2' : 'M13.5 8l-2 2 2 2'}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}
