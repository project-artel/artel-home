import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { formatDateTime, formatElapsedSeconds, PLACEHOLDER } from '../../projects/formatters'
import { sectionHref } from '../../projects/workspace/sections'
import { qaRunPath, type QaModel } from '../qaTypes'
import { CollapsibleSection } from './CollapsibleSection'
import { passRate, runDuration, type QaRunSummary } from './qaLaunchApi'

const SHOWN = 6

/**
 * 최근 실행 6회(ARTEL-1084). 최신순으로 ①~⑥ 번호를 매기고, 왼쪽 표와 오른쪽 통과율 막대에 **같은
 * 번호**를 붙인다. 한쪽에 손을 올리면 다른 쪽의 같은 번호가 함께 밝아진다.
 *
 * 표의 주인공은 TR 이름이다. 실행 번호는 그 아래 작게 둔다 — 사람이 기억하는 것은 "회귀 1차" 이지
 * "#34" 가 아니다.
 */
export function RecentRuns({
  projectId,
  runs,
  models,
  status,
  selectedRunId,
}: {
  projectId: string
  runs: QaRunSummary[]
  models: QaModel[]
  status: 'loading' | 'ready' | 'failed'
  selectedRunId: string | null
}) {
  const { t } = useI18n()
  const l = t.qa.launch.recent
  const [hover, setHover] = useState<number | null>(null)
  const shown = runs.slice(0, SHOWN)
  const modelLabel = (id: string | null) => (id === null ? PLACEHOLDER : models.find((model) => model.id === id)?.label ?? id)

  const extra = (
    <>
      <span className="ql-section-sub">{l.hint}</span>
      <span className="ql-spacer" />
      <Link className="ql-link" to={sectionHref(projectId, 'qa-history')}>{l.all}</Link>
    </>
  )

  return (
    <CollapsibleSection extra={extra} id="ql-recent" title={l.title(shown.length)}>
      {status === 'failed' && <p className="ql-empty">{l.loadFailed}</p>}
      {status === 'ready' && shown.length === 0 && <p className="ql-empty">{l.empty}</p>}
      {shown.length > 0 && (
        <div className="ql-recent-grid">
          <div className="ql-table" role="table" aria-label={l.title(shown.length)}>
            <div className="ql-table-head" role="row">
              <span role="columnheader" />
              <span role="columnheader">{l.columnRun}</span>
              <span role="columnheader">{l.columnStatus}</span>
              <span className="ql-num" role="columnheader">{l.columnPassed}</span>
              <span role="columnheader">{l.columnTook}</span>
              <span role="columnheader">{l.columnStarted}</span>
            </div>
            {shown.map((run, index) => {
              const duration = runDuration(run)
              return (
                <Link
                  className={'ql-table-row' + (hover === index ? ' is-hot' : '')}
                  key={run.id}
                  onBlur={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)}
                  role="row"
                  to={qaRunPath(projectId, run.id)}
                >
                  <span role="cell"><Num current={run.testRunId === selectedRunId} hot={hover === index} n={index + 1} /></span>
                  <span className="ql-table-main" role="cell">
                    <span className="ql-table-title">{run.testRunName ?? l.deletedRun}</span>
                    <span className="ql-table-sub">
                      <span className="mono">#{run.id}</span> · {modelLabel(run.model)} · {run.gameInstanceName ?? PLACEHOLDER}
                      {run.gameBuildVersion !== null && <> <span className="mono">{run.gameBuildVersion}</span></>}
                    </span>
                  </span>
                  <span role="cell">
                    <span className={`qa-status qa-status--${run.status.toLowerCase()}`}>
                      {t.qa.statusLabels[run.status as keyof typeof t.qa.statusLabels] ?? run.status}
                    </span>
                  </span>
                  <span className="ql-num mono" role="cell">
                    {run.casesPassed === null || run.casesTotal === null ? PLACEHOLDER : `${run.casesPassed}/${run.casesTotal}`}
                  </span>
                  <span className="mono" role="cell">{duration === null ? PLACEHOLDER : formatElapsedSeconds(duration / 1000)}</span>
                  <span className="ql-table-when" role="cell">{formatDateTime(run.startedAt)}</span>
                </Link>
              )
            })}
          </div>

          <div className="ql-chart">
            <span className="ql-chart-title">{l.chartTitle}</span>
            <div
              aria-label={l.chartLabel(shown.map((run, index) => `${index + 1} ${run.testRunName ?? l.deletedRun} ${passRate(run) ?? PLACEHOLDER}%`).join(', '))}
              className="ql-bars"
              role="img"
            >
              {shown.map((run, index) => {
                const rate = passRate(run)
                const total = run.casesTotal ?? 0
                const passed = run.casesPassed ?? 0
                return (
                  <span
                    className={'ql-bar' + (hover === index ? ' is-hot' : '')}
                    key={run.id}
                    onMouseEnter={() => setHover(index)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <span className="ql-bar-pct mono">{rate === null ? PLACEHOLDER : `${rate}%`}</span>
                    <span className="ql-bar-col">
                      {total > 0 && (
                        <>
                          <span className="ql-bar-fail" style={{ height: `${((total - passed) / total) * 100}%` }} />
                          <span className="ql-bar-pass" style={{ height: `${(passed / total) * 100}%` }} />
                        </>
                      )}
                    </span>
                    <Num current={run.testRunId === selectedRunId} hot={hover === index} n={index + 1} />
                  </span>
                )
              })}
            </div>
            <div className="ql-legend">
              <span><i className="ql-legend-pass" />{l.legendPassed}</span>
              <span><i className="ql-legend-fail" />{l.legendFailed}</span>
            </div>
          </div>
        </div>
      )}
    </CollapsibleSection>
  )
}

/** 표와 막대가 함께 쓰는 번호 동그라미. 지금 고른 런의 실행은 옅게 칠해 구분한다. */
function Num({ n, hot, current }: { n: number; hot: boolean; current: boolean }) {
  return <span className={'ql-num-badge mono' + (hot ? ' is-hot' : current ? ' is-current' : '')}>{n}</span>
}
