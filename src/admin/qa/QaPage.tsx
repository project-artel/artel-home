import { useEffect, useId, useMemo, useState } from 'react'
import { UnauthorizedError } from '../shared/adminApi'
import { toDateInputValue } from '../shared/format'
import { ALL_PROJECTS } from '../shared/projects/pick'
import { ProjectPicker } from '../shared/projects/ProjectPicker'
import { listProjects, type ProjectSummary } from '../shared/projects/projectsApi'
import { AxisBreakdown } from './AxisBreakdown'
import { CombinationMatrix } from './CombinationMatrix'
import { RecentRuns } from './RecentRuns'
import { ScoreBreakdown } from './ScoreBreakdown'
import { TotalsRail } from './TotalsRail'
import { emphasize } from './emphasize'
import { fetchQaLabels, fetchQaStats, fetchRecentQaTries } from './qaStatsApi'
import { AXES, type QaStats, type QaTrySummary } from './qaStatsTypes'
import { activeProjectId, listTestRuns, type TestRunSummary } from './testRunsApi'
import { useI18n } from '../../i18n/useI18n'
import { usePolling } from '../../live/usePolling'
import { useQa } from './useQa'
import { InfoHint } from '../../design-system/primitives/InfoHint'

const RECENT_RUN_COUNT = 30
const DEFAULT_WINDOW_DAYS = 30
/** `<select>`의 "전체" 줄. 빈 문자열을 쓰면 "아직 안 고름"과 구분되지 않는다(`ALL_PROJECTS`와 같은 이유). */
const ALL_TEST_RUNS = 'all'
/**
 * label 선택기의 "전체" 줄. **여기서는 빈 문자열이 맞다.**
 *
 * ALL_TEST_RUNS·ALL_PROJECTS가 `'all'`인 것은 그 자리에 오는 값이 숫자 id 라 `'all'`과 절대
 * 겹치지 않기 때문이다. `label`은 자유 문자열이라 그 보장이 없다 — 누가 실험 이름을 `all`로
 * 지으면 "전체"와 구분되지 않는다. 서버가 `label`의 앞뒤 공백을 지우고 그러고도 비면 null로
 * 읽으므로 빈 문자열은 절대 실제 이름일 수 없고, 그래서 이쪽이 유일하게 안전한 sentinel이다.
 */
const ALL_LABELS = ''

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
  stats: QaStats
  runs: QaTrySummary[]
}

/**
 * The outcome of one stats query. `data` is null when the query failed.
 *
 * `key` names the query that produced it. A result whose key is not the current query's key is
 * stale: the page keeps showing it while the new query loads, and `loading` is derived from the
 * mismatch instead of being set from inside the effect.
 */
interface Settled {
  key: string
  data: Loaded | null
}

/** A list fetched for one scope (a project id). It is only valid while that scope is selected. */
interface Listed<T> {
  scope: string
  items: T[]
}

function queryKey(
  projectId: string,
  from: Date,
  to: Date,
  testRunId: string | null,
  label: string | null,
): string {
  return JSON.stringify([projectId, from.getTime(), to.getTime(), testRunId, label])
}

export default function QaPage() {
  const { t } = useQa()
  const shared = useI18n().t.admin.states
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  // `to`는 배타 경계라 "오늘까지"는 내일 자정이다.
  const [to, setTo] = useState(() => addDays(startOfDay(new Date()), 1))
  const [from, setFrom] = useState(() => addDays(startOfDay(new Date()), -DEFAULT_WINDOW_DAYS))
  // 9011(프로브)·9012(L1 상세)·9013(L2 중간)·9014(L3 추상)처럼 난이도별로 쪼갠 test run을
  // 하나 골라 보는 자리다. 기본값은 반드시 null(전체)이다 — qaStatsApi.ts의 QaStatsQuery 주석
  // 참고.
  const [testRunId, setTestRunId] = useState<string | null>(null)
  // testRunId와 독립인 필터다. 자유 입력이 아니라 이미 쓰인 label 목록에서 고르게 한다 —
  // 자유 문자열을 허용하면 "content map 1차"와 "content map 1차 실험"이 같은 실험인데도
  // 두 칸으로 갈릴 수 있고, 고르게 만들면 tag 체계 없이 그것이 막힌다. 새 이름을 짓는 자리는
  // 여기가 아니라 런을 걸 때다.
  const [label, setLabel] = useState<string | null>(null)
  // The lists are tagged with the project they were fetched for. null means "nothing to fetch
  // for" or "still fetching"; an array means the load finished (an empty one included).
  const [testRunList, setTestRunList] = useState<Listed<TestRunSummary> | null>(null)
  const [labelList, setLabelList] = useState<Listed<string> | null>(null)
  const [settled, setSettled] = useState<Settled | null>(null)
  // A project, test run or label list failed to load. The pickers stay usable with "All".
  const [listFailed, setListFailed] = useState(false)
  // Bumped by the poll. It is not part of the query key, so a poll re-reads without showing `loading`.
  const [pollToken, setPollToken] = useState(0)

  const fromFieldId = useId()
  const toFieldId = useId()
  const testRunFieldId = useId()
  const labelFieldId = useId()

  const one = activeProjectId(projectId)
  const testRuns = testRunList !== null && testRunList.scope === one ? testRunList.items : null
  const labels = labelList !== null && labelList.scope === projectId ? labelList.items : null
  const currentKey =
    projectId === null ? null : queryKey(projectId, from, to, testRunId, label)
  const loading = currentKey !== null && settled?.key !== currentKey
  const data = settled?.data ?? null
  const statsFailed = settled !== null && settled.key === currentKey && settled.data === null
  const failed = listFailed || statsFailed

  useEffect(() => {
    const controller = new AbortController()
    listProjects(controller.signal)
      .then((items) => {
        setProjects(items)
        setProjectId((current) => current ?? items[0]?.id ?? null)
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        setProjects([])
        // A 401 signs the user out inside `apiFetch`; there is nothing more to show.
        if (!(cause instanceof UnauthorizedError)) setListFailed(true)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (projectId === null) return
    const forProject = activeProjectId(projectId)
    const key = queryKey(projectId, from, to, testRunId, label)

    const controller = new AbortController()

    Promise.all([
      fetchQaStats(
        { projectId: forProject, from, to, testRunId, label },
        controller.signal,
      ),
      // `GET /api/qa-tries`는 프로젝트를 요구한다. 목록이라 합산할 대상이 아니어서
      // ARTEL-750 이 넓히지 않았고, 그래서 전체를 고르면 최근 런 자리가 빈다.
      forProject === null
        ? Promise.resolve([])
        : fetchRecentQaTries(forProject, RECENT_RUN_COUNT, controller.signal),
    ])
      .then(([stats, runs]) => {
        setSettled({ key, data: { stats, runs } })
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        if (cause instanceof UnauthorizedError) return
        // A failed poll keeps the data already shown for this query.
        setSettled((current) => (current?.key === key && current.data !== null ? current : { key, data: null }))
      })

    return () => controller.abort()
  }, [projectId, from, to, testRunId, label, pollToken])

  usePolling(() => setPollToken((token) => token + 1))

  useEffect(() => {
    if (one === null) return

    const controller = new AbortController()
    listTestRuns(one, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setTestRunList({ scope: one, items })
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        // 목록이 비어도 test run 은 "전체"로 계속 조회할 수 있다 — 실패는 선택기만 비운다.
        setTestRunList({ scope: one, items: [] })
        if (!(cause instanceof UnauthorizedError)) setListFailed(true)
      })

    return () => controller.abort()
  }, [one])

  useEffect(() => {
    // `GET /api/qa-stats/labels`는 projectId가 optional이라 test run 목록과 달리 "전 프로젝트
    // 합산"(ALL_PROJECTS)에서도 부를 수 있다 — activeProjectId를 쓰면 그 상태에서 label
    // 선택기가 공연히 막힌다. 그래서 이 효과가 막는 조건은 projectId === null(아직 아무것도
    // 안 고른 초기 상태)뿐이다. 두 선택기의 disabled 조건이 다른 것은 버그가 아니라 각 API의
    // 경계가 다르기 때문이다.
    if (projectId === null) return

    const controller = new AbortController()
    // ALL_PROJECTS는 화면 전용 sentinel이라 서버는 모른다 — null로 바꿔 "볼 수 있는 전
    // 프로젝트"를 묻는다.
    fetchQaLabels(projectId === ALL_PROJECTS ? null : projectId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setLabelList({ scope: projectId, items })
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        // 목록이 비어도 label은 "전체"로 계속 조회할 수 있다 — 실패는 선택기만 비운다.
        setLabelList({ scope: projectId, items: [] })
        if (!(cause instanceof UnauthorizedError)) setListFailed(true)
      })

    return () => controller.abort()
  }, [projectId])

  // 프로젝트가 바뀌면 이전 프로젝트에서 고른 test run·label은 새 프로젝트에서는 뜻이 없다.
  // 그대로 두면 그 값이 다른 프로젝트 조회에 실려 나가 빈 집계가 나오는데, 화면에는 예전
  // 프로젝트의 이름만 남아 사용자가 원인을 알 수 없다.
  const changeProject = (next: string) => {
    setProjectId(next)
    setTestRunId(null)
    setLabel(null)
    setListFailed(false)
  }

  const cells = useMemo(() => data?.stats.cells ?? [], [data])
  const selectedTestRun = testRuns?.find((run) => run.id === testRunId) ?? null

  // test run과 label 안내를 하나로 합친다. 둘을 세로로 쌓으면 두 필터가 AND로 겹치는지 사용자가
  // 읽어 낼 수 없다 — 한 문장으로 합치면 그 관계가 문장에 그대로 드러난다.
  const testRunName = selectedTestRun?.name ?? testRunId ?? ''
  const scopeNotice =
    testRunId !== null && label !== null
      ? emphasize(t.scope.both, { testRun: testRunName, label })
      : testRunId !== null
        ? emphasize(t.scope.testRun, { testRun: testRunName })
        : label !== null
          ? emphasize(t.scope.label, { label })
          : null

  return (
    <>
      <header className="topbar">
        <ProjectPicker projects={projects} value={projectId} onChange={changeProject} allowAll />

        <span className="field">
          <label className="field__label" htmlFor={fromFieldId}>
            {t.filters.period}
          </label>
          <input
            className="control control--date"
            id={fromFieldId}
            type="date"
            aria-label={t.filters.startDate}
            value={toDateInputValue(from)}
            max={toDateInputValue(addDays(to, -1))}
            onChange={(event) => {
              const next = event.target.valueAsDate
              if (next) setFrom(startOfDay(next))
            }}
          />
          <span className="field__label" aria-hidden="true">
            –
          </span>
          <input
            className="control control--date"
            id={toFieldId}
            type="date"
            aria-label={t.filters.endDate}
            // 표시는 포함 경계로 한다. 사람이 읽는 "8월 5일까지"는 5일을 포함한다.
            value={toDateInputValue(addDays(to, -1))}
            min={toDateInputValue(from)}
            onChange={(event) => {
              const next = event.target.valueAsDate
              if (next) setTo(addDays(startOfDay(next), 1))
            }}
          />
        </span>

        <span className="field">
          <label className="field__label" htmlFor={testRunFieldId}>
            {t.filters.testRun}
          </label>
          <select
            className="control"
            id={testRunFieldId}
            // `/api/projects/{projectId}/test-runs`가 프로젝트 경계를 지나 프로젝트를 못
            // 고르면 부를 목록 자체가 없다. 목록을 부르는 중에도 아직 고를 것이 없기는
            // 마찬가지라 같이 막는다 — 두 상태 모두 <option> 문구로 이유를 남긴다.
            disabled={one === null || testRuns === null}
            value={testRunId ?? ALL_TEST_RUNS}
            onChange={(event) => {
              const next = event.target.value
              setTestRunId(next === ALL_TEST_RUNS ? null : next)
            }}
          >
            {one === null ? (
              <option value={ALL_TEST_RUNS}>{t.filters.pickProjectFirst}</option>
            ) : testRuns === null ? (
              <option value={ALL_TEST_RUNS}>{t.filters.loading}</option>
            ) : (
              <>
                <option value={ALL_TEST_RUNS}>{t.filters.all}</option>
                {testRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </span>

        <span className="field">
          <label className="field__label" htmlFor={labelFieldId}>
            {t.filters.label}
          </label>
          <select
            className="control"
            id={labelFieldId}
            // test run 선택기와 disabled 조건이 다르다 — label 목록은 projectId가 optional이라
            // "전 프로젝트 합산"(ALL_PROJECTS)에서도 부를 수 있다. 그래서 여기서는
            // activeProjectId가 아니라 projectId === null(아직 아무것도 안 고른 초기 상태)만
            // 막는다. 목록 fetch 쪽 useEffect에 같은 근거가 더 자세히 적혀 있다.
            disabled={projectId === null || labels === null}
            value={label ?? ALL_LABELS}
            onChange={(event) => {
              const next = event.target.value
              setLabel(next === ALL_LABELS ? null : next)
            }}
          >
            {projectId === null ? (
              <option value={ALL_LABELS}>{t.filters.pickProjectFirst}</option>
            ) : labels === null ? (
              <option value={ALL_LABELS}>{t.filters.loading}</option>
            ) : (
              <>
                <option value={ALL_LABELS}>{t.filters.all}</option>
                {labels.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </>
            )}
          </select>
        </span>

      </header>

      <main className="main">
        {failed && (
          <div className="notice notice--critical" role="alert">
            <p className="notice__title">{t.loadFailedTitle}</p>
            {/* The cause is developer text from `AdminApiError`; the user gets the shared message. */}
            {shared.loadFailed}
          </div>
        )}

        {projects?.length === 0 && !failed && <div className="notice">{t.noProjects}</div>}

        {scopeNotice !== null && (
          <div className="notice" role="status">
            {scopeNotice} {t.scope.reason}
          </div>
        )}

        {data !== null && (
          <>
            <TotalsRail total={data.stats.total} />

            {data.stats.truncated && (
              <div className="notice" role="status">
                {emphasize(t.truncated(data.stats.cellLimit))}
              </div>
            )}

            <section aria-labelledby="axes-title">
              <div className="section__head">
                <h2 className="section__title" id="axes-title">
                  {t.axesSection.title}
                  <InfoHint>{t.axesSection.note}</InfoHint>
                </h2>
              </div>
              <div className="axis-grid">
                {AXES.map((axis) => (
                  <AxisBreakdown key={axis} axis={axis} cells={cells} />
                ))}
              </div>
            </section>

            <ScoreBreakdown cells={cells} />
            <CombinationMatrix cells={cells} />
            {projectId === ALL_PROJECTS ? (
              <p className="muted">{t.recent.needProject}</p>
            ) : (
              <RecentRuns runs={data.runs} />
            )}
          </>
        )}

        {data === null && loading && <div className="notice">{t.loadingStats}</div>}
      </main>
    </>
  )
}
