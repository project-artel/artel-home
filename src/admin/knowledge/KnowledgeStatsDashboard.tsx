import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { UnauthorizedError } from '../shared/adminApi'
import { listProjects, type ProjectSummary } from '../shared/projects/projectsApi'
import { ALL_PROJECTS } from '../shared/projects/pick'
import { ProjectPicker } from '../shared/projects/ProjectPicker'
import { toDateInputValue, adminFormat } from '../shared/format'
import { useI18n } from '../../i18n/useI18n'
import { usePolling } from '../../live/usePolling'
import { KnowledgeAxisBreakdown } from './AxisBreakdown'
import { KnowledgeTotalsRail } from './TotalsRail'
import { fetchKnowledgeStats } from './knowledgeStatsApi'
import { AXES, type KnowledgeStats } from './knowledgeStatsTypes'
import { InfoHint } from '../../design-system/primitives/InfoHint'

/**
 * QA 집계(30일)보다 넓다. 지식은 만들어진 뒤 후속 런이 지우거나 인용해야 신호가 생기는데 그
 * 후속 런은 같은 날 돌지 않는다. 좁게 자르면 창 끝자락의 지식이 평가받을 시간을 갖지 못한 채
 * "아직 아무도 안 지웠다"로 집계된다. 서버 기본값과 같은 값이다.
 */
const DEFAULT_WINDOW_DAYS = 90

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

export function KnowledgeStatsDashboard() {
  const { t, locale } = useI18n()
  const strings = t.adminKnowledge
  const format = useMemo(() => adminFormat(locale), [locale])
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  // `to`는 배타 경계라 "오늘까지"는 내일 자정이다.
  const [to, setTo] = useState(() => addDays(startOfDay(new Date()), 1))
  const [from, setFrom] = useState(() => addDays(startOfDay(new Date()), -DEFAULT_WINDOW_DAYS))
  const [data, setData] = useState<KnowledgeStats | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const fromFieldId = useId()
  const toFieldId = useId()

  useEffect(() => {
    const controller = new AbortController()
    listProjects(controller.signal)
      .then((items) => {
        setProjects(items)
        setProjectId((current) => current ?? items[0]?.id ?? null)
        if (items.length > 0) setLoading(true)
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        setProjects([])
        if (cause instanceof UnauthorizedError) return
        setError(true)
      })
    return () => controller.abort()
  }, [])

  // A silent read (a poll) keeps showing the last data when it fails.
  const load = useCallback(
    (signal: AbortSignal, silent: boolean) => {
      if (projectId === null) return
      fetchKnowledgeStats({ projectId: projectId === ALL_PROJECTS ? null : projectId, from, to }, signal)
        .then((stats) => {
          if (signal.aborted) return
          setData(stats)
          setLoading(false)
          if (silent) setError(false)
        })
        .catch((cause) => {
          if (signal.aborted || silent) return
          setData(null)
          setLoading(false)
          if (cause instanceof UnauthorizedError) return
          setError(true)
        })
    },
    [projectId, from, to],
  )

  const pollController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal, false)
    return () => {
      controller.abort()
      pollController.current?.abort()
    }
  }, [load])

  usePolling(() => {
    pollController.current?.abort()
    const controller = new AbortController()
    pollController.current = controller
    load(controller.signal, true)
  })

  const cells = useMemo(() => data?.cells ?? [], [data])

  return (
    <div className="shell">
      <header className="topbar">
        <ProjectPicker
          projects={projects}
          value={projectId}
          onChange={(next) => {
            setLoading(true)
            setError(false)
            setProjectId(next)
          }}
          allowAll
          allLabel={t.admin.picker.all}
        />

        <span className="field">
          <label className="field__label" htmlFor={fromFieldId}>
            {strings.period}
          </label>
          <input
            className="control control--date"
            id={fromFieldId}
            type="date"
            aria-label={strings.startDate}
            value={toDateInputValue(from)}
            max={toDateInputValue(addDays(to, -1))}
            onChange={(event) => {
              const next = event.target.valueAsDate
              if (next) {
                setLoading(true)
                setError(false)
                setFrom(startOfDay(next))
              }
            }}
          />
          <span className="field__label" aria-hidden="true">
            –
          </span>
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
              if (next) {
                setLoading(true)
                setError(false)
                setTo(addDays(startOfDay(next), 1))
              }
            }}
          />
        </span>

      </header>

      <main className="main">
        {error && (
          <div className="notice notice--critical" role="alert">
            <p className="notice__title">{strings.loadFailedTitle}</p>
            {t.admin.states.loadFailed}
          </div>
        )}

        {projects?.length === 0 && !error && (
          <div className="notice">
            {strings.noProjects}
          </div>
        )}

        {data !== null && (
          <>
            <KnowledgeTotalsRail total={data.total} />

            {data.truncated && (
              <div className="notice" role="status">
                {strings.truncated(format.count(data.cellLimit))}
              </div>
            )}

            {/*
              인용 판정이 한 건도 없는 기간에는 인용률 칸이 전부 미상이다. 그 상태를 설명하지
              않으면 "지식을 아무도 안 쓴다"로 읽힌다 — 실제로는 인용 보고 기능이 붙기 전 런만
              모여 있다는 뜻이다.
            */}
            {data.total.retrievalTotal > 0 && data.total.citationKnownTotal === 0 && (
              <div className="notice" role="status">
                {strings.citationUnknownNotice}
              </div>
            )}

            <section aria-labelledby="knowledge-axes-title">
              <div className="section__head">
                <h2 className="section__title" id="knowledge-axes-title">
                  {strings.axesTitle}
                  {/* 이 화면에서 가장 오해받기 쉬운 두 숫자라 제목 옆에 둔다. */}
                  <InfoHint>{strings.axesNote}</InfoHint>
                </h2>
              </div>
              <div className="axis-grid">
                {AXES.map((axis) => (
                  <KnowledgeAxisBreakdown key={axis} axis={axis} cells={cells} />
                ))}
              </div>
            </section>
          </>
        )}

        {data === null && loading && <div className="notice">{strings.loading}</div>}
      </main>
    </div>
  )
}
