import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { findGapRanges, splitMeasuredSegments } from './chartModel'
import type { PerformancePoint, PlottablePointKey } from './performanceTypes'
import { axisTicks, niceCeil } from './trendModel'
import { useElementSize } from './useElementWidth'

export type ChartSeries = {
  key: PlottablePointKey
  label: string
  className: string
}

/** 고정 높이 차트의 높이, 그리고 남는 높이를 채우는 차트의 가장 낮은 높이. */
const BASE_HEIGHT = 240
const PAD_LEFT = 64
const PAD_RIGHT = 16
const PAD_TOP = 24
const PAD_BOTTOM = 30

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
  width = 900,
  fill = false,
  formatValue = (value) => String(Number(value.toFixed(1))),
}: {
  points: PerformancePoint[]
  series: ChartSeries[]
  budgetMs?: number | null
  showHitches?: boolean
  /** 실제 폭을 재기 전에 쓰는 viewBox 폭. 재고 나면 칸 폭을 따른다. */
  width?: number
  /** 칸의 남은 높이를 채운다. 프레임타임처럼 화면의 주인공인 차트만 쓴다. */
  fill?: boolean
  /** 세로축 눈금 글자. 메모리는 바이트로 오므로 MiB 로 바꾼다(ARTEL-1207). */
  formatValue?: (value: number) => string
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const size = useElementSize(box, { width, height: BASE_HEIGHT })
  const WIDTH = Math.max(size.width, 280)
  const HEIGHT = fill ? Math.max(size.height, BASE_HEIGHT) : BASE_HEIGHT
  const { t } = useI18n()
  const copy = t.performance.chart

  const values = series.flatMap((item) =>
    points
      .map((point) => point[item.key])
      .filter((value): value is number => typeof value === 'number'),
  )

  if (values.length === 0) return <p className="performance-unmeasured">{t.performance.unmeasured}</p>

  const maxAtMs = Math.max(...points.map((point) => point.atMs), 1)
  // Headroom so the tallest spike does not sit on the frame of the plot, rounded up to a
  // readable top so every tick label names a value the chart actually reaches.
  const maxValue = niceCeil(Math.max(...values, budgetMs ?? 0) * 1.08)
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM

  const x = (atMs: number) => PAD_LEFT + (atMs / maxAtMs) * plotWidth
  const y = (value: number) => HEIGHT - PAD_BOTTOM - (value / maxValue) * plotHeight
  const timeTicks = axisTicks(maxAtMs, Math.min(4, Math.max(points.length - 1, 1)))

  const primary = series[0].key
  const gaps = findGapRanges(points, (point) => point[primary])
  // Half a bucket on each side, so a band covers the window rather than the instant.
  const halfBucket = plotWidth / Math.max(points.length - 1, 1) / 2
  const hitchPoints = showHitches ? points.filter((point) => (point.hitchCount ?? 0) > 0) : []

  return (
    <div className={`performance-chart-wrap${fill ? ' performance-chart-wrap--fill' : ''}`}>
      <div className="performance-chart-area" ref={setBox}>
      <svg
        aria-label={series.map((item) => item.label).join(', ')}
        className="performance-chart"
        height={HEIGHT}
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
      >
        {axisTicks(maxValue).map((tick) => (
          <g key={`y-${tick}`}>
            <line className="performance-grid" x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(tick)} y2={y(tick)} />
            <text className="performance-axis-label performance-axis-label--end" x={PAD_LEFT - 8} y={y(tick) + 4}>
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {gaps.map((gap) => {
          const from = x(points[gap.from].atMs) - halfBucket
          const to = x(points[gap.to].atMs) + halfBucket

          return (
            <rect
              className="performance-gap"
              height={plotHeight}
              key={`gap-${gap.from}`}
              width={Math.max(to - from, 2)}
              x={from}
              y={PAD_TOP}
            >
              <title>{points[gap.from].isFocused ? copy.gapLabel : copy.gapLegend}</title>
            </rect>
          )
        })}

        <line
          className="performance-axis"
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={HEIGHT - PAD_BOTTOM}
          y2={HEIGHT - PAD_BOTTOM}
        />

        {budgetMs !== null && (
          <line
            className="performance-budget"
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
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
            d={`M${x(point.atMs)} 4l6 10h-12z`}
            key={`hitch-${point.atMs}`}
          >
            <title>
              {copy.hitchMark((point.atMs / 1000).toFixed(1), point.hitchCount ?? 0)}
            </title>
          </path>
        ))}

        {timeTicks.map((tick) => (
          <text className="performance-axis-label performance-axis-label--middle" key={`x-${tick}`} x={x(tick)} y={HEIGHT - 10}>
            {Number((tick / 1000).toFixed(1))}
          </text>
        ))}
      </svg>
      </div>

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
