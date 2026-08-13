import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRunPerformance } from './performanceApi'
import { PerformanceChart } from './PerformanceChart'
import { HIGH_DISCHARGING_RATIO, LOW_COVERAGE_RATIO, type RunPerformance } from './performanceTypes'

const frameSeries = [
  { key: 'frameMeanMs', label: '평균', className: 'performance-line performance-line--mean' },
  { key: 'frameP95Ms', label: 'p95', className: 'performance-line performance-line--p95' },
  { key: 'frameMaxMs', label: '최대', className: 'performance-line performance-line--max' },
] as const

function formatBytes(value: number | null) { return value === null ? '측정 안 됨' : `${(value / 1024 / 1024).toFixed(0)} MiB` }

export function RunPerformanceRoute() {
  const { projectId = '', qaRunId = '' } = useParams()
  const [data, setData] = useState<RunPerformance | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    getRunPerformance(qaRunId, controller.signal).then(setData).catch((error: unknown) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setFailedFor(qaRunId) })
    return () => controller.abort()
  }, [qaRunId])
  if (failedFor === qaRunId) return <section className="page"><div className="panel-message" role="alert">성능 지표를 불러오지 못했습니다.</div></section>
  if (data === null || String(data.runId) !== qaRunId) return <section className="page" aria-busy="true"><p className="panel-empty">성능 지표를 불러오는 중…</p></section>
  const summary = data.summary
  return <section className="page performance-page">
    <header className="performance-page-head"><div><Link className="back-link" to={`/projects/${encodeURIComponent(projectId)}/qa-runs/${encodeURIComponent(qaRunId)}`}>QA 런으로 돌아가기</Link><p className="performance-eyebrow">RUN {data.runId}</p><h1>런 성능 상세</h1><p>서버가 내려준 {data.series.bucketMs}ms 버킷 · 다시 샘플링하지 않음</p></div></header>
    {summary === null ? <div className="performance-empty"><strong>성능 샘플 없음</strong><p>이 런에서는 측정된 구간이 없습니다. 0으로 해석하지 않습니다.</p></div> : <>
      <div className="performance-metrics">
        <Metric label="평균 프레임타임" value={`${summary.frameMeanMs.toFixed(1)} ms`} detail={summary.budgetMs === null ? '프레임 예산 판단 불가 · 절대값' : `예산 ${summary.budgetMs.toFixed(2)} ms 기준`} />
        <Metric label="p95 / p99" value={`${summary.frameP95Ms.toFixed(1)} / ${summary.frameP99Ms.toFixed(1)} ms`} detail="느린 프레임 분포" />
        <Metric label="Hitch / 분" value={summary.hitchesPerMinute.toFixed(1)} detail="런 길이를 보정한 비교값" />
        <Metric label="측정 커버리지" value={`${(summary.coverageRatio * 100).toFixed(0)}%`} detail={summary.coverageRatio < LOW_COVERAGE_RATIO ? '낮은 신뢰도 · 80% 미만' : '신뢰 가능 범위'} warning={summary.coverageRatio < LOW_COVERAGE_RATIO} />
      </div>
      {summary.dischargingRatio > HIGH_DISCHARGING_RATIO && <p className="performance-warning" role="status">주의 · 방전 상태가 {(summary.dischargingRatio * 100).toFixed(0)}%로 높습니다. 노트북 스로틀링 영향을 받을 수 있어 다른 런과 직접 비교하지 않습니다.</p>}
      <Panel title="프레임타임" subtitle="평균만으로 숨는 끊김을 p95·최대와 hitch 버킷으로 확인합니다."><PerformanceChart budgetMs={summary.budgetMs} points={data.series.points} series={[...frameSeries]} /></Panel>
      <div className="performance-columns">
        <Panel title="CPU" subtitle={summary.processSampleRatio === 0 ? 'process 표본 없음' : `process 커버리지 ${(summary.processSampleRatio * 100).toFixed(0)}%`}><PerformanceChart points={data.series.points} series={[{ key: 'cpuPercent', label: 'CPU %', className: 'performance-line performance-line--cpu' }]} /></Panel>
        <Panel title="메모리" subtitle={`최대 ${formatBytes(summary.workingSetBytesMax)}`}><PerformanceChart points={data.series.points} series={[{ key: 'workingSetBytes', label: 'Working set bytes', className: 'performance-line performance-line--memory' }]} /></Panel>
      </div>
      <Panel title="접근 가능한 측정 목록" subtitle="그래프와 같은 버킷을 시간순으로 제공합니다."><div className="performance-table-wrap"><table className="performance-table"><thead><tr><th>경과</th><th>상태</th><th>평균</th><th>p95</th><th>최대</th><th>Hitch</th><th>CPU</th><th>메모리</th></tr></thead><tbody>{data.series.points.map((point) => <tr key={point.atMs}><td>{(point.atMs / 1000).toFixed(1)}s</td><td>{point.isFocused ? '측정됨' : '포커스 상실 · 측정 안 됨'}</td><td>{point.frameMeanMs ?? '—'}</td><td>{point.frameP95Ms ?? '—'}</td><td>{point.frameMaxMs ?? '—'}</td><td>{point.hitchCount ?? '—'}</td><td>{point.cpuPercent ?? '—'}</td><td>{formatBytes(point.workingSetBytes)}</td></tr>)}</tbody></table></div></Panel>
    </>}
  </section>
}

function Metric({ label, value, detail, warning = false }: { label: string; value: string; detail: string; warning?: boolean }) { return <div className={`performance-metric${warning ? ' performance-metric--warning' : ''}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div> }
function Panel({ title, subtitle, children }: React.PropsWithChildren<{ title: string; subtitle: string }>) { return <section className="performance-panel"><header><div><h2>{title}</h2><p>{subtitle}</p></div></header>{children}</section> }
