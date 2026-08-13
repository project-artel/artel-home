import { useI18n } from '../i18n/useI18n'
import { findGapRanges, splitMeasuredSegments } from './chartModel'
import type { PerformancePoint, PlottablePointKey } from './performanceTypes'

export type ChartSeries = {
  key: PlottablePointKey
  label: string
  className: string
}

const WIDTH = 900
const HEIGHT = 240
const PAD = 32

/**
 * One downsampled series, drawn without filling in anything the run did not
 * measure.
 *
 * Three decisions carry the meaning of this chart:
 *
 * - a `null` breaks the line rather than reading as zero, so an unmeasured
 *   window cannot be mistaken for a fast one;
 * - that window is shaded, because a reader notices a band far sooner than a
 *   line that quietly stops;
 * - the budget, when the run has one, is a rule across the plot. Whether 20 ms
 *   is fine depends entirely on where that rule sits.
 *
 * The gap band follows the plotted values rather than `isFocused`. Focus loss
 * is the usual reason for a hole and is what the label says, but a bucket can
 * lack `process` samples while holding perfectly good frame times, and that
 * hole is just as real.
 */
export function PerformanceChart({
  points,
  series,
  budgetMs = null,
  showHitches = false,
}: {
  points: PerformancePoint[]
  series: ChartSeries[]
  budgetMs?: number | null
  showHitches?: boolean
}) {
  const { t } = useI18n()
  const copy = t.performance.chart

  const values = series.flatMap((item) =>
    points
      .map((point) => point[item.key])
      .filter((value): value is number => typeof value === 'number'),
  )

  if (values.length === 0) return <p className="performance-unmeasured">{t.performance.unmeasured}</p>

  const maxAtMs = Math.max(...points.map((point) => point.atMs), 1)
  // Headroom so the tallest spike does not sit on the frame of the plot.
  const maxValue = Math.max(...values, budgetMs ?? 0, 1) * 1.08

  const x = (atMs: number) => PAD + (atMs / maxAtMs) * (WIDTH - PAD * 2)
  const y = (value: number) => HEIGHT - PAD - (value / maxValue) * (HEIGHT - PAD * 2)

  const primary = series[0].key
  const gaps = findGapRanges(points, (point) => point[primary])
  // Half a bucket on each side, so a band covers the window rather than the instant.
  const halfBucket = (WIDTH - PAD * 2) / Math.max(points.length - 1, 1) / 2
  const hitchPoints = showHitches ? points.filter((point) => (point.hitchCount ?? 0) > 0) : []

  return (
    <div className="performance-chart-wrap">
      <svg
        aria-label={series.map((item) => item.label).join(', ')}
        className="performance-chart"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {gaps.map((gap) => {
          const from = x(points[gap.from].atMs) - halfBucket
          const to = x(points[gap.to].atMs) + halfBucket

          return (
            <rect
              className="performance-gap"
              height={HEIGHT - PAD * 2}
              key={`gap-${gap.from}`}
              width={Math.max(to - from, 2)}
              x={from}
              y={PAD}
            >
              <title>{points[gap.from].isFocused ? copy.gapLabel : copy.gapLegend}</title>
            </rect>
          )
        })}

        <line
          className="performance-axis"
          x1={PAD}
          x2={WIDTH - PAD}
          y1={HEIGHT - PAD}
          y2={HEIGHT - PAD}
        />

        {budgetMs !== null && (
          <line
            className="performance-budget"
            x1={PAD}
            x2={WIDTH - PAD}
            y1={y(budgetMs)}
            y2={y(budgetMs)}
          />
        )}

        {series.map((item) =>
          splitMeasuredSegments(points, (point) => point[item.key]).map((segment, index) => (
            <polyline
              className={item.className}
              fill="none"
              key={`${item.label}-${index}`}
              points={segment
                .map((point) => `${x(point.atMs)},${y(point[item.key] as number)}`)
                .join(' ')}
            />
          )),
        )}

        {hitchPoints.map((point) => (
          <path
            className="performance-hitch"
            d={`M${x(point.atMs)} 10l6 10h-12z`}
            key={`hitch-${point.atMs}`}
          >
            <title>
              {copy.hitchMark((point.atMs / 1000).toFixed(1), point.hitchCount ?? 0)}
            </title>
          </path>
        ))}

        <text className="performance-axis-label" x={PAD} y={HEIGHT - PAD + 16}>
          0
        </text>
        <text
          className="performance-axis-label performance-axis-label--end"
          x={WIDTH - PAD}
          y={HEIGHT - PAD + 16}
        >
          {(maxAtMs / 1000).toFixed(0)}
        </text>
        <text className="performance-axis-label" x={PAD} y={PAD - 8}>
          {maxValue.toFixed(maxValue < 10 ? 1 : 0)}
        </text>
      </svg>

      <ul className="performance-legend">
        {series.map((item) => (
          <li key={item.label}>
            <span className={item.className} />
            {item.label}
          </li>
        ))}
        {budgetMs !== null && (
          <li>
            <span className="performance-budget" />
            {copy.budgetLegend(budgetMs.toFixed(2))}
          </li>
        )}
        {gaps.length > 0 && (
          <li>
            <span className="performance-gap" />
            {points[gaps[0].from].isFocused ? copy.gapLabel : copy.gapLegend}
          </li>
        )}
        <li className="performance-legend-axis">{copy.elapsedAxis}</li>
      </ul>
    </div>
  )
}
