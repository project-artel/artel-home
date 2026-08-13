import { splitMeasuredSegments } from './chartModel'
import type { PerformancePoint } from './performanceTypes'

type Series = { key: keyof PerformancePoint; label: string; className: string }

export function PerformanceChart({ points, series, budgetMs }: { points: PerformancePoint[]; series: Series[]; budgetMs?: number | null }) {
  const width = 900, height = 240, pad = 28
  const values = series.flatMap((item) => points.map((point) => point[item.key]).filter((value): value is number => typeof value === 'number'))
  if (values.length === 0) return <p className="performance-unmeasured">측정 안 됨</p>
  const maxX = Math.max(...points.map((point) => point.atMs), 1)
  const maxY = Math.max(...values, budgetMs ?? 0, 1) * 1.08
  const x = (atMs: number) => pad + (atMs / maxX) * (width - pad * 2)
  const y = (value: number) => height - pad - (value / maxY) * (height - pad * 2)
  return (
    <div className="performance-chart-wrap">
      <svg aria-label={series.map((item) => item.label).join(', ')} className="performance-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
        <line className="performance-axis" x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} />
        {budgetMs != null && <line className="performance-budget" x1={pad} x2={width - pad} y1={y(budgetMs)} y2={y(budgetMs)} />}
        {series.map((item) => splitMeasuredSegments(points, (point) => point[item.key] as number | null).map((segment, index) => (
          <polyline className={item.className} fill="none" key={`${item.label}-${index}`} points={segment.map((point) => `${x(point.atMs)},${y(point[item.key] as number)}`).join(' ')} />
        )))}
        {points.filter((point) => (point.hitchCount ?? 0) > 0).map((point) => <path className="performance-hitch" d={`M${x(point.atMs)} 12l6 10h-12z`} key={point.atMs} />)}
        {points.filter((point) => !point.isFocused).map((point) => <rect className="performance-gap" height={height - pad * 2} key={point.atMs} width={Math.max(8, (width - pad * 2) / Math.max(points.length, 1))} x={x(point.atMs)} y={pad} />)}
      </svg>
      <ul className="performance-legend">{series.map((item) => <li key={item.label}><span className={item.className} />{item.label}</li>)}{budgetMs != null && <li><span className="performance-budget" />예산 {budgetMs.toFixed(2)}ms</li>}<li><span className="performance-gap" />포커스 상실 · 측정 안 됨</li></ul>
    </div>
  )
}
