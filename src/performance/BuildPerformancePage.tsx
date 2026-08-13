import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBuildPerformance } from './performanceApi'
import { sortByStartedAt, splitTrustedSegments } from './chartModel'
import { HIGH_DISCHARGING_RATIO, isLowConfidence, LOW_COVERAGE_RATIO, type BuildPerformance } from './performanceTypes'

export function BuildPerformanceRoute() {
  const { projectId = '', buildId = '' } = useParams()
  const [data, setData] = useState<BuildPerformance | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  useEffect(() => { const controller = new AbortController(); getBuildPerformance(projectId, buildId, controller.signal).then(setData).catch((error:unknown) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setFailedFor(`${projectId}:${buildId}`) }); return () => controller.abort() }, [buildId, projectId])
  const runs = useMemo(() => sortByStartedAt(data?.runs ?? []), [data])
  if (failedFor === `${projectId}:${buildId}`) return <section className="page"><div className="panel-message" role="alert">빌드 추세를 불러오지 못했습니다.</div></section>
  if (data === null || String(data.projectId) !== projectId || String(data.gameBuildId) !== buildId) return <section className="page" aria-busy="true"><p className="panel-empty">빌드 추세를 불러오는 중…</p></section>
  return <section className="page performance-page"><header className="performance-page-head"><div><Link className="back-link" to={`/projects/${encodeURIComponent(projectId)}/qa`}>QA로 돌아가기</Link><p className="performance-eyebrow">BUILD {data.gameBuildId}</p><h1>빌드 성능 추세</h1><p>런 길이와 무관하게 분당 hitch 수로 비교합니다. Editor 런은 서버에서 제외됩니다.</p></div></header>
    {runs.length === 0 ? <div className="performance-empty"><strong>비교할 런 없음</strong><p>이 빌드에서 집계된 Standalone 런이 없습니다.</p></div> : <section className="performance-panel"><header><div><h2>Hitch / 분</h2><p>{runs.length === 1 ? '런이 하나뿐이라 변화량은 판단할 수 없습니다.' : '저신뢰 런은 정상 런을 잇는 선에서 분리됩니다.'}</p></div></header><Trend runs={runs} projectId={projectId} /><div className="performance-table-wrap"><table className="performance-table"><thead><tr><th>시작</th><th>Hitch / 분</th><th>평균 / p95</th><th>예산</th><th>신뢰도</th><th>런</th></tr></thead><tbody>{runs.map((run) => <tr className={isLowConfidence(run) ? 'performance-row--warning' : ''} key={run.runId}><td>{new Date(run.startedAt).toLocaleString()}</td><td>{run.hitchesPerMinute.toFixed(1)}</td><td>{run.frameMeanMs.toFixed(1)} / {run.frameP95Ms.toFixed(1)} ms</td><td>{run.budgetMs === null ? '판단 불가 · 절대값' : `${run.budgetMs.toFixed(2)} ms`}</td><td>{run.coverageRatio < LOW_COVERAGE_RATIO ? `낮은 커버리지 ${(run.coverageRatio * 100).toFixed(0)}%` : run.dischargingRatio > HIGH_DISCHARGING_RATIO ? `높은 방전 ${(run.dischargingRatio * 100).toFixed(0)}%` : '신뢰 가능'}</td><td><Link to={`/projects/${encodeURIComponent(projectId)}/qa-runs/${run.runId}/performance`}>상세</Link></td></tr>)}</tbody></table></div></section>}
  </section>
}

function Trend({ runs, projectId }: { runs: BuildPerformance['runs']; projectId: string }) {
  const width = 900, height = 260, pad = 34, max = Math.max(...runs.map((run) => run.hitchesPerMinute), 1) * 1.15
  const x = (index: number) => runs.length === 1 ? width / 2 : pad + index / (runs.length - 1) * (width - pad * 2)
  const y = (value: number) => height - pad - value / max * (height - pad * 2)
  const healthySegments = splitTrustedSegments(runs, isLowConfidence)
  return <div className="performance-chart-wrap"><svg aria-label="시간순 분당 hitch 추세" className="performance-chart" role="img" viewBox={`0 0 ${width} ${height}`}><line className="performance-axis" x1={pad} x2={width-pad} y1={height-pad} y2={height-pad}/>{healthySegments.map((segment, segmentIndex) => <polyline className="performance-line performance-line--mean" fill="none" key={segmentIndex} points={segment.map((run) => `${x(runs.indexOf(run))},${y(run.hitchesPerMinute)}`).join(' ')}/>)}{runs.map((run,index) => <Link key={run.runId} to={`/projects/${encodeURIComponent(projectId)}/qa-runs/${run.runId}/performance`}><circle className={isLowConfidence(run) ? 'performance-trend-point performance-trend-point--warning' : 'performance-trend-point'} cx={x(index)} cy={y(run.hitchesPerMinute)} r={isLowConfidence(run) ? 7 : 5}><title>{`${run.startedAt}: ${run.hitchesPerMinute} hitch/분${isLowConfidence(run) ? ', 저신뢰' : ''}`}</title></circle></Link>)}</svg><ul className="performance-legend"><li><span className="performance-trend-point"/>신뢰 가능</li><li><span className="performance-trend-point performance-trend-point--warning"/>비교 주의 · 선 분리</li></ul></div>
}
