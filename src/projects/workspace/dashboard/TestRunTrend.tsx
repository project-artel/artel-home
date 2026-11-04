import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../../../i18n/useI18n'
import type { QaRunSummary } from '../../../qa/launch/qaLaunchApi'
import { qaRunPath } from '../../../qa/qaTypes'
import { buildDisplayName } from '../../buildEnvironment'
import type { GameBuild } from '../../gameTypes'
import { formatDate } from '../../formatters'
import { sectionHref } from '../sections'
import { runSeries, shortDay, type RunPoint, type RunSeries } from './dashboardModel'
import { useWidth } from './useWidth'

const SERIES = 8
const SHOWN_AT_FIRST = 5
const X0 = 48
const RIGHT = 16
const TOP = 16
const BOTTOM = 236
const DATE_Y = 256
const LABEL_ROW = 14
const LABEL_CHAR = 6.6

type Hover = { series: RunSeries; point: RunPoint; x: number; y: number }

/**
 * 대시보드 가운데 칸, 테스트 런마다 통과율(ARTEL-1387). 여러 런의 판정을 날짜로 합치면 그 런이 나아졌는지 다른 런이
 * 돌았는지 알 수 없어서, 런마다 선을 하나씩 긋는다. 가로는 실행 순서, 점 하나가 QA 실행 한 번이고 세로는 그 실행에서
 * 통과한 Test Case 비율이다. 아래 표가 런마다 마지막 결과와 앞 실행 대비를 같은 색으로 보이고, 표의 색 단추로 선을
 * 켜고 끈다(비용 그래프의 빌드 단추와 같은 동작). 서버는 늘리지 않았다 — 대시보드가 이미 읽는 실행 목록을 쓴다.
 */
export function TestRunTrend({
  projectId,
  qaRuns,
  since,
  live,
  builds,
}: {
  projectId: string
  qaRuns: readonly QaRunSummary[]
  since: Date
  live: ReadonlySet<string>
  builds: readonly GameBuild[]
}) {
  const { t } = useI18n()
  const m = t.dashboard.runTrend
  const navigate = useNavigate()
  const [width, ref] = useWidth(900)
  const [hidden, setHidden] = useState<ReadonlySet<string> | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  const series = useMemo(() => runSeries(qaRuns, since.toISOString(), live), [qaRuns, since, live])
  const colorOf = (testRunId: string) => `var(--db-series-${(series.findIndex((one) => one.testRunId === testRunId) % SERIES) + 1})`
  // 처음에는 실행이 많은 다섯 런만 켠다. 사용자가 단추를 누르면 그 뒤로는 고른 대로다.
  const off = hidden ?? new Set(series.slice(SHOWN_AT_FIRST).map((one) => one.testRunId))
  const shown = series.filter((one) => !off.has(one.testRunId))
  const toggle = (testRunId: string) => {
    const next = new Set(off)
    if (next.has(testRunId)) next.delete(testRunId)
    else next.add(testRunId)
    setHidden(next)
  }

  const rows = series.map((one) => {
    const judged = one.points.filter((point) => point.rate !== null)
    const last = judged[judged.length - 1] ?? null
    const previous = judged[judged.length - 2] ?? null
    return { series: one, last, change: last && previous ? (last.rate ?? 0) - (previous.rate ?? 0) : null, lastRun: one.points[one.points.length - 1] }
  })
  const better = rows.filter((row) => row.change !== null && row.change > 0.005).length
  const worse = rows.filter((row) => row.change !== null && row.change < -0.005).length
  const lowest = rows.filter((row) => row.last !== null).sort((a, b) => (a.last?.rate ?? 0) - (b.last?.rate ?? 0))[0] ?? null
  const runCount = series.reduce((sum, one) => sum + one.points.length, 0)

  // 가로는 시간이 아니라 실행 순서다(비용 그래프와 같은 까닭) — 하루에 여러 번 돈 날은 시간 축에서 점이 한 줄로 쌓여
  // 선이 위아래로 꺾였다. 날짜는 그날 첫 실행 아래에 쓴다.
  const order = useMemo(
    () => series.flatMap((one) => one.points).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.qaRunId.localeCompare(b.qaRunId)),
    [series],
  )
  const slotOf = useMemo(() => new Map(order.map((point, index) => [point.qaRunId, index])), [order])
  const x1 = Math.max(X0 + 40, width - RIGHT)
  const slot = (x1 - X0) / Math.max(1, order.length)
  const xAt = (index: number) => X0 + slot * index + slot / 2
  const x = (point: RunPoint) => xAt(slotOf.get(point.qaRunId) ?? 0)
  const y = (rate: number) => BOTTOM - rate * (BOTTOM - TOP)
  const ticks: { x: number; label: string }[] = []
  let lastDay = ''
  let lastX = -Infinity
  order.forEach((point, index) => {
    const day = shortDay(point.startedAt)
    if (day !== lastDay && xAt(index) - lastX >= 44) {
      ticks.push({ x: xAt(index), label: day })
      lastX = xAt(index)
    }
    lastDay = day
  })
  const marks = placeLabels(
    builds
      .map((build) => ({ build, index: order.findIndex((point) => point.startedAt >= build.createdAt) }))
      .filter(({ build, index }) => index >= 0 && Date.parse(build.createdAt) >= since.getTime())
      .map(({ build, index }) => ({ x: xAt(index) - slot / 2, label: buildDisplayName(build) })),
  )
  const height = DATE_Y + 10 + marks.reduce((most, mark) => Math.max(most, mark.row + 1), 0) * LABEL_ROW
  const pct = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`)

  return (
    <section aria-labelledby="db-runtrend" className="db-card db-trend">
      <header className="db-card-head">
        <h2 id="db-runtrend">{m.title}</h2>
        <span className="db-quiet">{m.sub}</span>
        <Link className="db-more" to={sectionHref(projectId, 'qa-history')}>
          {m.history}
        </Link>
      </header>

      {series.length === 0 ? (
        <p className="db-quiet db-trend-empty">{m.empty}</p>
      ) : (
        <>
          <dl className="db-trend-stats db-trend-stats--4">
            <div>
              <dt>{m.runs}</dt>
              <dd>{series.length}</dd>
              <small>{m.runsSub(runCount)}</small>
            </div>
            <div>
              <dt>{m.better}</dt>
              <dd className={better > 0 ? 'db-success' : undefined}>{better}</dd>
              <small>{m.betterSub}</small>
            </div>
            <div>
              <dt>{m.worse}</dt>
              <dd className={worse > 0 ? 'db-critical' : undefined}>{worse}</dd>
              <small>{m.worseSub}</small>
            </div>
            <div>
              <dt>{m.lowest}</dt>
              <dd>{lowest ? pct(lowest.last?.rate ?? null) : '—'}</dd>
              <small>{lowest ? lowest.series.name : m.none}</small>
            </div>
          </dl>

          <div className="db-trend-plot" onMouseLeave={() => setHover(null)}>
            <svg
              aria-label={m.chartLabel(shown.length, shown.map((one) => one.name).join(', '))}
              className="db-chart db-trend-chart"
              ref={ref}
              role="img"
              style={{ height }}
              viewBox={`0 0 ${width} ${height}`}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                <g key={fraction}>
                  <line className={fraction === 0 ? 'db-axis' : 'db-grid'} x1={X0} x2={x1} y1={y(fraction)} y2={y(fraction)} />
                  <text className="db-tick" textAnchor="end" x={X0 - 8} y={y(fraction) + 4}>
                    {Math.round(fraction * 100)}%
                  </text>
                </g>
              ))}
              {ticks.map((tick) => (
                <text className="db-tick db-tick--day" key={`${tick.x}`} textAnchor="middle" x={tick.x} y={DATE_Y}>
                  {tick.label}
                </text>
              ))}
              {marks.map((mark, index) => (
                <line className="db-trend-build-tick" key={`t-${mark.label}-${index}`} x1={mark.x} x2={mark.x} y1={BOTTOM} y2={BOTTOM + 6} />
              ))}
              {marks.map((mark, index) => (
                <text className="db-trend-build" key={`${mark.label}-${index}`} textAnchor="start" x={mark.x - 4} y={DATE_Y + 18 + mark.row * LABEL_ROW}>
                  ▲ {mark.label}
                </text>
              ))}
              {shown.map((one) => {
                const judged = one.points.filter((point) => point.rate !== null)
                const path = judged.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point).toFixed(1)} ${y(point.rate ?? 0).toFixed(1)}`).join(' ')
                const dim = hover !== null && hover.series.testRunId !== one.testRunId
                return (
                  <g className={dim ? 'db-runline is-dim' : 'db-runline'} key={one.testRunId} style={{ color: colorOf(one.testRunId) }}>
                    <path className="db-line" d={path} />
                    {one.points.map((point) => {
                      const px = x(point)
                      const py = y(point.rate ?? 0)
                      const hollow = point.rate === null || point.status === 'CANCELLED'
                      return (
                        <g key={point.qaRunId}>
                          <circle className={hollow ? 'db-dot db-dot--hollow' : 'db-dot'} cx={px} cy={py} r={hover?.point === point ? 5.5 : 3.5} />
                          <circle
                            className="db-trend-hit"
                            cx={px}
                            cy={py}
                            onClick={() => navigate(qaRunPath(projectId, point.qaRunId))}
                            onMouseEnter={() => setHover({ series: one, point, x: px, y: py })}
                            r={10}
                          />
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </svg>
            {hover && (
              <div className="db-trend-tip" role="tooltip" style={hover.x > width / 2 ? { right: width - hover.x + 16, top: Math.max(0, hover.y - 40) } : { left: hover.x + 16, top: Math.max(0, hover.y - 40) }}>
                <b>
                  <span aria-hidden="true" className="db-swatch" style={{ background: colorOf(hover.series.testRunId), display: 'inline-block', marginRight: 6 }} />
                  {hover.series.name}
                </b>
                <dl>
                  <div>
                    <dt>{m.run}</dt>
                    <dd>#{hover.point.qaRunId}</dd>
                  </div>
                  <div>
                    <dt>{m.when}</dt>
                    <dd>{formatDate(hover.point.startedAt)}</dd>
                  </div>
                  {hover.point.build && (
                    <div>
                      <dt>{m.build}</dt>
                      <dd>{hover.point.build}</dd>
                    </div>
                  )}
                  <div className="db-trend-tip-rate">
                    <dt>{m.passed}</dt>
                    <dd>{hover.point.total === null ? m.noVerdict : `${hover.point.passed}/${hover.point.total} · ${pct(hover.point.rate)}`}</dd>
                  </div>
                </dl>
                <p className="db-quiet">{t.dashboard.history.status[hover.point.status] ?? hover.point.status} · {m.clickToOpen}</p>
              </div>
            )}
          </div>
          <p className="db-quiet">{m.note}</p>

          <div aria-label={m.title} className="db-runs" role="table">
            <div className="db-runs-row db-runs-row--head" role="row">
              <span role="columnheader">{m.colShow}</span>
              <span role="columnheader">{m.colRun}</span>
              <span role="columnheader">{m.colBuild}</span>
              <span role="columnheader">{m.colLast}</span>
              <span role="columnheader">{m.colChange}</span>
              <span role="columnheader">{m.colCount}</span>
              <span role="columnheader">{m.colWhen}</span>
            </div>
            {rows.map((row) => {
              const on = !off.has(row.series.testRunId)
              return (
                <div className={on ? 'db-runs-row' : 'db-runs-row is-off'} key={row.series.testRunId} role="row">
                  <span role="cell">
                    <button
                      aria-label={m.toggle(row.series.name)}
                      aria-pressed={on}
                      className="db-runs-toggle"
                      onClick={() => toggle(row.series.testRunId)}
                      style={{ color: colorOf(row.series.testRunId) }}
                      type="button"
                    >
                      <span aria-hidden="true" />
                    </button>
                  </span>
                  <Link className="db-ellipsis db-strong" role="cell" to={qaRunPath(projectId, row.lastRun.qaRunId)}>
                    {row.series.name}
                  </Link>
                  <span role="cell">{row.lastRun.build && <span className="db-build">{row.lastRun.build}</span>}</span>
                  <span className="db-mono" role="cell">
                    {row.last ? `${pct(row.last.rate)} · ${row.last.passed}/${row.last.total}` : m.noVerdict}
                  </span>
                  <span className={`db-mono ${row.change === null || Math.abs(row.change) < 0.005 ? 'db-muted' : row.change > 0 ? 'db-success' : 'db-critical'}`} role="cell">
                    {row.change === null ? '—' : `${row.change >= 0 ? '+' : '−'}${Math.abs(Math.round(row.change * 100))}%p`}
                  </span>
                  <span className="db-mono db-muted" role="cell">
                    {m.count(row.series.points.length)}
                  </span>
                  <span className="db-muted" role="cell">
                    {shortDay(row.lastRun.startedAt)}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

/** 빌드 이름이 앞 이름과 겹치면 한 줄 아래로 내린다. 세 줄이 다 차면 가장 먼저 비는 줄에 쓴다. */
function placeLabels<T extends { x: number; label: string }>(marks: readonly T[]): (T & { row: number })[] {
  const ends = [-Infinity, -Infinity, -Infinity]
  return [...marks]
    .sort((a, b) => a.x - b.x)
    .map((mark) => {
      const free = ends.findIndex((end) => end <= mark.x)
      const row = free === -1 ? ends.indexOf(Math.min(...ends)) : free
      ends[row] = mark.x + 18 + mark.label.length * LABEL_CHAR
      return { ...mark, row }
    })
}
