import { SYMBOL_ACCENT, SYMBOL_BODY } from '../brand/artelMark'

/**
 * 캡처가 없을 때 그 자리에 서는 서비스 대체 그림(ARTEL-1172). 회색 상자에 글 한 줄이던 자리가 지도 위에 수십 개 서면
 * 빈 칸만 보였다. 옅은 ARTEL 로고와 짧은 이름표를 둔다 — 같은 크기 상자라 격자는 그대로다. SVG 안에서 쓴다.
 */
export function CapturePlaceholder({
  x,
  y,
  width,
  height,
  label,
}: {
  x: number
  y: number
  width: number
  height: number
  label: string
}) {
  const size = Math.min(height * 0.46, width * 0.3)
  const scale = size / 64
  return (
    <g className="sm-placeholder">
      <rect height={height} rx="4" width={width} x={x} y={y} />
      <g transform={`translate(${x + width / 2 - size / 2} ${y + height / 2 - size / 2 - 7}) scale(${scale})`}>
        <path className="sm-placeholder-mark" d={SYMBOL_BODY} />
        <path className="sm-placeholder-accent" d={SYMBOL_ACCENT} />
      </g>
      <text textAnchor="middle" x={x + width / 2} y={y + height / 2 + size / 2 + 8}>
        {label}
      </text>
    </g>
  )
}

/** 목록 줄의 같은 대체 그림. HTML 안에서 쓴다. */
export function CapturePlaceholderThumb({ wide = false }: { wide?: boolean }) {
  return (
    <span aria-hidden="true" className={`cm-tree-thumb cm-tree-thumb--placeholder${wide ? ' cm-tree-thumb--scene' : ''}`}>
      <svg viewBox="0 0 64 64">
        <path className="sm-placeholder-mark" d={SYMBOL_BODY} />
        <path className="sm-placeholder-accent" d={SYMBOL_ACCENT} />
      </svg>
    </span>
  )
}
