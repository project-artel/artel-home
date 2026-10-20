import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { listProjectQaRuns } from '../../qa/qaApi'
import { isTerminalQaStatus, qaRunPath, type QaRun } from '../../qa/qaTypes'
import { listTestCaseVersions, type TestCaseVersionSummary } from '../../testCases/testCaseVersions'
import type { VerificationStatus } from '../../testCases/testCaseTypes'
import { formatDate, formatDateTime, PLACEHOLDER } from '../formatters'
import type { GameBuildSummary } from '../gameBuildSummary'
import type { GameBuild } from '../gameTypes'
import { GameFunctionPanel } from '../GameFunctionPanel'
import { ProjectApiError } from '../projectApi'
import { BuildInstanceCount } from './BuildInstanceCount'
import { QaStatusPill } from './QaStatusPill'
import { sectionHref } from './sections'
import { useWorkspace } from './workspaceContext'

/** 상세가 보여 주는 run 수. 서버는 1..100 을 받는다. 더 오래된 run 은 QA 히스토리에서 본다. */
const RUN_LIMIT = 20

const VERIFICATION_ORDER: VerificationStatus[] = ['VERIFIED', 'FAILED', 'REGRESSION', 'DRAFT', 'BROKEN']

const counts = new Intl.NumberFormat()

type ReadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'unsupported' }
  | { status: 'failed' }

/**
 * 상세의 블록 하나가 읽는 값. 블록마다 따로 읽고 따로 실패한다 — run 목록이 실패해도 catalog 와 케이스 판정은
 * 그려져야 한다. 로딩은 token 비교로 도출해서 effect 안에서 state 를 비우지 않는다.
 */
function useBlockRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  { notFoundMeansUnsupported = false }: { notFoundMeansUnsupported?: boolean } = {},
) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<{ source: string; read: ReadState<T> } | null>(null)
  const source = `${key}#${reloadToken}`

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ source, read: { status: 'ready', value } })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // 엔드포인트가 없는 옛 서버. 실패가 아니라 "아직 못 하는 일" 이라 재시도를 내밀지 않는다.
        const unsupported = notFoundMeansUnsupported && error instanceof ProjectApiError && error.isNotFound
        setState({ source, read: { status: unsupported ? 'unsupported' : 'failed' } })
      })
    return () => controller.abort()
    // `load` 는 `key` 가 같으면 같은 요청이다. 렌더마다 새로 만들어지는 함수라 의존성에 넣으면 매번 다시 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])
  const read: ReadState<T> = state !== null && state.source === source ? state.read : { status: 'loading' }
  return { read, reload }
}

/**
 * 한 빌드의 상세(ARTEL-1105). 게임 빌드 섹션이 `?build=` 를 받으면 목록 대신 이것을 그린다.
 *
 * 머리와 수 칸은 workspace 와 섹션이 이미 읽은 값이고, 이 화면이 새로 읽는 것은 catalog · 이 빌드의 QA run ·
 * 이 버전의 케이스 판정 세 가지다.
 */
export function GameBuildDetail({
  build,
  buildId,
  summary,
}: {
  build: GameBuild | null
  buildId: string
  summary: GameBuildSummary | null
}) {
  const { projectId } = useWorkspace()
  const { t } = useI18n()
  const m = t.gameBuilds.detail

  const backLink = (
    <Link className="gb-back" to={{ search: '' }}>
      <span aria-hidden="true">← </span>
      {m.back}
    </Link>
  )

  if (build === null) {
    return (
      <div className="section-single">
        {backLink}
        <div className="panel-message">
          <h2>{m.notFoundTitle}</h2>
          <p className="panel-message-copy">{m.notFoundCopy}</p>
        </div>
      </div>
    )
  }

  const hasLabel = (build.label?.trim() ?? '').length > 0
  const hasNotes = (build.notes?.trim() ?? '').length > 0
  const encodedProject = encodeURIComponent(projectId)
  const encodedBuild = encodeURIComponent(buildId)

  return (
    <div className="section-single gb-detail">
      {backLink}

      <section aria-labelledby="gb-detail-title" className="panel">
        <header className="gb-detail-head">
          <h2 className="gb-detail-title" id="gb-detail-title">
            <span className="mono" translate="no">{build.version}</span>
            {build.isEditor && <span className="badge">{t.gameBuilds.list.editorBadge}</span>}
          </h2>
          <p className={hasLabel ? 'gb-detail-label' : 'gb-detail-label detail-empty'}>
            {hasLabel ? build.label : m.noLabel}
          </p>
        </header>

        {build.isEditor && <p className="gb-detail-note">{m.editorNote}</p>}

        <dl className="detail-fields">
          <dt>{m.notesLabel}</dt>
          <dd className="gb-notes">{hasNotes ? build.notes : <span className="detail-empty">{m.noNotes}</span>}</dd>

          <dt>{m.createdField}</dt>
          <dd>{formatDate(build.createdAt)}</dd>

          <dt>{m.lastReportedField}</dt>
          <dd>
            {summary === null ? (
              PLACEHOLDER
            ) : summary.lastReportedAt === null ? (
              <span className="detail-empty">{m.neverReported}</span>
            ) : (
              formatDateTime(summary.lastReportedAt)
            )}
          </dd>

          <dt>{m.instancesField}</dt>
          <dd>
            <BuildInstanceCount connected={summary?.connectedCount ?? null} total={summary?.instanceCount ?? null} />
          </dd>
        </dl>

        <p className="gb-detail-note">{m.editHint}</p>

        <nav aria-label={m.linksLabel} className="form-actions gb-detail-links">
          <Link
            className="button button--secondary button--compact"
            to={`/projects/${encodedProject}/content-map?build=${encodedBuild}`}
          >
            {t.contentMap.entry.build}
          </Link>
          <Link
            className="button button--secondary button--compact"
            to={`/projects/${encodedProject}/game-builds/${encodedBuild}/performance`}
          >
            {t.performance.entry.build}
          </Link>
        </nav>
      </section>

      <div className="gb-detail-columns">
        <section className="panel gb-catalog">
          <GameFunctionPanel buildId={buildId} projectId={projectId} />
        </section>

        <div className="section-stack">
          <BuildQaRuns buildId={buildId} projectId={projectId} />
          <BuildCaseResults buildId={buildId} projectId={projectId} />
        </div>
      </div>
    </div>
  )
}

/**
 * 이 빌드로 돈 QA run. 서버가 `gameBuildId` 로 거르지만 client 에서도 한 번 더 거른다 — 그 파라미터를 모르는
 * 서버는 조용히 무시하고 프로젝트의 run 전부를 돌려주는데, 그것을 그대로 그리면 다른 빌드의 run 이 이 빌드의
 * 것으로 읽힌다.
 */
function BuildQaRuns({ buildId, projectId }: { buildId: string; projectId: string }) {
  const { t } = useI18n()
  const m = t.gameBuilds.detail
  const { read, reload } = useBlockRead(`runs/${projectId}/${buildId}`, (signal) =>
    listProjectQaRuns(projectId, { gameBuildId: buildId, size: RUN_LIMIT }, signal),
    // 프로젝트는 workspace 가 이미 읽었으므로, 여기서 404 는 이 엔드포인트가 없는 옛 서버다.
    { notFoundMeansUnsupported: true },
  )

  const runs = read.status === 'ready' ? read.value.filter((run) => run.gameBuildId === buildId) : []

  return (
    <section aria-labelledby="gb-runs-title" className="panel panel--flush">
      <h3 className="gb-block-title" id="gb-runs-title">{m.runsTitle}</h3>

      {read.status === 'loading' && <p className="panel-empty panel-empty--inset">{m.runsLoading}</p>}
      {read.status === 'unsupported' && <p className="panel-empty panel-empty--inset">{m.runsUnsupported}</p>}
      {read.status === 'failed' && <BlockError message={m.runsFailed} onRetry={reload} />}
      {read.status === 'ready' && runs.length === 0 && <p className="panel-empty panel-empty--inset">{m.runsEmpty}</p>}

      {read.status === 'ready' && runs.length > 0 && (
        <>
          <div aria-label={m.runsTitle} className="gb-table-scroll" role="region" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{m.runColumn}</th>
                  <th scope="col">{m.statusColumn}</th>
                  <th scope="col">{m.startedColumn}</th>
                  <th scope="col">{m.scenariosColumn}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <BuildQaRunRow key={run.id} projectId={projectId} run={run} />
                ))}
              </tbody>
            </table>
          </div>
          {read.value.length >= RUN_LIMIT && <p className="gb-partial">{m.runsLimit(RUN_LIMIT)}</p>}
        </>
      )}
    </section>
  )
}

function BuildQaRunRow({ projectId, run }: { projectId: string; run: QaRun }) {
  const { t } = useI18n()
  const finished = run.tries.filter((qaTry) => isTerminalQaStatus(qaTry.status)).length

  return (
    <tr>
      <td>
        <Link className="table-link mono" to={qaRunPath(projectId, run.id)} translate="no">
          #{run.id}
        </Link>
      </td>
      <td>
        <QaStatusPill status={run.status} />
      </td>
      <td className="table-meta">{run.startedAt === null ? PLACEHOLDER : formatDateTime(run.startedAt)}</td>
      <td className="table-meta">{t.gameBuilds.detail.scenarios(finished, run.tries.length)}</td>
    </tr>
  )
}

/**
 * 이 버전의 케이스 판정 수. 케이스 라이브러리의 버전 목록(`/test-case-versions`)에서 이 빌드의 줄을 찾는다 —
 * 라이브러리가 그리는 수와 같은 값이어야 링크를 눌렀을 때 숫자가 바뀌지 않는다.
 */
function BuildCaseResults({ buildId, projectId }: { buildId: string; projectId: string }) {
  const { t } = useI18n()
  const m = t.gameBuilds.detail
  const { read, reload } = useBlockRead(`versions/${projectId}`, (signal) => listTestCaseVersions(projectId, signal))
  const libraryHref = `${sectionHref(projectId, 'test-cases')}?${new URLSearchParams({ version: buildId })}`

  const version: TestCaseVersionSummary | undefined =
    read.status === 'ready' ? read.value.versions.find((item) => item.gameBuildId === buildId) : undefined

  return (
    <section aria-labelledby="gb-cases-title" className="panel">
      <h3 className="gb-block-title gb-block-title--plain" id="gb-cases-title">{m.casesTitle}</h3>

      {read.status === 'loading' && <p className="panel-empty">{m.casesLoading}</p>}
      {read.status === 'failed' && <BlockError message={m.casesFailed} onRetry={reload} />}
      {read.status === 'ready' && (version === undefined || version.total === 0) && (
        <p className="panel-empty">{m.casesEmpty}</p>
      )}

      {version !== undefined && version.total > 0 && (
        <>
          <p className="gb-cases-total mono">{m.casesTotal(version.total)}</p>
          <dl className="run-detail-facts">
            {VERIFICATION_ORDER.map((status) => {
              const value = version.counts[status]
              const alert = (status === 'FAILED' || status === 'REGRESSION' || status === 'BROKEN') && value > 0
              const tone = alert ? ' run-detail-fact-value--alert' : value === 0 ? ' run-detail-fact-value--quiet' : ''
              return (
                <div className="run-detail-fact" key={status}>
                  <dt className="run-detail-fact-label">{t.testCases.outcome[status]}</dt>
                  <dd className={`run-detail-fact-value mono${tone}`}>{counts.format(value)}</dd>
                </div>
              )
            })}
          </dl>
        </>
      )}

      {read.status === 'ready' && (
        <div className="form-actions">
          <Link className="button button--secondary button--compact" to={libraryHref}>
            {m.openLibrary}
          </Link>
        </div>
      )}
    </section>
  )
}

function BlockError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="inline-error inline-error--inset" role="alert">
      <span aria-hidden="true">!</span>
      {message}
      <button className="button button--secondary button--compact" onClick={onRetry} type="button">
        {t.gameBuilds.detail.retry}
      </button>
    </div>
  )
}
