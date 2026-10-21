import { useCallback, useState } from 'react'
import { formatTokens, shortDay, type CostPoint, type TryOutcome } from './dashboardModel'

/** 숫자 칸 옆의 작은 막대. 마지막 막대(지금)만 [tone] 으로 칠한다. 장식이라 `aria-hidden` — 옆 숫자가 같은 것을 말한다. */
export function Spark({ values, tone }: { values: readonly number[]; tone: 'default' | 'critical' | 'warning' }) {
  const max = Math.max(1, ...values)
  const width = 160 / Math.max(1, values.length)
  return (
    <svg aria-hidden="true" className={`db-spark db-spark--${tone}`} preserveAspectRatio="none" viewBox="0 0 160 34">
      {values.map((value, index) => {
        const height = Math.max(2, (value / max) * 30)
        return (
          <rect
            className={index === values.length - 1 ? 'db-spark-now' : undefined}
            height={height}
            key={index}
            rx="1.5"
            width={Math.max(1, width - 3)}
            x={index * width + 1}
            y={32 - height}
          />
        )
      })}
    </svg>
  )
}

/** 0~1 사이 값 하나의 가로 막대. 추이가 없는 숫자(커버리지)에 지어낸 추이를 그리지 않으려고 쓴다. */
export function Meter({ value }: { value: number }) {
  return (
    <span aria-hidden="true" className="db-meter">
      <span style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </span>
  )
}

/** 여러 조각을 한 줄로 쌓은 막대. 조각은 CSS 클래스로 색을 고른다. */
export function StackBar({ parts, label, tall = false }: { parts: { value: number; tone: string }[]; label: string; tall?: boolean }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0) || 1
  return (
    <span aria-label={label} className={`db-stack${tall ? ' db-stack--tall' : ''}`} role="img">
      {parts.map((part, index) =>
        part.value > 0 ? <span className={`db-tone-${part.tone}`} key={index} style={{ width: `${(part.value / total) * 100}%` }} /> : null,
      )}
    </span>
  )
}

/**
 * 그래프를 놓은 칸의 폭(px). viewBox 를 이 폭으로 잡아 높이와 글씨는 고정하고 가로만 늘린다 — 고정 viewBox 를
 * `width: 100%` 로 늘리면 넓은 모니터에서 축 글씨까지 같은 비율로 커졌다. 재기 전에는 [fallback] 으로 그린다.
 */
function useWidth(fallback: number): [number, (node: SVGSVGElement | null) => void] {
  const [width, setWidth] = useState(fallback)
  const ref = useCallback((node: SVGSVGElement | null) => {
    if (node === null) return
    const parent = node.parentElement
    if (parent === null) return
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      if (next > 0) setWidth((current) => (current === next ? current : next))
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  return [width, ref]
}

const CHART_HEIGHT = 240
const X0 = 56
const TOP = 16
const BOTTOM = 208

/**
 * 실행마다 비용 선 그래프(ARTEL-1164). 빌드마다 선 하나 — 같은 빌드의 실행끼리 잇는다. x 는 실행 순서라 날짜 간격과
 * 다르다(하루에 일곱 번 돈 날도 점이 고르게 보이게). [hidden] 의 빌드는 그리지 않는다.
 */
export function CostChart({
  points,
  colorOf,
  hidden,
  label,
}: {
  points: readonly CostPoint[]
  colorOf: (build: string) => string
  hidden: ReadonlySet<string>
  label: string
}) {
  const [width, ref] = useWidth(800)
  const x1 = Math.max(X0 + 40, width - 12)
  const shown = points.filter((point) => !hidden.has(point.build))
  const max = Math.max(0.05, ...shown.map((point) => point.costUsd ?? 0)) * 1.15
  const slot = (x1 - X0) / Math.max(1, points.length)
  const x = (index: number) => X0 + slot * index + slot / 2
  const y = (value: number) => BOTTOM - (value / max) * (BOTTOM - TOP)
  const builds = [...new Set(points.map((point) => point.build))].filter((build) => !hidden.has(build))
  const days: { x: number; label: string }[] = []
  let last = ''
  points.forEach((point, index) => {
    const day = shortDay(point.startedAt)
    if (day !== last) days.push({ x: x(index), label: day })
    last = day
  })
  return (
    <svg aria-label={label} className="db-chart" ref={ref} role="img" style={{ height: CHART_HEIGHT }} viewBox={`0 0 ${width} ${CHART_HEIGHT}`}>
      {[0, 0.5, 1].map((fraction) => {
        const lineY = BOTTOM - fraction * (BOTTOM - TOP)
        return (
          <g key={fraction}>
            <line className={fraction === 0 ? 'db-axis' : 'db-grid'} x1={44} x2={x1} y1={lineY} y2={lineY} />
            <text className="db-tick" textAnchor="end" x={36} y={lineY + 4}>
              ${(max * fraction).toFixed(2)}
            </text>
          </g>
        )
      })}
      {builds.map((build) => {
        const own = points.map((point, index) => ({ point, index })).filter(({ point }) => point.build === build && point.costUsd !== null)
        const path = own.map(({ point, index }, k) => `${k === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(point.costUsd ?? 0).toFixed(1)}`).join(' ')
        return (
          <g key={build} style={{ color: colorOf(build) }}>
            <path className="db-line" d={path} />
            {own.map(({ point, index }) => (
              <circle className="db-dot" cx={x(index)} cy={y(point.costUsd ?? 0)} key={point.qaRunId} r={3.5}>
                <title>{`#${point.qaRunId} · ${point.build} · ${formatTokens(point.tokens)} · $${(point.costUsd ?? 0).toFixed(3)}`}</title>
              </circle>
            ))}
          </g>
        )
      })}
      {days.map((day) => (
        <text className="db-tick db-tick--day" key={`${day.x}`} textAnchor="middle" x={day.x} y={CHART_HEIGHT - 6}>
          {day.label}
        </text>
      ))}
    </svg>
  )
}

const WEEKS_HEIGHT = 132
const WEEKS_BASE = 112

/** 주마다 새로 생김 · 해결 두 막대. */
export function WeekBars({ added, resolved, labels, label }: { added: number[]; resolved: number[]; labels: string[]; label: string }) {
  const [width, ref] = useWidth(300)
  const max = Math.max(1, ...added, ...resolved)
  const slot = width / Math.max(1, labels.length)
  const bar = Math.min(16, Math.max(6, slot / 2 - 4))
  return (
    <svg aria-label={label} className="db-weeks" ref={ref} role="img" style={{ height: WEEKS_HEIGHT }} viewBox={`0 0 ${width} ${WEEKS_HEIGHT}`}>
      <line className="db-axis" x1={0} x2={width} y1={WEEKS_BASE} y2={WEEKS_BASE} />
      {labels.map((week, index) => {
        const center = index * slot + slot / 2
        const ah = (added[index] / max) * (WEEKS_BASE - 8)
        const rh = (resolved[index] / max) * (WEEKS_BASE - 8)
        return (
          <g key={week}>
            <rect className="db-tone-warning-fill" height={ah} rx={2} width={bar} x={center - bar - 1} y={WEEKS_BASE - ah} />
            <rect className="db-tone-success-fill" height={rh} rx={2} width={bar} x={center + 1} y={WEEKS_BASE - rh} />
            <text className="db-tick" textAnchor="middle" x={center} y={WEEKS_HEIGHT - 4}>
              {week}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** 시나리오 한 줄의 최근 결과 칸. */
export function OutcomeStrip({ outcomes, label }: { outcomes: readonly TryOutcome[]; label: string }) {
  return (
    <span aria-label={label} className="db-strip" role="img">
      {outcomes.map((outcome, index) => (
        <span className={`db-cell db-cell--${outcome.toLowerCase()}`} key={index} />
      ))}
    </span>
  )
}
