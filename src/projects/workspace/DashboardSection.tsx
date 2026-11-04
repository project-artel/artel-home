import { buildDisplayName } from '../buildEnvironment'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { dashboardEn } from '../../i18n/messages/dashboard'
import { useI18n } from '../../i18n/useI18n'
import { ISSUE_SEVERITIES, type Issue } from '../../issues/issueTypes'
import { SeverityTag } from '../../issues/SeverityTag'
import type { QaRunSummary } from '../../qa/launch/qaLaunchApi'
import { qaRunPath } from '../../qa/qaTypes'
import type { TestCaseCoverage } from '../../testCases/testCaseTypes'
import { versionName } from '../../testCases/testCaseVersions'
import { VersionTreeDialog } from '../../testCases/VersionTreeDialog'
import { formatDate } from '../formatters'
import { versionBuilds } from '../gameBuilds'
import { CostChart, Meter, OutcomeStrip, Spark, StackBar, WeekBars } from './dashboard/DashboardCharts'
import { ChangedCasesDialog } from './dashboard/ChangedCasesDialog'
import { compareVersions, costByRun, countByDay, countByWeek, formatTokens, scenarioHistories, shortDay, weekStarts, type StatusCounts } from './dashboard/dashboardModel'
import { createFreeRun } from './dashboard/freeRun'
import { FreeRunPicker } from './dashboard/FreeRunPicker'
import { pickItems } from './dashboard/freeRunCases'
import { DashboardReliability } from './dashboard/DashboardReliability'
import { useDashboardData, useVersionPair } from './dashboard/useDashboardData'
import { VerdictTrend } from './dashboard/VerdictTrend'
import './dashboard/dashboard.css'
import { sectionHref } from './sections'
import { useWorkspace } from './workspaceContext'

const PERIODS = [7, 30, 90] as const
type Period = (typeof PERIODS)[number]
const HISTORY_ROWS = 8
const LIVE = new Set(['RUNNING', 'STARTING', 'PENDING'])
/** 빌드 선 색. 같은 순서로 돌려 쓴다 — 빌드 이름으로 색을 정하면 새 빌드마다 색이 바뀐다. */
const SERIES = ['series-1', 'series-2', 'series-3', 'series-4'] as const

/**
 * 프로젝트 대시보드(ARTEL-1164). 숫자 칸 아래에 QA 판정 추이를 크게 두고(ARTEL-1387), 돌아온 사람이 먼저 묻는 세 가지 —
 * 검증할 게 몇 개 남았나, 문제가 몇 개인가, 이전 버전보다 나아졌나 — 를 그 아래에 둔다. 세 칸은 케이스 라이브러리 칸에서
 * 고른 버전(처음엔 최신)을 따른다. 그 아래 진행 중인 QA · 끝난 QA · 실행마다 비용 · 이슈 흐름 · 시나리오별 최근 결과 ·
 * QA agent 신뢰도, 맨 밑에 게임 정보를 둔다.
 * Sentry 프로젝트 화면(숫자 카드 + 추세)과 BrowserStack Testing Trends(빌드 요약 · 테스트마다 최근 결과 칸)를 참고했다.
 * 서버는 늘리지 않았다 — 칸마다 이미 있는 API 를 읽고(`useDashboardData`) 숫자는 `dashboardModel` 이 접는다.
 */
export function DashboardSection() {
  const { t } = useI18n()
  const m = t.dashboard
  const { builds, coverage, documents, extrasStatus, instances, openIssues, project, projectId, runs, refreshRuns } = useWorkspace()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>(30)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [freeRunOpen, setFreeRunOpen] = useState(false)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [versionPickerOpen, setVersionPickerOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const data = useDashboardData(projectId, 0)
  const versions = useVersionPair(projectId, data.library, versionId)
  const settled = extrasStatus === 'ready'
  const [now] = useState(() => new Date())
  const since = useMemo(() => new Date(now.getTime() - period * 86_400_000).toISOString(), [now, period])

  const qaRuns = useMemo(() => (data.qaRuns.status === 'ready' ? data.qaRuns.value : []), [data.qaRuns])
  const inPeriod = qaRuns.filter((run) => run.startedAt >= since)
  // 진행 중인 실행은 기간과 상관없이 따로 보이고, QA 실행 수 · 최근 QA 는 끝난 실행만 센다.
  const liveRuns = qaRuns.filter((run) => LIVE.has(run.status))
  const finished = inPeriod.filter((run) => !LIVE.has(run.status))
  const pair = versions.status === 'ready' ? versions.value : null
  const comparison = pair === null ? null : compareVersions(pair.rows, pair.previous !== null)
  const currentName = pair ? versionName(pair.current) : ''
  const previousName = pair?.previous ? versionName(pair.previous) : ''

  // 숫자 칸
  const weeks = weekStarts(now, 8)
  const runsPerWeek = countByWeek(runs.map((run) => run.createdAt), weeks)
  const qaPerDay = countByDay(qaRuns.map((run) => run.startedAt), now, 14)
  const allIssues = data.issues.status === 'ready' ? data.issues.value : openIssues
  const issuesPerWeek = countByWeek(allIssues.map((issue) => issue.reportedAt), weeks)
  const resolvedPerWeek = countByWeek(allIssues.map((issue) => issue.resolvedAt), weeks)
  const failedRuns = finished.filter((run) => run.status === 'FAILED').length
  const urgent = openIssues.filter((issue) => issue.severity === 'BLOCKER' || issue.severity === 'CRITICAL')

  // 비용
  const runOfTry = useMemo(
    () => new Map((data.tries.status === 'ready' ? data.tries.value : []).map((item) => [item.id, item.qaRunId])),
    [data.tries],
  )
  const costPoints = useMemo(
    () => (data.usage.status === 'ready' ? costByRun(data.usage.value, runOfTry, qaRuns) : []).filter((point) => point.startedAt >= since),
    [data.usage, runOfTry, qaRuns, since],
  )
  const costBuilds = [...new Set(costPoints.map((point) => point.build))]
  const colorOf = (build: string) => `var(--db-${SERIES[Math.max(0, costBuilds.indexOf(build)) % SERIES.length]})`
  const shownCost = costPoints.filter((point) => !hidden.has(point.build))
  const totalTokens = shownCost.reduce((sum, point) => sum + point.tokens, 0)
  const totalCost = shownCost.reduce((sum, point) => sum + (point.costUsd ?? 0), 0)
  const unpriced = shownCost.some((point) => point.costUsd === null)
  const peak = shownCost.reduce<(typeof shownCost)[number] | null>((best, point) => (best === null || point.tokens > best.tokens ? point : best), null)

  // 시나리오
  const titles = useMemo(
    () => new Map((data.scenarios.status === 'ready' ? data.scenarios.value : []).map((scenario) => [String(scenario.testScenarioId), scenario.title])),
    [data.scenarios],
  )
  const histories = useMemo(
    () => (data.tries.status === 'ready' ? scenarioHistories(data.tries.value, (id) => titles.get(id) || null) : []),
    [data.tries, titles],
  )

  // Free 실행: 고르는 dialog 를 연다. 버튼 문구는 먼저 볼 것(이전 빌드에서 판정이 있던 TC)이 있으면 그 수를 말한다.
  const firstCheck = comparison ? comparison.remaining.wasFailing.length + comparison.remaining.wasPassing.length : 0
  const left = comparison ? comparison.remaining.wasFailing.length + comparison.remaining.wasPassing.length + comparison.remaining.firstTime.length : 0
  const judgedPct = comparison && comparison.total > 0 ? `${Math.round(((comparison.total - left) / comparison.total) * 100)}%` : '0%'

  const newestRuns = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const gameBuilds = versionBuilds(builds)
  const issueHref = (issue: Issue) => `${sectionHref(projectId, 'issues')}?issue=${encodeURIComponent(issue.id)}`

  return (
    <div className="db">
      <div className="db-toolbar">
        <div aria-label={m.period} className="db-periods" role="group">
          {PERIODS.map((value) => (
            <button aria-pressed={period === value} key={value} onClick={() => setPeriod(value)} type="button">
              {m.periods[value]}
            </button>
          ))}
        </div>
        <Link className="button button--primary db-run" to={sectionHref(projectId, 'qa')}>
          {m.runQa}
        </Link>
      </div>

      <div className="db-kpis">
        <Kpi
          delta={liveRuns.length === 0 ? m.kpi.liveNone : liveRuns.slice(0, 3).map((run) => `#${run.id}`).join(' · ')}
          href={sectionHref(projectId, 'qa')}
          label={m.kpi.live}
          tone={liveRuns.length > 0 ? 'reasoning' : undefined}
          value={data.qaRuns.status === 'ready' ? String(liveRuns.length) : '—'}
        >
          <Spark tone="default" values={qaPerDay} />
        </Kpi>
        <Kpi
          delta={failedRuns > 0 ? m.kpi.failed(failedRuns) : m.kpi.noFailures}
          href={sectionHref(projectId, 'qa-history')}
          label={m.kpi.qaRuns}
          tone={failedRuns > 0 ? 'critical' : undefined}
          value={data.qaRuns.status === 'ready' ? String(finished.length) : '—'}
        >
          <Spark tone={failedRuns > 0 ? 'critical' : 'default'} values={qaPerDay} />
        </Kpi>
        <Kpi
          delta={openIssues.length === 0 ? m.kpi.allClear : m.kpi.thisWeek(issuesPerWeek[7])}
          href={sectionHref(projectId, 'issues')}
          label={m.kpi.openIssues}
          tone={openIssues.length > 0 ? 'warning' : undefined}
          value={settled ? String(openIssues.length) : '—'}
        >
          <Spark tone={openIssues.length > 0 ? 'warning' : 'default'} values={issuesPerWeek} />
        </Kpi>
        <div className="db-kpi">
          <span className="db-kpi-text">
            <span className="db-kpi-head">
              <span className="db-kpi-label">{m.kpi.library}</span>
              {pair && (
                <button aria-label={m.kpi.pickVersion(currentName)} className="db-build db-version-pick" onClick={() => setVersionPickerOpen(true)} type="button">
                  {currentName}
                  <span aria-hidden="true">▾</span>
                </button>
              )}
            </span>
            <Link className="db-kpi-value" to={sectionHref(projectId, 'test-cases') + (pair ? `?version=${encodeURIComponent(pair.current.gameBuildId)}` : '')}>
              <b>{settled ? `${coverage.authored}/${coverage.total}` : '—'}</b>
              <span className={coverage.unauthored > 0 ? 'db-kpi-delta db-warning' : 'db-kpi-delta'}>
                {coverage.unauthored > 0 ? m.kpi.uncovered(coverage.unauthored) : m.kpi.allCovered}
              </span>
            </Link>
            {comparison && <span className="db-kpi-delta">{m.kpi.judgedOf(judgedPct)}</span>}
          </span>
          <Meter value={coverage.total === 0 ? 0 : coverage.authored / coverage.total} />
        </div>
      </div>

      <VerdictTrend
        days={period}
        now={now}
        projectId={projectId}
        qaRuns={qaRuns}
        version={pair ? { gameBuildId: pair.current.gameBuildId, name: currentName } : null}
      />

      <div className="db-trio">
        {/* 검증 남은 TC */}
        <section aria-labelledby="db-left" className="db-card">
          <header className="db-card-head">
            <h2 className="db-cap" id="db-left">
              {m.remaining.title}
            </h2>
            {pair && <span className="db-build">{currentName}</span>}
          </header>
          {comparison === null ? (
            <p className="db-quiet">{versions.status === 'failed' ? m.failedToLoad : versions.status === 'loading' ? '…' : m.compare.noVersions}</p>
          ) : (
            <>
              <p className="db-big">
                <b>{left}</b>
                <span>{m.remaining.ofTotal(comparison.total, judgedPct)}</span>
              </p>
              <StackBar
                label={`${m.remaining.title} ${left}`}
                parts={[
                  { value: comparison.remaining.wasFailing.length, tone: 'warning' },
                  { value: comparison.remaining.wasPassing.length, tone: 'reasoning' },
                  { value: comparison.remaining.firstTime.length, tone: 'muted' },
                ]}
              />
              <ul className="db-legend">
                {pair?.previous && (
                  <>
                    <Legend hint={m.remaining.wasFailingHint(previousName)} label={m.remaining.wasFailing} tone="warning" value={comparison.remaining.wasFailing.length} />
                    <Legend hint={m.remaining.wasPassingHint(previousName)} label={m.remaining.wasPassing} tone="reasoning" value={comparison.remaining.wasPassing.length} />
                  </>
                )}
                <Legend hint={m.remaining.firstTimeHint} label={m.remaining.firstTime} tone="muted" value={comparison.remaining.firstTime.length} />
              </ul>
              {left === 0 ? (
                <p className="db-quiet">{m.remaining.nothingLeft}</p>
              ) : (
                <div className="db-free">
                  <button className="button button--primary" onClick={() => setFreeRunOpen(true)} type="button">
                    {firstCheck > 0 ? m.remaining.freeRun(firstCheck) : m.remaining.freeRunAll(left)}
                  </button>
                  <span className="db-quiet">{m.remaining.freeRunNote}</span>
                </div>
              )}
            </>
          )}
        </section>

        {/* 문제 */}
        <section aria-labelledby="db-prob" className="db-card">
          <h2 className="db-cap" id="db-prob">
            {m.problems.title}
          </h2>
          <div className="db-tiles">
            <Tile href={sectionHref(projectId, 'test-cases')} label={m.problems.failed} tone={comparison && comparison.current.failed > 0 ? 'critical' : undefined} value={comparison ? comparison.current.failed : '—'} />
            <Tile href={sectionHref(projectId, 'test-cases')} label={m.problems.regression} tone={comparison && comparison.current.regression > 0 ? 'critical' : undefined} value={comparison ? comparison.current.regression : '—'} />
            <Tile href={sectionHref(projectId, 'issues')} label={m.problems.openIssues} tone={openIssues.length > 0 ? 'warning' : undefined} value={settled ? openIssues.length : '—'} />
            <Tile href={sectionHref(projectId, 'issues')} label={m.problems.blocker} tone={urgent.length > 0 ? 'critical' : undefined} value={settled ? urgent.length : '—'} />
          </div>
          <IssueLines href={issueHref} issues={sortBySeverity(openIssues).slice(0, 2)} />
        </section>

        {/* 이전 버전과 비교 */}
        <section aria-labelledby="db-cmp" className="db-card">
          <header className="db-card-head">
            <h2 className="db-cap" id="db-cmp">
              {m.compare.title}
            </h2>
            {pair?.previous && (
              <span className="db-quiet">
                {m.compare.against} <span className="db-build">{previousName}</span>
              </span>
            )}
          </header>
          {comparison === null || pair === null ? (
            <p className="db-quiet">{versions.status === 'failed' ? m.failedToLoad : versions.status === 'loading' ? '…' : m.compare.noVersions}</p>
          ) : (
            <>
              <CompareTable comparison={comparison} current={currentName} labels={m.compare} previous={comparison.previous ? previousName : null} />
              {comparison.previous ? (
                <>
                  <p className="db-quiet">{m.compare.note(comparison.total, currentName, judgedPct, left)}</p>
                  {comparison.changed.length > 0 && (
                    <button className="db-more db-link-button" onClick={() => setChangesOpen(true)} type="button">
                      {m.compare.changedLink(comparison.changed.length)}
                    </button>
                  )}
                </>
              ) : (
                <p className="db-quiet">{m.compare.single}</p>
              )}
            </>
          )}
        </section>
      </div>

      {/* 진행 중인 QA */}
      <section aria-labelledby="db-live" className="db-card db-card--flush">
        <header className="db-card-head db-card-head--pad">
          <h2 id="db-live">{m.live.title}</h2>
          <span className="db-quiet">{m.live.sub(liveRuns.length)}</span>
        </header>
        {data.qaRuns.status === 'failed' ? (
          <p className="db-quiet db-pad">{m.failedToLoad}</p>
        ) : liveRuns.length === 0 ? (
          <p className="db-quiet db-pad">{data.qaRuns.status === 'loading' ? '…' : m.live.empty}</p>
        ) : (
          <div aria-label={m.live.title} className="db-table" role="table">
            <HistoryHead labels={m.history} />
            {liveRuns.map((run) => (
              <RunRow key={run.id} labels={m.history} live projectId={projectId} run={run} when={m.live.started(Math.max(0, Math.round((now.getTime() - Date.parse(run.startedAt)) / 60_000)))} />
            ))}
          </div>
        )}
      </section>

      {/* QA 히스토리 */}
      <section aria-labelledby="db-hist" className="db-card db-card--flush">
        <header className="db-card-head db-card-head--pad">
          <h2 id="db-hist">{m.history.title}</h2>
          <span className="db-quiet">{m.history.sub(Math.min(HISTORY_ROWS, finished.length))}</span>
          <Link className="db-more" to={sectionHref(projectId, 'qa-history')}>
            {m.history.all}
          </Link>
        </header>
        {data.qaRuns.status === 'failed' ? (
          <p className="db-quiet db-pad">{m.failedToLoad}</p>
        ) : finished.length === 0 ? (
          <p className="db-quiet db-pad">{data.qaRuns.status === 'loading' ? '…' : m.history.empty}</p>
        ) : (
          <div aria-label={m.history.title} className="db-table" role="table">
            <HistoryHead labels={m.history} />
            {finished.slice(0, HISTORY_ROWS).map((run) => {
              const took = run.completedAt ? m.history.took(Math.round((Date.parse(run.completedAt) - Date.parse(run.startedAt)) / 60_000)) : m.history.inProgress
              return <RunRow key={run.id} labels={m.history} projectId={projectId} run={run} when={`${formatDate(run.startedAt)} · ${took}`} />
            })}
          </div>
        )}
      </section>

      <div className="db-pair">
        {/* 실행마다 토큰 비용 */}
        <section aria-labelledby="db-cost" className="db-card">
          <header className="db-card-head">
            <h2 id="db-cost">{m.cost.title}</h2>
            <span className="db-quiet">{m.cost.sub(costPoints.length)}</span>
            <div aria-label={m.cost.toggle} className="db-series" role="group">
              {costBuilds.map((build) => (
                <button
                  aria-pressed={!hidden.has(build)}
                  key={build}
                  onClick={() =>
                    setHidden((current) => {
                      const next = new Set(current)
                      if (next.has(build)) next.delete(build)
                      else next.add(build)
                      return next
                    })
                  }
                  style={{ color: colorOf(build) }}
                  type="button"
                >
                  <span aria-hidden="true" />
                  {build}
                </button>
              ))}
            </div>
            <Link className="db-more" to={sectionHref(projectId, 'usage')}>
              {m.cost.details}
            </Link>
          </header>
          {costPoints.length === 0 ? (
            <p className="db-quiet db-pad">{data.usage.status === 'failed' ? m.failedToLoad : data.usage.status === 'loading' ? '…' : m.cost.empty}</p>
          ) : (
            <>
              <dl className="db-cost-stats">
                <div>
                  <dt>{m.cost.total}</dt>
                  <dd>
                    {formatTokens(totalTokens)} · ${totalCost.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt>{m.cost.average}</dt>
                  <dd>
                    {formatTokens(Math.round(totalTokens / Math.max(1, shownCost.length)))} · ${(totalCost / Math.max(1, shownCost.length)).toFixed(3)}
                  </dd>
                </div>
                {peak && (
                  <div>
                    <dt>{m.cost.peak}</dt>
                    <dd>
                      #{peak.qaRunId} · {formatTokens(peak.tokens)}
                    </dd>
                  </div>
                )}
              </dl>
              <CostChart
                colorOf={colorOf}
                hidden={hidden}
                label={`${m.cost.title}: ${shownCost.map((point) => `#${point.qaRunId} ${point.build} $${(point.costUsd ?? 0).toFixed(3)}`).join(', ')}`}
                points={costPoints}
              />
              {unpriced && <p className="db-quiet">{m.cost.unpriced}</p>}
            </>
          )}
        </section>

        {/* 이슈 흐름 */}
        <section aria-labelledby="db-iss" className="db-card">
          <header className="db-card-head">
            <h2 id="db-iss">{m.issues.title}</h2>
            <span className="db-quiet">{m.issues.sub}</span>
            <Link className="db-more" to={sectionHref(projectId, 'issues')}>
              {m.issues.all}
            </Link>
          </header>
          <WeekBars
            added={issuesPerWeek}
            label={`${m.issues.title}: ${weeks.map((week, index) => `${week.getMonth() + 1}/${week.getDate()} +${issuesPerWeek[index]} / ${resolvedPerWeek[index]}`).join(', ')}`}
            labels={weeks.map((week) => `${week.getMonth() + 1}/${week.getDate()}`)}
            resolved={resolvedPerWeek}
          />
          <ul className="db-legend db-legend--row">
            <Legend label={m.issues.added} tone="warning" />
            <Legend label={m.issues.resolved} tone="success" />
          </ul>
          {openIssues.length === 0 ? <p className="db-quiet">{m.issues.none}</p> : <IssueLines href={issueHref} issues={sortBySeverity(openIssues).slice(0, 3)} />}
        </section>
      </div>

      {/* 시나리오별 최근 결과 */}
      <section aria-labelledby="db-scn" className="db-card db-card--flush">
        <header className="db-card-head db-card-head--pad">
          <h2 id="db-scn">{m.scenarios.title}</h2>
          <span className="db-quiet">{m.scenarios.sub}</span>
          <Link className="db-more" to={sectionHref(projectId, 'qa-history')}>
            {m.scenarios.all}
          </Link>
        </header>
        {histories.length === 0 ? (
          <p className="db-quiet db-pad">{data.tries.status === 'loading' ? '…' : m.scenarios.empty}</p>
        ) : (
          <ul className="db-scenarios">
            {histories.map((history) => (
              <li key={history.testScenarioId}>
                <Link to={`/projects/${encodeURIComponent(projectId)}/test-scenarios/${encodeURIComponent(history.testScenarioId)}`}>
                  <b className="db-ellipsis">{history.title}</b>
                  <OutcomeStrip label={history.outcomes.map((outcome) => m.scenarios.outcome[outcome]).join(' ')} outcomes={history.outcomes} />
                  <span className={`db-verdict db-verdict--${history.verdict.toLowerCase()}`}>{m.scenarios.verdict[history.verdict]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DashboardReliability projectId={projectId} days={period} now={now.getTime()} />

      <div className="db-pair db-pair--even">
        <section aria-labelledby="db-trs" className="db-card">
          <header className="db-card-head">
            <h2 id="db-trs">{m.recentRuns}</h2>
            {settled && <span className="db-quiet">{m.recentRunsSub(runs.length, runsPerWeek[7])}</span>}
            <Link className="db-more" to={sectionHref(projectId, 'test-runs')}>
              {t.projects.workspace.seeAll}
            </Link>
          </header>
          {!settled ? (
            <p className="db-quiet">{t.scenarios.runList.loading}</p>
          ) : runs.length === 0 ? (
            <p className="db-quiet">{t.scenarios.runList.empty}</p>
          ) : (
            <ul className="db-lines">
              {newestRuns.slice(0, 5).map((run) => (
                <li key={run.id}>
                  <Link to={`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(run.id)}/edit`}>
                    <b className="db-ellipsis">{run.name.length > 0 ? run.name : t.scenarios.runList.untitled}</b>
                    <span className="db-muted">{formatDate(run.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <UncoveredPanel coverage={coverage} projectId={projectId} settled={settled} />
      </div>

      {/* 맨 밑: 게임 정보 */}
      <section aria-labelledby="db-game" className="db-card db-game">
        <header className="db-card-head">
          <h2 id="db-game">{m.game.title}</h2>
          <Link className="db-more" to={sectionHref(projectId, 'settings')}>
            {m.game.edit}
          </Link>
        </header>
        <dl>
          <div>
            <dt>{m.game.name}</dt>
            <dd>
              {project.name} · {t.projects.genreLabels[project.genre]}
            </dd>
          </div>
          <div>
            <dt>{m.game.consoles}</dt>
            <dd>
              {instances.length === 0
                ? m.game.noConsoles
                : instances.slice(0, 3).map((instance) => (
                    <span className="db-console" key={instance.id}>
                      <span aria-hidden="true" className={instance.connected ? 'status-dot status-dot--connected' : 'status-dot'} />
                      {instance.name} · {instance.connected ? t.projects.instances.connected : t.projects.instances.notConnected}
                    </span>
                  ))}
            </dd>
          </div>
          <div>
            <dt>{m.game.builds}</dt>
            <dd className="db-mono">{gameBuilds.length === 0 ? m.game.noBuilds : gameBuilds.map(buildDisplayName).join(' · ')}</dd>
          </div>
          <div>
            <dt>{m.game.document}</dt>
            <dd>
              {documents.length === 0 ? (
                m.game.noDocument
              ) : (
                <Link to={sectionHref(projectId, 'documents')}>
                  {documents[0].fileName} · v{documents[0].version}
                </Link>
              )}
            </dd>
          </div>
          <div>
            <dt>{m.game.created}</dt>
            <dd className="db-mono">{formatDate(project.createdAt)}</dd>
          </div>
        </dl>
        {project.description !== null && project.description.length > 0 && <p className="db-quiet">{project.description}</p>}
      </section>

      {versionPickerOpen && data.library.status === 'ready' && pair && (
        <VersionTreeDialog
          confirmLabel={m.versionPicker.confirm}
          groups={data.library.value.groups}
          hint={m.versionPicker.hint}
          initialId={pair.current.gameBuildId}
          onClose={() => setVersionPickerOpen(false)}
          onConfirm={(gameBuildId) => {
            setVersionId(gameBuildId)
            setVersionPickerOpen(false)
          }}
          title={m.versionPicker.title}
          versions={data.library.value.versions}
        />
      )}

      {changesOpen && pair && comparison && (
        <ChangedCasesDialog
          changed={comparison.changed}
          current={currentName}
          libraryHref={(change) => {
            const version = change.kind === 'DROPPED' && pair.previous ? pair.previous.gameBuildId : pair.current.gameBuildId
            return `${sectionHref(projectId, 'test-cases')}?version=${encodeURIComponent(version)}&case=${encodeURIComponent(change.testCase.id)}`
          }}
          onClose={() => setChangesOpen(false)}
          previous={previousName}
        />
      )}

      {freeRunOpen && pair && comparison && (
        <FreeRunPicker
          build={currentName}
          comparedTo={pair.previous ? previousName : null}
          items={pickItems(pair.rows, comparison.remaining)}
          onClose={() => setFreeRunOpen(false)}
          onCreate={async (caseIds) => {
            const name = m.remaining.runName(currentName, caseIds.length, shortDay(new Date().toISOString()))
            const runId = await createFreeRun(projectId, pair.current.gameBuildId, name, caseIds)
            await refreshRuns()
            navigate(`${sectionHref(projectId, 'qa')}?run=${encodeURIComponent(runId)}&engine=agent`)
          }}
          remaining={comparison.remaining}
        />
      )}
    </div>
  )
}

function Kpi({ href, label, value, delta, tone, children }: { href: string; label: string; value: string; delta: string; tone?: 'critical' | 'warning' | 'reasoning'; children: ReactNode }) {
  return (
    <Link className="db-kpi" to={href}>
      <span className="db-kpi-text">
        <span className="db-kpi-label">{label}</span>
        <span className="db-kpi-value">
          <b>{value}</b>
          <span className={tone ? `db-kpi-delta db-${tone}` : 'db-kpi-delta'}>{delta}</span>
        </span>
      </span>
      {children}
    </Link>
  )
}

function Legend({ tone, label, hint, value }: { tone: string; label: string; hint?: string; value?: number }) {
  return (
    <li>
      <span aria-hidden="true" className={`db-swatch db-tone-${tone}`} />
      {label}
      {hint && <span className="db-muted db-hint">{hint}</span>}
      {value !== undefined && <b className="db-mono db-legend-value">{value}</b>}
    </li>
  )
}

function Tile({ href, value, label, tone }: { href: string; value: number | string; label: string; tone?: 'critical' | 'warning' }) {
  return (
    <Link className="db-tile" to={href}>
      <b className={tone ? `db-${tone}` : undefined}>{value}</b>
      <span>{label}</span>
    </Link>
  )
}

function IssueLines({ issues, href }: { issues: readonly Issue[]; href: (issue: Issue) => string }) {
  return (
    <ul className="db-issue-lines">
      {issues.map((issue) => (
        <li key={issue.id}>
          <Link to={href(issue)}>
            <SeverityTag severity={issue.severity} />
            <span className="db-ellipsis">{issue.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

type CompareLabels = { colResult: string; colChange: string; passed: string; failed: string; pending: string; fixed: string; broke: string; stillFailing: string; dropped: string; added: string }

/**
 * 이전 버전과 비교를 표로(ARTEL-1387). 위 세 줄은 두 버전의 판정 수와 차이, 아래 다섯 줄은 두 버전 사이에 바뀐 Test Case
 * 수다. 아래 줄은 한쪽에만 있는 수라 이전 칸이 비고, 빠진 Test Case 만 이전 칸에 선다.
 */
function CompareTable({ comparison, previous, current, labels }: { comparison: { previous: StatusCounts | null; current: StatusCounts; fixed: number; broke: number; stillFailing: number; dropped: number; added: number }; previous: string | null; current: string; labels: CompareLabels }) {
  const folded = (counts: StatusCounts) => ({ passed: counts.passed, failed: counts.failed + counts.regression, pending: counts.pending + counts.broken })
  const now = folded(comparison.current)
  const before = comparison.previous ? folded(comparison.previous) : null
  const results: { label: string; key: 'passed' | 'failed' | 'pending'; good: 1 | -1 | 0 }[] = [
    { label: labels.passed, key: 'passed', good: 1 },
    { label: labels.failed, key: 'failed', good: -1 },
    { label: labels.pending, key: 'pending', good: 0 },
  ]
  const moves: { label: string; before: number | null; now: number | null; good: 1 | -1 | 0 }[] = [
    { label: labels.fixed, before: null, now: comparison.fixed, good: 1 },
    { label: labels.broke, before: null, now: comparison.broke, good: -1 },
    { label: labels.stillFailing, before: null, now: comparison.stillFailing, good: -1 },
    { label: labels.added, before: null, now: comparison.added, good: 0 },
    { label: labels.dropped, before: comparison.dropped, now: null, good: 0 },
  ]
  const change = (value: number, good: 1 | -1 | 0) => (
    <td className={value === 0 || good === 0 ? 'db-muted' : value * good > 0 ? 'db-success' : 'db-critical'}>{value === 0 ? '0' : `${value > 0 ? '+' : '−'}${Math.abs(value)}`}</td>
  )
  return (
    <table className="db-cmp-table">
      <thead>
        <tr>
          <th scope="col">{labels.colResult}</th>
          {previous !== null && <th scope="col">{previous}</th>}
          <th scope="col">{current}</th>
          {previous !== null && <th scope="col">{labels.colChange}</th>}
        </tr>
      </thead>
      <tbody>
        {results.map((row) => (
          <tr key={row.key}>
            <th scope="row">
              <span aria-hidden="true" className={`db-swatch db-tone-${row.key === 'passed' ? 'success' : row.key === 'failed' ? 'critical' : 'muted'}`} />
              {row.label}
            </th>
            {before !== null && <td>{before[row.key]}</td>}
            <td className="db-strong">{now[row.key]}</td>
            {before !== null && change(now[row.key] - before[row.key], row.good)}
          </tr>
        ))}
      </tbody>
      {previous !== null && (
        <tbody className="db-cmp-moves">
          {moves.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.before ?? '—'}</td>
              <td className="db-strong">{row.now ?? '—'}</td>
              {change((row.now ?? 0) - (row.before ?? 0), row.good)}
            </tr>
          ))}
        </tbody>
      )}
    </table>
  )
}

type HistoryLabels = typeof dashboardEn.history

function HistoryHead({ labels }: { labels: HistoryLabels }) {
  return (
    <div className="db-row db-row--head" role="row">
      <span role="columnheader">#</span>
      <span role="columnheader">{labels.colRun}</span>
      <span role="columnheader">{labels.colBuild}</span>
      <span role="columnheader">{labels.colAgent}</span>
      <span role="columnheader">{labels.colPassed}</span>
      <span role="columnheader">{labels.colStatus}</span>
      <span role="columnheader">{labels.colIssues}</span>
      <span role="columnheader">{labels.colWhen}</span>
    </div>
  )
}

/** 진행 중인 QA · 최근 QA 가 함께 쓰는 실행 한 줄. */
function RunRow({ run, projectId, labels, when, live = false }: { run: QaRunSummary; projectId: string; labels: HistoryLabels; when: string; live?: boolean }) {
  const pct = run.casesTotal ? Math.round(((run.casesPassed ?? 0) / run.casesTotal) * 100) : 0
  return (
    <Link className={`db-row${live ? ' is-live' : ''}`} role="row" to={qaRunPath(projectId, run.id)}>
      <span className="db-mono db-muted" role="cell">
        #{run.id}
      </span>
      <b className="db-ellipsis" role="cell">
        {run.testRunName ?? `#${run.testRunId}`}
      </b>
      <span role="cell">{run.gameBuildVersion && <span className="db-build">{buildDisplayName({ version: run.gameBuildVersion, isEditor: run.gameBuildIsEditor })}</span>}</span>
      <span className="db-ellipsis db-muted" role="cell">
        {[shortModel(run.model) ?? labels.noAgent, run.gameInstanceName].filter(Boolean).join(' · ')}
      </span>
      <span className="db-pass" role="cell">
        <span className="db-meter">
          <span className={live ? 'db-tone-reasoning' : pct >= 80 ? 'db-tone-success' : pct >= 40 ? 'db-tone-warning' : 'db-tone-critical'} style={{ width: `${pct}%` }} />
        </span>
        <span className="db-mono">{run.casesTotal ? `${run.casesPassed ?? 0}/${run.casesTotal}` : '—'}</span>
      </span>
      <span className={`db-status db-status--${run.status.toLowerCase()}`} role="cell">
        {labels.status[run.status] ?? run.status}
      </span>
      <span className={`db-mono ${run.issueCount > 0 ? 'db-warning' : 'db-muted'}`} role="cell">
        {run.issueCount > 0 ? run.issueCount : '—'}
      </span>
      <span className="db-muted" role="cell">
        {when}
      </span>
    </Link>
  )
}

/**
 * 어떤 시나리오에도 담기지 않은 케이스, 씬별. 씬을 누르면 그 요청이 채워진 새 런 화면으로 간다 — 보내지는 않는다.
 * 요청은 사용자가 고칠 몫이다(이전 대시보드와 같은 동작).
 */
function UncoveredPanel({ coverage, projectId, settled }: { coverage: TestCaseCoverage; projectId: string; settled: boolean }) {
  const { t } = useI18n()
  const u = t.projects.workspace.uncovered
  return (
    <section aria-labelledby="db-unc" className="db-card">
      <header className="db-card-head">
        <h2 id="db-unc">{u.title}</h2>
        {coverage.total > 0 && <span className="db-quiet">{u.verification(coverage.verified, coverage.draft, coverage.broken)}</span>}
      </header>
      {!settled ? (
        <p className="db-quiet">{t.qa.panel.loading}</p>
      ) : coverage.uncoveredScenes.length === 0 ? (
        <p className="db-quiet">{u.empty}</p>
      ) : (
        <ul className="db-lines">
          {coverage.uncoveredScenes.map((entry) => (
            <li key={entry.scene}>
              <span className="db-uncovered">
                <b>{entry.scene}</b>
                <span className="db-muted">{u.sceneCount(entry.count)}</span>
                <Link
                  className="db-more"
                  to={{
                    pathname: `/projects/${encodeURIComponent(projectId)}/test-runs`,
                    search: `?draft=${encodeURIComponent(u.requestFor(entry.scene, entry.count))}`,
                  }}
                >
                  {u.draftRequest}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function sortBySeverity(issues: readonly Issue[]): Issue[] {
  return [...issues].sort((a, b) => ISSUE_SEVERITIES.indexOf(a.severity) - ISSUE_SEVERITIES.indexOf(b.severity) || b.reportedAt.localeCompare(a.reportedAt))
}

/** `openai/gpt-6-luna` → `gpt-6-luna`. 공급자 이름은 칸이 좁아 뺀다. */
function shortModel(model: string | null): string | null {
  if (model === null) return null
  const last = model.split('/').pop() ?? model
  return last.replace(/^us\.anthropic\./, '').replace(/-\d{8}-v\d+:\d+$/, '')
}
