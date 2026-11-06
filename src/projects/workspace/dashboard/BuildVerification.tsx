import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../../i18n/useI18n'
import {
  fetchBuildVerificationProgress,
  fetchReleaseCriteria,
  type BuildVerificationDay,
  type BuildVerificationProgress,
  type ReleaseCriteria,
} from '../../../release/releaseApi'
import { daysToFinish, evaluateRelease, judgedOf, RELEASE_LEVELS, type Gate, type ReleaseLevel } from '../../../release/releaseModel'
import { SketchEmpty } from '../../../emptyStates/SketchEmpty'
import { CalendarSketch } from '../../../emptyStates/sketches'
import { buildEnvironment } from '../../buildEnvironment'
import '../../../contentMap/contentMap.css'
import { sectionHref } from '../sections'
import { useWidth } from './useWidth'

export type VersionChoice = { version: string; label: string | null; isEditor: boolean | null | undefined; latest: boolean; count: number }

type Loaded<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'failed' }

/** 쌓는 순서(아래부터)와 색. 판정 전은 빗금으로 남은 자리를 그린다. */
const STATES = [
  { key: 'passed', tone: 'success' },
  { key: 'failed', tone: 'critical' },
  { key: 'regression', tone: 'reasoning' },
  { key: 'inconclusive', tone: 'warning' },
] as const
type StateKey = (typeof STATES)[number]['key'] | 'pending'

const H = 260
const X0 = 40
const LABEL_W = 104
const TOP = 22
const BOTTOM = H - 34
const LEVEL_TONE: Record<ReleaseLevel, 'critical' | 'warning' | 'success'> = { verifying: 'critical', candidate: 'warning', ready: 'success' }

/**
 * 대시보드 가운데 칸, 이번 빌드 검증 진행(ARTEL-1387). 고른 버전의 TC 를 마지막 판정으로 세어 날마다 쌓고(번업),
 * 오른쪽에 출시 판단을 둔다. 버전은 케이스 라이브러리 칸의 버전 고르기를 따른다. 판단 규칙은 `releaseModel` 이 정하고
 * 숫자는 설정의 출시 기준 탭에서 프로젝트가 정한다.
 */
export function BuildVerification({
  projectId,
  gameBuildId,
  versionName,
  version,
  onPickVersion,
  waiting,
}: {
  projectId: string
  gameBuildId: string | null
  versionName: string
  /** 버전 고르기 단추에 보일 것. 화면 지도의 빌드 고르기 단추(`cm-build-current`)와 같은 모양이다. */
  version: VersionChoice | null
  onPickVersion: () => void
  /** 버전 목록을 아직 받는 중이면 빈 화면 대신 스켈레톤을 보인다. */
  waiting: boolean
}) {
  const { t } = useI18n()
  const m = t.dashboard.verification
  const [progress, setProgress] = useState<{ key: string; value: Loaded<BuildVerificationProgress> }>({ key: '', value: { status: 'loading' } })
  const [criteria, setCriteria] = useState<Loaded<ReleaseCriteria>>({ status: 'loading' })
  const key = `${projectId}#${gameBuildId}`

  useEffect(() => {
    if (gameBuildId === null) return
    const controller = new AbortController()
    fetchBuildVerificationProgress(projectId, gameBuildId, controller.signal)
      .then((value) => setProgress({ key, value: { status: 'ready', value } }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setProgress({ key, value: { status: 'failed' } })
      })
    return () => controller.abort()
  }, [projectId, gameBuildId, key])

  useEffect(() => {
    const controller = new AbortController()
    fetchReleaseCriteria(projectId, controller.signal)
      .then((value) => setCriteria({ status: 'ready', value: value.criteria }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setCriteria({ status: 'failed' })
      })
    return () => controller.abort()
  }, [projectId])

  const loaded = progress.key === key ? progress.value : { status: 'loading' as const }

  return (
    <section aria-labelledby="db-bv-title" className="db-card db-bv">
      {waiting ? (
        <VerificationSkeleton title={m.title} />
      ) : gameBuildId === null ? (
        <SketchEmpty body={m.noVersionBody} compact sketch={<CalendarSketch />} title={m.noVersion} />
      ) : loaded.status === 'loading' || criteria.status === 'loading' ? (
        <VerificationSkeleton title={m.title} />
      ) : loaded.status === 'failed' || criteria.status === 'failed' ? (
        <>
          <h2 className="db-bv-title" id="db-bv-title">
            {m.title}
          </h2>
          <p className="db-quiet">{t.dashboard.failedToLoad}</p>
        </>
      ) : loaded.value.summary.total === 0 ? (
        <SketchEmpty
          actions={
            <Link className="button button--secondary" to={`${sectionHref(projectId, 'test-cases')}?version=${encodeURIComponent(gameBuildId)}`}>
              {m.openLibrary}
            </Link>
          }
          body={m.emptyVersionBody(versionName)}
          compact
          sketch={<CalendarSketch />}
          title={m.emptyVersion}
        />
      ) : (
        <VerificationBody criteria={criteria.value} onPickVersion={onPickVersion} progress={loaded.value} projectId={projectId} version={version} versionName={versionName} />
      )}
    </section>
  )
}

function VerificationBody({
  progress,
  criteria,
  projectId,
  versionName,
  version,
  onPickVersion,
}: {
  progress: BuildVerificationProgress
  criteria: ReleaseCriteria
  projectId: string
  versionName: string
  version: VersionChoice | null
  onPickVersion: () => void
}) {
  const { t } = useI18n()
  const m = t.dashboard.verification
  const { summary, days } = progress
  const judged = judgedOf(summary)
  const pct = summary.total === 0 ? 0 : Math.round((judged / summary.total) * 100)
  const finish = daysToFinish(days, summary.pending)
  const readiness = evaluateRelease(summary, criteria)
  const casesHref = (status: string) =>
    `${sectionHref(projectId, 'test-cases')}?version=${encodeURIComponent(summary.build.gameBuildId)}&status=${status}`
  const share = (value: number) => (summary.total === 0 ? '0%' : `${Math.round((value / summary.total) * 100)}%`)
  const created = new Date(summary.build.createdAt)
  const uploaded = Number.isNaN(created.getTime()) ? '' : `${created.getMonth() + 1}/${created.getDate()}`

  return (
    <>
      <div className="db-bv-main">
        <header className="db-bv-head">
          <div className="db-bv-head-row">
            <h2 className="db-bv-title" id="db-bv-title">
              {m.title}
            </h2>
            <button aria-label={t.dashboard.kpi.pickVersion(versionName)} className="cm-build-current db-bv-version" onClick={onPickVersion} type="button">
              <span className="cm-build-current-caption">{t.contentMap.buildSwitcher.caption}</span>
              <span className="cm-build-version mono">{version?.version ?? summary.build.version}</span>
              <span className="cm-build-badge">{buildEnvironment(version?.isEditor ?? summary.build.isEditor)}</span>
              {version?.latest && <span className="cm-build-badge cm-build-badge--new">{t.contentMap.buildSwitcher.newest}</span>}
              {version?.label && <span className="cm-build-label">{version.label}</span>}
              {version && <span className="cm-build-count">{t.contentMap.buildSwitcher.count(version.count)}</span>}
              <span aria-hidden="true" className="cm-build-caret">
                ▾
              </span>
            </button>
            <span className="db-bv-meta">{m.since(uploaded, days.length)}</span>
            <span className="db-bv-eta">
              {summary.pending === 0 ? m.allJudged : finish === null ? m.etaUnknown : m.eta(finish.days, finish.perDay.toFixed(1))}
            </span>
          </div>
          <p className="db-bv-headline">{m.headline[readiness.level](readiness.met, readiness.gates.length, summary.pending)}</p>
          <div className="db-bv-progress">
            <span aria-hidden="true" className="db-bv-bar">
              {STATES.map((state) => (
                <i className={`db-tone-${state.tone}`} key={state.key} style={{ width: share(summary[state.key]) }} />
              ))}
            </span>
            <b className="db-bv-bar-label">
              <span className="db-bv-pct">{pct}%</span> {m.judged} <span className="db-bv-of">{judged}/{summary.total}</span>
            </b>
          </div>
        </header>

        <ul className="db-bv-tiles">
          {STATES.map((state) => (
            <StateTile key={state.key} label={m.states[state.key]} rule={m.rules[state.key]} share={share(summary[state.key])} tone={state.tone} value={summary[state.key]} />
          ))}
          <StateTile label={m.states.pending} rule={m.rules.pending} share={share(summary.pending)} tone="pending" value={summary.pending} />
        </ul>

        <BurnUp days={days} total={summary.total} />

        <footer className="db-bv-foot">
          <Link className="db-more" to={casesHref('FAILED')}>
            {m.failedCases}
          </Link>
          <Link className="db-more" to={casesHref('DRAFT')}>
            {m.pendingCases}
          </Link>
          <span className="db-bv-note">
            <i aria-hidden="true" className="db-bv-run" />
            {summary.carried > 0 ? m.noteCarried(summary.carried) : m.note}
          </span>
        </footer>
      </div>

      <aside aria-labelledby="db-bv-release" className="db-bv-release">
        <div className="db-bv-release-head">
          <h3 id="db-bv-release">{m.release.title}</h3>
          <span>{m.release.met(readiness.met, readiness.gates.length)}</span>
        </div>
        <div className="db-bv-level">
          <b className={`db-tone-text-${LEVEL_TONE[readiness.level]}`}>{m.release.levels[readiness.level]}</b>
          <span>{m.release.why[readiness.level]}</span>
        </div>
        <LevelTrack level={readiness.level} />
        <ul className="db-bv-gates">
          {readiness.gates.map((gate) => (
            <GateRow gate={gate} key={gate.key} />
          ))}
        </ul>
        <Link className="db-more db-bv-criteria" to={`${sectionHref(projectId, 'settings')}?tab=release`}>
          {m.release.change}
        </Link>
      </aside>
    </>
  )
}

function StateTile({ label, value, share, rule, tone }: { label: string; value: number; share: string; rule: string; tone: string }) {
  return (
    <li className={`db-bv-tile db-bv-tile--${tone}`}>
      <span className="db-bv-tile-name">
        <i aria-hidden="true" className={`db-bv-swatch db-bv-swatch--${tone}`} />
        {label}
      </span>
      <span className="db-bv-tile-value">
        <b>{value}</b>
        <span>{share}</span>
      </span>
      <span className="db-bv-tile-rule">{rule}</span>
    </li>
  )
}

function LevelTrack({ level }: { level: ReleaseLevel }) {
  const { t } = useI18n()
  const m = t.dashboard.verification.release
  const at = RELEASE_LEVELS.indexOf(level)
  return (
    <ol aria-label={m.levels[level]} className="db-bv-track">
      {RELEASE_LEVELS.map((step, index) => (
        <li aria-current={index === at ? 'step' : undefined} className={index <= at ? `is-on db-tone-${LEVEL_TONE[level]}` : undefined} key={step}>
          <i aria-hidden="true" />
          <span>{m.levels[step]}</span>
        </li>
      ))}
    </ol>
  )
}

function GateRow({ gate }: { gate: Gate }) {
  const { t } = useI18n()
  const m = t.dashboard.verification.release
  const unit = gate.unit === 'percent' ? '%' : m.countUnit
  return (
    <li className="db-bv-gate">
      <span aria-label={gate.met ? m.metLabel : m.missedLabel} className={gate.met ? 'db-bv-mark is-met' : 'db-bv-mark'} role="img" />
      <span className="db-bv-gate-name">{m.gates[gate.key]}</span>
      <b className={gate.met ? 'db-tone-text-success' : 'db-tone-text-critical'}>
        {gate.value}
        {unit}
      </b>
      <span className="db-bv-gate-rule">{m.limit(gate.limit, unit, gate.kind)}</span>
      {gate.unit === 'percent' && (
        <span aria-hidden="true" className="db-bv-gate-bar">
          <i className={gate.met ? 'db-tone-success' : 'db-tone-critical'} style={{ width: `${Math.min(100, gate.value)}%` }} />
          <b style={{ left: `${gate.limit}%` }} />
        </span>
      )}
    </li>
  )
}

/** 날마다 쌓은 면적. 오른쪽 끝에 상태 이름을 바로 붙여 범례로 눈을 옮기지 않게 한다. */
function BurnUp({ days, total }: { days: readonly BuildVerificationDay[]; total: number }) {
  const { t } = useI18n()
  const m = t.dashboard.verification
  const [width, ref] = useWidth(800)
  const [hover, setHover] = useState<number | null>(null)
  const right = width - LABEL_W
  const n = days.length
  const x = (index: number) => (n <= 1 ? (X0 + right) / 2 : X0 + ((right - X0) * index) / (n - 1))
  const y = (value: number) => (total === 0 ? BOTTOM : BOTTOM - ((BOTTOM - TOP) * value) / total)
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((right - X0) / 56))))

  const bands: { key: StateKey; tone: string; lower: number[]; upper: number[] }[] = []
  let lower = days.map(() => 0)
  for (const state of STATES) {
    const upper = days.map((day, index) => lower[index] + day[state.key])
    bands.push({ key: state.key, tone: state.tone, lower, upper })
    lower = upper
  }
  const judged = lower
  const area = (top: number[], bottom: number[]) =>
    n === 1
      ? `M${X0},${y(top[0])} H${right} V${y(bottom[0])} H${X0} Z`
      : `M${top.map((value, index) => `${x(index)},${y(value)}`).join(' L')} L${bottom
          .map((value, index) => `${x(index)},${y(value)}`)
          .reverse()
          .join(' L')} Z`
  const last = days[n - 1]

  // 끝 이름표: 가운데에 두되 20px 보다 가까우면 아래로 민다.
  const labels: { key: StateKey; value: number; at: number; tone: string }[] = []
  if (last) {
    const stack = [
      { key: 'pending' as const, tone: 'pending', lo: judged[n - 1], hi: total },
      ...[...bands].reverse().map((band) => ({ key: band.key, tone: band.tone, lo: band.lower[n - 1], hi: band.upper[n - 1] })),
    ]
    let previous = -Infinity
    for (const item of stack) {
      if (item.hi - item.lo <= 0) continue
      const at = Math.max(y((item.lo + item.hi) / 2), previous + 20)
      labels.push({ key: item.key, value: item.hi - item.lo, at, tone: item.tone })
      previous = at
    }
  }
  const tip = hover === null ? null : days[hover]

  return (
    <div className="db-bv-plot">
      <svg aria-label={m.chartLabel} className="db-bv-chart" height={H} ref={ref} role="img" viewBox={`0 0 ${width} ${H}`} width="100%">
        <defs>
          <pattern height="7" id="db-bv-rest" patternTransform="rotate(45)" patternUnits="userSpaceOnUse" width="7">
            <path className="db-bv-hatch" d="M0 0 V7" />
          </pattern>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <g key={fraction}>
            <line className={fraction === 0 ? 'db-bv-axis' : 'db-bv-grid'} x1={X0} x2={right} y1={y(total * fraction)} y2={y(total * fraction)} />
            <text className="db-bv-tick" textAnchor="end" x={X0 - 8} y={y(total * fraction) + 4}>
              {Math.round(total * fraction)}
            </text>
          </g>
        ))}
        {n > 0 && <path d={area(days.map(() => total), judged)} fill="url(#db-bv-rest)" />}
        {bands.map((band) => (
          <path className={`db-bv-band db-tone-fill-${band.tone}`} d={area(band.upper, band.lower)} key={band.key} />
        ))}
        <line className="db-bv-goal" x1={X0} x2={right} y1={y(total)} y2={y(total)} />
        <text className="db-bv-goal-label" x={X0 + 6} y={y(total) - 7}>
          {m.goal(total)}
        </text>
        {days.map((day, index) => (
          <g key={day.date}>
            {(index % step === 0 || index === n - 1) && (
              <text className="db-bv-tick" textAnchor="middle" x={x(index)} y={BOTTOM + 18}>
                {day.date.slice(5).replace('-', '/')}
              </text>
            )}
            {Array.from({ length: Math.min(day.runs, 6) }, (_, dot) => (
              <circle className="db-bv-run-dot" cx={x(index) - (Math.min(day.runs, 6) - 1) * 3 + dot * 6} cy={H - 6} key={dot} r={2} />
            ))}
          </g>
        ))}
        {hover !== null && <line className="db-bv-hover" x1={x(hover)} x2={x(hover)} y1={TOP} y2={BOTTOM} />}
        {labels.map((label) => (
          <g className="db-bv-end" key={label.key} transform={`translate(${right + 10},${label.at})`}>
            <rect className={label.tone === 'pending' ? 'db-bv-end-swatch is-pending' : `db-bv-end-swatch db-tone-fill-${label.tone}`} height="8" rx="2" width="8" y="-4" />
            <text x="14" y="4">
              <tspan className="db-bv-end-value">{label.value}</tspan> {m.states[label.key]}
            </text>
          </g>
        ))}
        {days.map((day, index) => (
          <rect
            className="db-bv-hit"
            height={BOTTOM - TOP}
            key={day.date}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            width={n <= 1 ? right - X0 : (right - X0) / (n - 1)}
            x={n <= 1 ? X0 : x(index) - (right - X0) / (n - 1) / 2}
            y={TOP}
          />
        ))}
      </svg>
      {tip && hover !== null && (
        <div className="db-bv-tip" role="status" style={x(hover) > width / 2 ? { right: width - x(hover) + 12 } : { left: x(hover) + 12 }}>
          <b>
            {tip.date.slice(5).replace('-', '/')} <span>· {m.runs(tip.runs)}</span>
          </b>
          <dl>
            {STATES.map((state) => (
              <div key={state.key}>
                <dt>
                  <i aria-hidden="true" className={`db-bv-swatch db-bv-swatch--${state.tone}`} />
                  {m.states[state.key]}
                </dt>
                <dd>{tip[state.key]}</dd>
              </div>
            ))}
            <div className="db-bv-tip-rest">
              <dt>{m.states.pending}</dt>
              <dd>{total - judgedOf(tip)}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}

function VerificationSkeleton({ title }: { title: string }) {
  return (
    <div aria-busy="true" className="db-bv-main db-bv-skeleton">
      <h2 className="db-bv-title" id="db-bv-title">
        {title}
      </h2>
      <span aria-hidden="true" className="skeleton-line" />
      <div aria-hidden="true" className="db-bv-tiles">
        {[0, 1, 2, 3, 4].map((index) => (
          <span className="db-bv-tile" key={index}>
            <span className="skeleton-line skeleton-line--short" />
            <span className="skeleton-line" />
          </span>
        ))}
      </div>
      <span aria-hidden="true" className="skeleton-line db-bv-skeleton-chart" />
    </div>
  )
}
