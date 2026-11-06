/**
 * 원형 진행 표시. 비율을 알면 그만큼 원을 채우고, 모르면(`null`) 4분의 1 호가 돈다 — 멈춘 0% 로 그리면 걸린 것처럼
 * 보인다.
 *
 * 문서 업로드(`DocumentPanel`)와 화면 지도 스캔(`EvidenceScanPanel`, ARTEL-1179)이 같이 쓴다.
 */
export function ProgressRing({
  percent,
  size,
  label,
  showPercent = size >= 80,
}: {
  percent: number | null
  size: number
  label: string
  /** 원 안에 `n%` 를 쓸지. 작은 원에는 글자가 들어가지 않아 기본은 80px 부터다. */
  showPercent?: boolean
}) {
  const stroke = size >= 80 ? 6 : 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = percent === null ? circumference * 0.25 : (circumference * percent) / 100

  return (
    <span
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent ?? undefined}
      className={`dw-ring${percent === null ? ' is-indeterminate' : ''}`}
      role="progressbar"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <circle className="dw-ring-track" cx={size / 2} cy={size / 2} fill="none" r={radius} strokeWidth={stroke} />
        <circle
          className="dw-ring-fill"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={stroke}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {percent !== null && showPercent && <span className="dw-ring-label mono">{percent}%</span>}
    </span>
  )
}
