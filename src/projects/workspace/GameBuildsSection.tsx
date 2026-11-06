import { buildEnvironment } from '../buildEnvironment'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { formatDate, formatDateTime, PLACEHOLDER } from '../formatters'
import {
  fallbackBuildSummaries,
  orderBuildSummaries,
  type GameBuildSummary,
} from '../gameBuildSummary'
import { BuildInstanceCount } from './BuildInstanceCount'
import { GameBuildDetail } from './GameBuildDetail'
import { QaStatusPill } from './QaStatusPill'
import { gameBuildDetailSearch } from './sections'
import { useGameBuildSummaries } from './useGameBuildSummaries'
import { useWorkspace } from './workspaceContext'

const counts = new Intl.NumberFormat()

function formatCount(value: number | null): string {
  return value === null ? PLACEHOLDER : counts.format(value)
}

/**
 * 프로젝트의 게임 빌드(ARTEL-1105).
 *
 * `?build=` 가 없으면 목록, 있으면 그 빌드의 상세를 그린다. 상세를 펼침 행이 아니라 주소로 여는 것은 상세에
 * catalog · QA run 목록 · 케이스 판정이 다 들어가 행 안에 두기엔 크고, 주소를 붙여 넣으면 같은 빌드가 열려야
 * 하기 때문이다.
 *
 * 요약은 서버의 `/game-builds/summary` 에서 온다. 그 엔드포인트가 없는 옛 서버면 workspace 가 들고 있는 빌드와
 * instance 로 만들고, 알 수 없는 칸은 `—` 로 둔다.
 */
export function GameBuildsSection() {
  const { builds, instances, projectId } = useWorkspace()
  const { t } = useI18n()
  const m = t.gameBuilds.list
  const [searchParams] = useSearchParams()
  const requestedBuildId = searchParams.get('build')
  const { reload, status, summaries } = useGameBuildSummaries(projectId)

  const supported = summaries !== null
  const rows = orderBuildSummaries(supported ? summaries : fallbackBuildSummaries(builds, instances))

  if (requestedBuildId !== null) {
    return (
      <GameBuildDetail
        build={builds.find((build) => build.id === requestedBuildId) ?? null}
        buildId={requestedBuildId}
        // 요약을 읽는 중이거나 실패했으면 수 칸은 `—` 다. 읽는 중에 workspace 값으로 그렸다가 응답이 오면 수가 바뀐다.
        summary={status === 'ready' ? (rows.find((row) => row.gameBuildId === requestedBuildId) ?? null) : null}
      />
    )
  }

  return (
    <div className="section-single">
      <p className="section-intro">{m.intro}</p>

      <section aria-label={m.label} className="panel panel--flush">
        {status === 'loading' && <p className="panel-empty panel-empty--inset">{m.loading}</p>}

        {status === 'failed' && (
          <div className="inline-error inline-error--inset" role="alert">
            <span aria-hidden="true">!</span>
            {m.loadFailed}
            <button className="button button--secondary button--compact" onClick={reload} type="button">
              {m.retry}
            </button>
          </div>
        )}

        {status === 'ready' && rows.length === 0 && <p className="panel-empty panel-empty--inset">{m.empty}</p>}

        {status === 'ready' && rows.length > 0 && (
          <>
            {!supported && <p className="gb-partial">{m.partial}</p>}
            {/* 좁은 화면에서 표만 가로로 밀린다. 페이지 전체가 밀리면 rail 과 heading 까지 잘린다. */}
            <div aria-label={m.scrollRegion} className="gb-table-scroll" role="region" tabIndex={0}>
              <table className="data-table gb-table">
                <thead>
                  <tr>
                    <th scope="col">{m.versionColumn}</th>
                    <th scope="col">{m.createdColumn}</th>
                    <th scope="col">{m.lastReportedColumn}</th>
                    <th scope="col">{m.instancesColumn}</th>
                    <th scope="col">{m.functionsColumn}</th>
                    <th scope="col">{m.qaRunsColumn}</th>
                    <th scope="col">{m.latestRunColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <GameBuildRow key={row.gameBuildId} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/**
 * 한 빌드. version 이 상세로 가는 링크라 키보드는 그것을 짚는다. 행 클릭은 마우스 편의다.
 */
function GameBuildRow({ row }: { row: GameBuildSummary }) {
  const { t } = useI18n()
  const m = t.gameBuilds.list
  const navigate = useNavigate()
  const search = gameBuildDetailSearch(row.gameBuildId)
  const hasLabel = (row.label?.trim() ?? '').length > 0

  return (
    <tr className="gb-row" onClick={() => navigate({ search })}>
      <td>
        <div className="gb-version-cell">
          <Link
            aria-label={m.openDetail(row.version)}
            className="table-link mono"
            onClick={(event) => event.stopPropagation()}
            to={{ search }}
            translate="no"
          >
            {row.version}
          </Link>
          <span className="badge">{buildEnvironment(row.isEditor)}</span>
        </div>
        {hasLabel && <div className="gb-label">{row.label}</div>}
      </td>
      <td className="table-meta">{formatDate(row.createdAt)}</td>
      <td className="table-meta">{row.lastReportedAt === null ? PLACEHOLDER : formatDateTime(row.lastReportedAt)}</td>
      <td className="table-meta">
        <BuildInstanceCount connected={row.connectedCount} total={row.instanceCount} />
      </td>
      <td className="table-meta">
        {row.cheatCount === null || row.behaviorCount === null ? (
          PLACEHOLDER
        ) : (
          <>
            <span aria-hidden="true">
              {m.functions(counts.format(row.cheatCount), counts.format(row.behaviorCount))}
            </span>
            <span className="visually-hidden">{m.functionsLabel(row.cheatCount, row.behaviorCount)}</span>
          </>
        )}
      </td>
      <td className="table-meta">{formatCount(row.qaRunCount)}</td>
      <td>
        <LatestRun row={row} />
      </td>
    </tr>
  )
}

function LatestRun({ row }: { row: GameBuildSummary }) {
  const { t } = useI18n()
  const m = t.gameBuilds.list
  // 옛 서버는 run 수를 모른다. 0 과 구분해서 `—` 를 그린다.
  if (row.qaRunCount === null) return <span className="table-meta">{PLACEHOLDER}</span>
  if (row.latestQaRun === null) return <span className="table-meta">{m.noRuns}</span>

  const run = row.latestQaRun
  return (
    <div className="gb-latest-run">
      {run.status === null ? PLACEHOLDER : <QaStatusPill status={run.status} />}
      {run.stepsPassed !== null && run.stepsTotal !== null && (
        <span className="table-meta">
          {m.steps(counts.format(run.stepsPassed), counts.format(run.stepsTotal))}
        </span>
      )}
    </div>
  )
}
