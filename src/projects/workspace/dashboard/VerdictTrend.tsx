import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../../i18n/useI18n'
import type { QaRunSummary } from '../../../qa/launch/qaLaunchApi'
import { qaRunPath } from '../../../qa/qaTypes'
import { formatTestCaseId } from '../../../testCases/testCaseId'
import { buildDisplayName } from '../../buildEnvironment'
import { sectionHref } from '../sections'
import { useWidth } from './useWidth'
import { fetchQaVerdictTrend, type QaVerdictTrend, type TrendBucketUnit } from './qaVerdictTrendApi'
import { buildMarks, dayKey, rollingPassRate, shortKey, splitAt, summarizeTrend, trendSlots, weekKey, type TrendSlot } from './trendModel'

const UNITS: TrendBucketUnit[] = ['DAY', 'WEEK', 'RUN']
const HEIGHT = 326
const TOP = 48
const BOTTOM = 290
const X0 = 44
const RIGHT = 46
const DAY_MS = 86_400_000
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

type Result = { key: string; data: QaVerdictTrend | null; failed: boolean }

/**
 * 대시보드 가운데 칸, QA 판정 추이(ARTEL-1387). 칸(날 · 주 · 실행)마다 Test Case 판정을 통과 · 실패 · 회귀 · 미판정으로
 * 쌓고, 통과율과 7칸 평균을 선으로 겹치고, 새 빌드가 오른 자리에 세로선을 긋는다. 기간은 대시보드 위의 7 · 30 · 90일을
 * 따르고, 앞 기간과 견주려고 서버에는 두 배 기간을 묻는다. 막대에 마우스를 올리면 그 칸의 숫자를, 누르면 그 칸의 QA
 * 실행 목록을 고정해 보인다.
 */
export function VerdictTrend({
  projectId,
  days,
  now,
  version,
  qaRuns,
}: {
  projectId: string
  days: number
  now: Date
  /** 대시보드가 고른 케이스 라이브러리 버전. 없으면 버전으로 거르지 않는다. */
  version: { gameBuildId: string; name: string } | null
  qaRuns: readonly QaRunSummary[]
}) {
  const { t } = useI18n()
  const m = t.dashboard.trend
  const [unit, setUnit] = useState<TrendBucketUnit>('DAY')
  const [onlyVersion, setOnlyVersion] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const [width, ref] = useWidth(900)
  const [result, setResult] = useState<Result | null>(null)

  const since = useMemo(() => new Date(now.getTime() - days * DAY_MS), [now, days])
  const from = useMemo(() => new Date(now.getTime() - 2 * days * DAY_MS), [now, days])
  const gameBuildId = onlyVersion && version !== null ? version.gameBuildId : null
  const key = `${projectId}:${from.toISOString()}:${unit}:${gameBuildId ?? 'all'}`

  useEffect(() => {
    const controller = new AbortController()
    fetchQaVerdictTrend(projectId, { from, to: now, bucket: unit, timeZone: ZONE, gameBuildId }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data, failed: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, data: null, failed: true })
      })
    return () => controller.abort()
  }, [projectId, from, now, unit, gameBuildId, key])

  const current = result?.key === key ? result : null
  const trend = current?.data ?? null
  const view = useMemo(() => {
    if (trend === null) return null
    const all = trendSlots(trend.buckets, unit, from, now, ZONE)
    const { current: slots, previous } = splitAt(all, since, unit, ZONE)
    return {
      slots,
      summary: summarizeTrend(slots, previous, trend.builds, unit, ZONE),
      rolling: rollingPassRate(all, 7).slice(all.length - slots.length),
      marks: buildMarks(slots, trend.builds, unit, ZONE),
    }
  }, [trend, unit, from, now, since])

  const labelOf = (slot: TrendSlot) => (unit === 'RUN' ? `#${slot.key}` : unit === 'WEEK' ? m.weekOf(shortKey(slot.key)) : shortKey(slot.key))
  const pct = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`)
  const libraryHref = (filter: { status: string } | { case: string }) => {
    const query = new URLSearchParams(filter)
    if (version !== null) query.set('version', version.gameBuildId)
    return `${sectionHref(projectId, 'test-cases')}?${query}`
  }
  const runsOf = (slot: TrendSlot) =>
    qaRuns.filter((run) => {
      if (unit === 'RUN') return run.id === slot.key
      const day = dayKey(new Date(run.startedAt), ZONE)
      return (unit === 'WEEK' ? weekKey(day) : day) === slot.key
    })

  const pick = (index: number | null) => {
    setPinned((current) => (current === index ? null : index))
  }
  const shown = pinned ?? hover
  const plot = useRef<HTMLDivElement>(null)
  // 고정한 칸은 막대를 다시 누르거나, 그래프 밖을 누르거나, Escape 로 닫는다.
  useEffect(() => {
    if (pinned === null) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !plot.current?.contains(event.target as Node)) setPinned(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [pinned])

  return (
    <section aria-labelledby="db-trend" className="db-card db-trend">
      <header className="db-card-head">
        <h2 id="db-trend">{m.title}</h2>
        <span className="db-quiet">{m.sub}</span>
        <div className="db-trend-controls">
          <div aria-label={m.unit} className="db-periods" role="group">
            {UNITS.map((value) => (
              <button
                aria-pressed={unit === value}
                key={value}
                onClick={() => {
                  setUnit(value)
                  setPinned(null)
                  setHover(null)
                }}
                type="button"
              >
                {m.units[value]}
              </button>
            ))}
          </div>
          {version !== null && (
            <div aria-label={m.scope} className="db-periods" role="group">
              <button aria-pressed={!onlyVersion} onClick={() => setOnlyVersion(false)} type="button">
                {m.allVersions}
              </button>
              <button aria-pressed={onlyVersion} onClick={() => setOnlyVersion(true)} type="button">
                {version.name}
              </button>
            </div>
          )}
        </div>
      </header>

      {current === null ? (
        <p className="db-quiet db-trend-empty">…</p>
      ) : current.failed || view === null ? (
        <p className="db-quiet db-trend-empty">{t.dashboard.failedToLoad}</p>
      ) : (
        <>
          <dl className="db-trend-stats">
            <div>
              <dt>{m.judged}</dt>
              <dd>{m.cases(view.summary.judged)}</dd>
              <small>{m.judgedSub(view.summary.runs, unit, view.summary.perSlot.toFixed(1))}</small>
            </div>
            <div>
              <dt>{m.passRate}</dt>
              <dd>{pct(view.summary.passRate)}</dd>
              <small className={deltaTone(view.summary.passRate, view.summary.previousPassRate)}>
                {view.summary.previousPassRate === null
                  ? m.noPrevious(days)
                  : m.previous(days, pct(view.summary.previousPassRate), delta(view.summary.passRate, view.summary.previousPassRate))}
              </small>
            </div>
            <div>
              <dt>{m.failedRegression}</dt>
              <dd>
                <span className={view.summary.failed > 0 ? 'db-critical' : undefined}>{view.summary.failed}</span>
                <span className="db-muted"> · </span>
                <span className={view.summary.regression > 0 ? 'db-warning' : undefined}>{view.summary.regression}</span>
              </dd>
              <small>{m.regressionHint}</small>
            </div>
            <div>
              <dt>{m.undecided}</dt>
              <dd>{m.cases(view.summary.undecided)}</dd>
              <small>{view.summary.undecidedPeak ? m.undecidedPeak(labelOf(view.summary.undecidedPeak), view.summary.undecidedPeak.undecided) : m.undecidedNone}</small>
            </div>
            <div>
              <dt>{m.worst[unit]}</dt>
              <dd>{view.summary.worst ? labelOf(view.summary.worst) : '—'}</dd>
              <small>
                {view.summary.worst
                  ? [
                      m.worstRate(pct(view.summary.worst.passRate)),
                      view.summary.worstAfter &&
                        m.afterBuild(buildDisplayName({ version: view.summary.worstAfter.build.version, isEditor: view.summary.worstAfter.build.isEditor }), view.summary.worstAfter.days),
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : m.worstNone}
              </small>
            </div>
          </dl>

          <ul className="db-legend db-legend--row">
            <LegendSwatch label={m.passed} tone="success" />
            <LegendSwatch label={m.failed} tone="critical" />
            <LegendSwatch label={m.regression} tone="warning" />
            <LegendSwatch label={m.undecidedLegend} tone="muted" />
            <li>
              <span aria-hidden="true" className="db-trend-key db-trend-key--rate" />
              {m.rateLine}
            </li>
            {unit !== 'WEEK' && (
              <li>
                <span aria-hidden="true" className="db-trend-key db-trend-key--avg" />
                {m.avgLine[unit]}
              </li>
            )}
            <li>
              <span aria-hidden="true" className="db-trend-key db-trend-key--build" />
              {m.newBuild}
            </li>
          </ul>

          {view.slots.length === 0 ? (
            <p className="db-quiet db-trend-empty">{m.empty}</p>
          ) : (
            <div className="db-trend-plot" onMouseLeave={() => setHover(null)} ref={plot}>
              <TrendChart
                avg={unit === 'WEEK' ? null : view.rolling}
                label={m.chartLabel(view.slots.length, view.summary.judged, pct(view.summary.passRate))}
                labelOf={labelOf}
                marks={view.marks.map((mark) => ({ index: mark.index, label: buildDisplayName({ version: mark.build.version, isEditor: mark.build.isEditor }) }))}
                onHover={setHover}
                onPick={pick}
                pinned={pinned}
                refCallback={ref}
                shown={shown}
                slots={view.slots}
                width={width}
              />
              {shown !== null && view.slots[shown] && (
                <SlotTip
                  left={slotCenter(shown, view.slots.length, width)}
                  caseHref={(testCaseId) => libraryHref({ case: testCaseId })}
                  pinned={pinned !== null}
                  projectId={projectId}
                  runs={pinned !== null ? runsOf(view.slots[shown]) : []}
                  slot={view.slots[shown]}
                  title={labelOf(view.slots[shown])}
                  unit={unit}
                  width={width}
                />
              )}
            </div>
          )}
          <p className="db-quiet">{m.axisNote}</p>

          <div className="db-trend-links">
            <Link className="db-more" to={libraryHref({ status: 'FAILED' })}>
              {m.failedLink}
            </Link>
            <Link className="db-more" to={libraryHref({ status: 'REGRESSION' })}>
              {m.regressionLink}
            </Link>
            <Link className="db-more" to={sectionHref(projectId, 'qa-history')}>
              {m.historyLink}
            </Link>
          </div>

          {view.slots.length > 0 && (
            <details className="db-reliability-details">
              <summary>{m.table}</summary>
              <div className="db-reliability-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{m.units[unit]}</th>
                      <th scope="col">{m.runs}</th>
                      <th scope="col">{m.passed}</th>
                      <th scope="col">{m.failed}</th>
                      <th scope="col">{m.regression}</th>
                      <th scope="col">{m.undecidedLegend}</th>
                      <th scope="col">{m.passRate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.slots.map((slot) => (
                      <tr key={slot.key}>
                        <th scope="row">{labelOf(slot)}</th>
                        <td>{slot.runs}</td>
                        <td>{slot.passed}</td>
                        <td>{slot.failed}</td>
                        <td>{slot.regression}</td>
                        <td>{slot.undecided}</td>
                        <td>{pct(slot.passRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function slotCenter(index: number, count: number, width: number): number {
  const x1 = Math.max(X0 + 40, width - RIGHT)
  const slot = (x1 - X0) / Math.max(1, count)
  return X0 + slot * index + slot / 2
}

function TrendChart({
  slots,
  avg,
  marks,
  width,
  refCallback,
  shown,
  pinned,
  onHover,
  onPick,
  label,
  labelOf,
}: {
  slots: readonly TrendSlot[]
  avg: readonly (number | null)[] | null
  marks: readonly { index: number; label: string }[]
  width: number
  refCallback: (node: SVGSVGElement | null) => void
  shown: number | null
  pinned: number | null
  onHover: (index: number | null) => void
  onPick: (index: number) => void
  label: string
  labelOf: (slot: TrendSlot) => string
}) {
  const x1 = Math.max(X0 + 40, width - RIGHT)
  const slot = (x1 - X0) / Math.max(1, slots.length)
  const bar = Math.max(3, Math.min(30, slot * 0.62))
  const top = Math.max(4, ...slots.map((one) => one.judged + one.undecided))
  const max = niceMax(top)
  const y = (value: number) => BOTTOM - (value / max) * (BOTTOM - TOP)
  const yRate = (rate: number) => BOTTOM - rate * (BOTTOM - TOP)
  const cx = (index: number) => X0 + slot * index + slot / 2
  const every = Math.max(1, Math.ceil(slots.length / Math.max(1, Math.floor((x1 - X0) / 52))))
  // 판정이 없던 칸은 건너뛰고 앞뒤 점을 잇는다 — 끊으면 하루 걸러 돈 기간에는 선 없이 점만 남는다.
  const path = (values: readonly (number | null)[]) =>
    values
      .map((value, index) => (value === null ? null : `${cx(index).toFixed(1)} ${yRate(value).toFixed(1)}`))
      .filter((point): point is string => point !== null)
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point}`)
      .join(' ')
  const rates = slots.map((one) => one.passRate)
  return (
    <svg aria-label={label} className="db-chart db-trend-chart" ref={refCallback} role="img" style={{ height: HEIGHT }} viewBox={`0 0 ${width} ${HEIGHT}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const lineY = BOTTOM - fraction * (BOTTOM - TOP)
        return (
          <g key={fraction}>
            <line className={fraction === 0 ? 'db-axis' : 'db-grid'} x1={X0 - 6} x2={x1} y1={lineY} y2={lineY} />
            <text className="db-tick" textAnchor="end" x={X0 - 10} y={lineY + 4}>
              {Math.round(max * fraction)}
            </text>
            <text className="db-tick" textAnchor="start" x={x1 + 8} y={lineY + 4}>
              {Math.round(fraction * 100)}%
            </text>
          </g>
        )
      })}
      {placeLabels(marks.map((mark) => ({ ...mark, x: cx(mark.index) - slot / 2 }))).map((mark, index) => (
        <g className="db-trend-build" key={`${mark.index}-${mark.label}-${index}`}>
          <line x1={mark.x} x2={mark.x} y1={18 + mark.row * LABEL_ROW} y2={BOTTOM} />
          <text textAnchor="start" x={mark.x + 4} y={14 + mark.row * LABEL_ROW}>
            {mark.label}
          </text>
        </g>
      ))}
      {slots.map((one, index) => {
        const parts: [number, string][] = [
          [one.passed, 'db-trend-pass'],
          [one.failed, 'db-trend-fail'],
          [one.regression, 'db-trend-regression'],
          [one.undecided, 'db-trend-undecided'],
        ]
        let base = 0
        return (
          <g className={shown === index ? 'is-shown' : undefined} key={one.key}>
            {shown === index && <rect className="db-trend-focus" height={BOTTOM - TOP + 6} width={slot} x={cx(index) - slot / 2} y={TOP - 6} />}
            {parts.map(([value, className]) => {
              if (value === 0) return null
              const y0 = y(base)
              base += value
              const y1 = y(base)
              return <rect className={className} height={Math.max(1, y0 - y1)} key={className} width={bar} x={cx(index) - bar / 2} y={y1} />
            })}
          </g>
        )
      })}
      {avg && <path className="db-trend-avg" d={path(avg)} />}
      <path className="db-trend-rate" d={path(rates)} />
      {rates.map((rate, index) =>
        rate === null ? null : <circle className="db-trend-rate-dot" cx={cx(index)} cy={yRate(rate)} key={index} r={shown === index ? 4.5 : 3} />,
      )}
      {slots.map((one, index) =>
        index % every === 0 ? (
          <text className="db-tick db-tick--day" key={one.key} textAnchor="middle" x={cx(index)} y={HEIGHT - 12}>
            {labelOf(one)}
          </text>
        ) : null,
      )}
      {slots.map((one, index) => (
        <rect
          className={`db-trend-hit${pinned === index ? ' is-pinned' : ''}`}
          height={BOTTOM - TOP + 6}
          key={one.key}
          onClick={() => onPick(index)}
          onMouseEnter={() => onHover(index)}
          width={slot}
          x={cx(index) - slot / 2}
          y={TOP - 6}
        />
      ))}
    </svg>
  )
}

function SlotTip({
  slot,
  title,
  left,
  width,
  unit,
  pinned,
  runs,
  projectId,
  caseHref,
}: {
  slot: TrendSlot
  title: string
  left: number
  width: number
  unit: TrendBucketUnit
  pinned: boolean
  runs: readonly QaRunSummary[]
  projectId: string
  caseHref: (testCaseId: string) => string
}) {
  const { t } = useI18n()
  const m = t.dashboard.trend
  const side = left > width / 2 ? 'right' : 'left'
  const style = side === 'left' ? { left: left + 18 } : { right: width - left + 18 }
  return (
    <div className={`db-trend-tip${pinned ? ' is-pinned' : ''}`} role={pinned ? 'dialog' : 'tooltip'} style={style}>
      <b>
        {title}
        {unit !== 'RUN' && <span className="db-muted"> · {m.runsIn(slot.runs)}</span>}
      </b>
      <dl>
        <TipRow label={m.passed} tone="success" value={slot.passed} />
        <TipRow label={m.failed} tone="critical" value={slot.failed} />
        <TipRow label={m.regression} tone="warning" value={slot.regression} />
        <TipRow label={m.undecidedLegend} tone="muted" value={slot.undecided} />
        <div className="db-trend-tip-rate">
          <dt>{m.passRate}</dt>
          <dd>{slot.passRate === null ? '—' : `${Math.round(slot.passRate * 100)}%`}</dd>
        </div>
      </dl>
      {slot.topFailing && (
        <p className="db-trend-tip-case">
          {m.topFailing}{' '}
          <Link to={caseHref(slot.topFailing.testCaseId)}>
            {slot.topFailing.caseNumber === null ? '' : `${formatTestCaseId(slot.topFailing.caseNumber)} `}
            {slot.topFailing.title}
          </Link>{' '}
          <span className="db-muted">({m.times(slot.topFailing.failures)})</span>
        </p>
      )}
      {pinned ? (
        runs.length > 0 && (
          <ul className="db-trend-tip-runs">
            {runs.slice(0, RUNS_IN_TIP).map((run) => (
              <li key={run.id}>
                <Link to={qaRunPath(projectId, run.id)}>
                  <span className="db-mono">#{run.id}</span> <span className="db-ellipsis">{run.testRunName ?? `#${run.testRunId}`}</span>
                </Link>
              </li>
            ))}
            {runs.length > RUNS_IN_TIP && <li className="db-muted">{m.moreRuns(runs.length - RUNS_IN_TIP)}</li>}
          </ul>
        )
      ) : (
        <p className="db-quiet">{m.clickToPin}</p>
      )}
    </div>
  )
}

function TipRow({ label, tone, value }: { label: string; tone: string; value: number }) {
  return (
    <div>
      <dt>
        <span aria-hidden="true" className={`db-swatch db-tone-${tone}`} />
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  )
}

function LegendSwatch({ tone, label }: { tone: string; label: string }) {
  return (
    <li>
      <span aria-hidden="true" className={`db-swatch db-tone-${tone}`} />
      {label}
    </li>
  )
}

const LABEL_ROW = 13
const RUNS_IN_TIP = 6
/** 고정폭 글씨 한 자 폭(10.5px mono). 빌드 이름이 겹치는지 어림한다. */
const LABEL_CHAR = 6.6

/** 빌드 이름이 앞 이름과 겹치면 한 줄 아래로 내린다. 세 줄이 다 차면 다시 첫 줄부터 쓴다. */
function placeLabels<T extends { x: number; label: string }>(marks: readonly T[]): (T & { row: number })[] {
  const ends = [-Infinity, -Infinity, -Infinity]
  return [...marks]
    .sort((a, b) => a.x - b.x)
    .map((mark) => {
      const free = ends.findIndex((end) => end <= mark.x)
      const row = free === -1 ? ends.indexOf(Math.min(...ends)) : free
      ends[row] = mark.x + 8 + mark.label.length * LABEL_CHAR
      return { ...mark, row }
    })
}

/** 축 눈금이 4등분으로 떨어지는 가장 작은 위쪽 값. */
function niceMax(value: number): number {
  const step = Math.pow(10, Math.floor(Math.log10(value / 4)))
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (factor * step * 4 >= value) return factor * step * 4
  }
  return value
}

function delta(now: number | null, before: number | null): string {
  if (now === null || before === null) return '—'
  const points = (now - before) * 100
  return `${points >= 0 ? '+' : '−'}${Math.abs(points).toFixed(1)}%p`
}

function deltaTone(now: number | null, before: number | null): string | undefined {
  if (now === null || before === null || Math.abs(now - before) < 0.005) return undefined
  return now > before ? 'db-success' : 'db-critical'
}
