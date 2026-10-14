import { useEffect, useId, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { UnauthorizedError } from '../shared/adminApi'
import { adminFormat, toDateInputValue } from '../shared/format'
import { ProjectPicker } from '../shared/projects/ProjectPicker'
import { ALL_PROJECTS } from '../shared/projects/pick'
import { listProjects, type ProjectSummary } from '../shared/projects/projectsApi'
import { BreakdownTable } from './BreakdownTable'
import { DailyTrend } from './DailyTrend'
import { QaRunCosts } from './QaRunCosts'
import { TotalsRail } from './TotalsRail'
import { fetchLlmUsageStats, fetchQaRunUsage } from './llmUsageApi'
import type { LlmUsageStats, QaRunUsage } from './llmUsageTypes'
import './usage.css'

const QA_RUN_COUNT = 50
const DEFAULT_WINDOW_DAYS = 30

/** 로컬 달력 기준 자정. 기간 경계를 UTC로 자르면 한국에서 하루가 밀린다. */
function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

interface Loaded {
  stats: LlmUsageStats
  runs: QaRunUsage[]
}

interface Request {
  scope: string
  from: Date
  to: Date
  revision: number
}

export default function UsagePage() {
  const { t, locale } = useI18n()
  const strings = t.adminUsage
  const format = adminFormat(locale)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  // `to`는 배타 경계라 "오늘까지"는 내일 자정이다.
  const [request, setRequest] = useState<Request>(() => ({
    scope: ALL_PROJECTS,
    from: addDays(startOfDay(new Date()), -DEFAULT_WINDOW_DAYS),
    to: addDays(startOfDay(new Date()), 1),
    revision: 0,
  }))
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const fromFieldId = useId()
  const toFieldId = useId()
  const { scope, from, to, revision } = request

  function updateRequest(next: Partial<Request>) {
    setLoading(true)
    setError(false)
    setRequest((current) => ({ ...current, ...next }))
  }

  useEffect(() => {
    const controller = new AbortController()
    listProjects(controller.signal)
      .then(setProjects)
      .catch((cause: unknown) => {
        if (controller.signal.aborted || cause instanceof UnauthorizedError) return
        setProjects([])
        setError(true)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const query = { projectId: scope === ALL_PROJECTS ? null : scope, from, to }
    Promise.all([
      fetchLlmUsageStats(query, controller.signal),
      fetchQaRunUsage(query, QA_RUN_COUNT, controller.signal),
    ])
      .then(([stats, runs]) => {
        if (controller.signal.aborted) return
        setData({ stats, runs })
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || cause instanceof UnauthorizedError) return
        setData(null)
        setLoading(false)
        setError(true)
      })
    return () => controller.abort()
  }, [scope, from, to, revision])

  return (
    <div className="shell">
      <header className="topbar">
        <ProjectPicker
          projects={projects}
          value={scope}
          onChange={(projectId) => updateRequest({ scope: projectId })}
          allowAll
        />

        <span className="field">
          <label className="field__label" htmlFor={fromFieldId}>{strings.period}</label>
          <input
            className="control control--date"
            id={fromFieldId}
            type="date"
            aria-label={strings.startDate}
            value={toDateInputValue(from)}
            max={toDateInputValue(addDays(to, -1))}
            onChange={(event) => {
              const next = event.target.valueAsDate
              if (next) updateRequest({ from: startOfDay(next) })
            }}
          />
          <span className="field__label" aria-hidden="true">–</span>
          <input
            className="control control--date"
            id={toFieldId}
            type="date"
            aria-label={strings.endDate}
            // 표시는 포함 경계로 한다. 사람이 읽는 "8월 5일까지"는 5일을 포함한다.
            value={toDateInputValue(addDays(to, -1))}
            min={toDateInputValue(from)}
            onChange={(event) => {
              const next = event.target.valueAsDate
              if (next) updateRequest({ to: addDays(startOfDay(next), 1) })
            }}
          />
        </span>

        <span className="topbar__spacer" />
        <button
          type="button"
          className="control control--action"
          disabled={loading}
          onClick={() => updateRequest({ revision: revision + 1 })}
        >
          {loading ? t.admin.states.loading : t.admin.states.refresh}
        </button>
      </header>

      <main className="main">
        {error && (
          <div className="notice notice--critical" role="alert">
            <p className="notice__title">{strings.loadFailedTitle}</p>
            {t.admin.states.loadFailed}
          </div>
        )}

        {projects?.length === 0 && !error && <div className="notice">{strings.noProjects}</div>}

        {data !== null && (
          <>
            <TotalsRail stats={data.stats} />
            {/* 이 화면에서 가장 오해받기 쉬운 두 가지를 표 위에 못박는다. */}
            <div className="notice" role="note">
              <p className="notice__title">{strings.scopeTitle}</p>
              {scope === ALL_PROJECTS ? strings.allScope : strings.oneScope}{' '}
              {strings.calledAt.before}
              <strong>{strings.calledAt.emphasis}</strong>
              {strings.calledAt.after}
              {data.stats.unattributedCalls > 0 && (
                <>
                  {' '}
                  {strings.unattributed.before}
                  <strong>{format.count(data.stats.unattributedCalls)}</strong>
                  {strings.unattributed.after}
                </>
              )}
            </div>

            <DailyTrend days={data.stats.daily} from={from} to={to} zone={data.stats.zone} />

            <section aria-labelledby="usage-axes">
              <div className="section__head">
                <h2 className="section__title" id="usage-axes">{strings.axesTitle}</h2>
                {/* 축이 서로 겹친다는 사실을 여기서 한 번만 말한다. QA 화면과 달리 이 셋은
                    분할이 아니라 같은 호출을 세 번 접은 것이라, 두 축을 겹쳐 볼 수 없다. */}
                <span className="section__note">{strings.axesNote}</span>
              </div>
              <div className="axis-grid">
                <BreakdownTable
                  title={strings.byService}
                  axisLabel={strings.service}
                  rows={data.stats.byService.map((cell) => ({
                    key: cell.service,
                    label: Object.hasOwn(strings.services, cell.service)
                      ? strings.services[cell.service]
                      : cell.service,
                    sublabel: cell.service,
                    totals: cell.totals,
                  }))}
                  note={strings.embeddingNote}
                  emptyMessage={strings.noCalls}
                />
                <BreakdownTable
                  title={strings.byModel}
                  axisLabel={strings.model}
                  rows={data.stats.byModel.map((cell) => ({
                    key: `${cell.provider}/${cell.model}`,
                    label: cell.model,
                    sublabel: cell.provider,
                    totals: cell.totals,
                  }))}
                  emptyMessage={strings.noCalls}
                />
                <BreakdownTable
                  title={strings.byProject}
                  axisLabel={strings.project}
                  rows={data.stats.byProject.map((cell) => ({
                    key: cell.projectId,
                    label: cell.projectName,
                    sublabel: cell.projectId,
                    totals: cell.totals,
                  }))}
                  note={strings.projectNameNote}
                  emptyMessage={strings.noCalls}
                />
              </div>
            </section>
            <QaRunCosts runs={data.runs} />
          </>
        )}
        {data === null && loading && <div className="notice">{strings.loadingSpend}</div>}
      </main>
    </div>
  )
}
