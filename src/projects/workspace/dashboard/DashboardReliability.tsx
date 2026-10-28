import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../../i18n/useI18n'
import { reliability, type Reliability } from '../../../qa/evaluation/evaluationApi'
import { evaluationCopy } from '../../../qa/evaluation/evaluationCopy'
import { dashboardReliabilityRange, rateLines, reliabilityDays, reliabilityPercent as percent } from './reliabilityModel'

type Copy = typeof evaluationCopy.ko
type Result = { key: string; data: Reliability | null; failed: boolean }

export function DashboardReliability({ projectId, days, now }: { projectId: string; days: number; now: number }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const { from, to, firstDay, lastDay } = dashboardReliabilityRange(days, now)
  const key = `${projectId}:${from}:${to}:${retry}`
  useEffect(() => {
    const controller = new AbortController()
    void reliability(projectId, from, to, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, data, failed: false })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, data: null, failed: true })
    })
    return () => controller.abort()
  }, [projectId, from, to, key])
  const current = result?.key === key ? result : null
  return <section className="db-card db-reliability" aria-labelledby="db-reliability-title">
    <header className="db-card-head">
      <h2 id="db-reliability-title">{copy.reliability}</h2>
      <span className="db-mono db-muted">{firstDay} – {lastDay}</span>
      <Link className="db-more" to={`/projects/${encodeURIComponent(projectId)}/qa-history`}>{copy.title}</Link>
    </header>
    {!current ? <p className="db-quiet" role="status">{copy.loading}</p> : current.failed ?
      <div role="alert"><p className="db-quiet">{copy.error}</p><button type="button" className="button button--secondary button--compact" onClick={() => setRetry(value => value + 1)}>{copy.retry}</button></div> :
      current.data && <ReliabilityContent data={current.data} firstDay={firstDay} lastDay={lastDay} copy={copy} />}
  </section>
}

export function ReliabilityContent({ data, firstDay, lastDay, copy }: { data: Reliability; firstDay: string; lastDay: string; copy: Copy }) {
  const rows = reliabilityDays(data.daily, firstDay, lastDay)
  const overall = data.overall
  const max = Math.max(1, ...rows.map(row => row.reviewed))
  const x = (i: number) => 44 + (i + .5) * 640 / rows.length
  const y = (value: number) => 164 - value * 140
  const summary = [
    { label: copy.reviewed, value: String(overall.reviewed), hint: `${copy.total} ${overall.total}` },
    { label: copy.coverage, value: percent(overall.reviewCoverage), hint: `${overall.reviewed}/${overall.total}` },
    { label: copy.fp, value: percent(overall.falsePositiveRate), hint: `${overall.falsePositives}/${overall.falsePositives + overall.trueNegatives}` },
    { label: copy.fn, value: percent(overall.falseNegativeRate), hint: `${overall.falseNegatives}/${overall.falseNegatives + overall.truePositives}` },
  ]
  const labelIndexes = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])]
  return <>
    <dl className="db-reliability-stats">{summary.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}<small>{item.hint}</small></dd></div>)}</dl>
    <div className="db-reliability-charts">
      <div className="db-reliability-chart">
        <h3>{copy.trend}</h3>
        <div className="db-reliability-legend"><span className="db-reliability-fp">━ {copy.fp}</span><span className="db-reliability-fn">┄ {copy.fn}</span></div>
        <div className="db-reliability-scroll">
          <svg viewBox="0 0 710 202" role="img" aria-label={`${copy.fp} · ${copy.fn} · ${copy.trend}`}>
            {[0, .5, 1].map(value => <g key={value}><line className="db-reliability-grid" x1="44" x2="684" y1={y(value)} y2={y(value)} /><text x="36" y={y(value) + 4} textAnchor="end">{value * 100}%</text></g>)}
            {(['fp', 'fn'] as const).map(metric => <g key={metric} className={`db-reliability-${metric}`}>
              {rateLines(rows.map(row => row[metric])).map((line, i) => <polyline key={i} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={metric === 'fn' ? '5 4' : undefined} points={line.map(p => `${x(p.index)},${y(p.value)}`).join(' ')} />)}
              {rows.map((row, i) => row[metric] === null ? null : <circle key={row.date} cx={x(i)} cy={y(row[metric])} r={metric === 'fn' ? 4.5 : 2.5} fill={metric === 'fn' ? 'var(--color-bg-surface)' : 'currentColor'} stroke="currentColor" strokeWidth="2"><title>{`${row.date} · ${metric === 'fp' ? copy.fp : copy.fn} ${percent(row[metric])} · ${metric === 'fp' ? `${row.fpCount}/${row.fpSample}` : `${row.fnCount}/${row.fnSample}`}`}</title></circle>)}
            </g>)}
            {labelIndexes.map(i => <text key={i} x={x(i)} y="190" textAnchor="middle">{rows[i].date.slice(5)}</text>)}
          </svg>
        </div>
      </div>
      <div className="db-reliability-chart">
        <h3>{copy.reviewed}</h3>
        <div className="db-reliability-scroll">
          <svg viewBox="0 0 710 202" role="img" aria-label={`${copy.reviewed} · ${copy.trend}`}>
            {[0, max].map(value => <g key={value}><line className="db-reliability-grid" x1="44" x2="684" y1={y(value / max)} y2={y(value / max)} /><text x="36" y={y(value / max) + 4} textAnchor="end">{value}</text></g>)}
            {rows.map((row, i) => <rect key={row.date} className="db-reliability-bar" x={x(i) - 240 / rows.length} y={y(row.reviewed / max)} width={480 / rows.length} height={140 * row.reviewed / max}><title>{`${row.date} · ${copy.reviewed} ${row.reviewed}`}</title></rect>)}
            {labelIndexes.map(i => <text key={i} x={x(i)} y="190" textAnchor="middle">{rows[i].date.slice(5)}</text>)}
          </svg>
        </div>
      </div>
    </div>
    <p className="db-quiet">{copy.bias}</p>
    <details className="db-reliability-details"><summary>{copy.trend}</summary><div className="db-reliability-scroll"><table>
      <caption>{copy.reliability} · {firstDay} – {lastDay}</caption>
      <thead><tr><th scope="col">{copy.date}</th><th scope="col">{copy.reviewed}</th><th scope="col">{copy.total}</th><th scope="col">{copy.fp}</th><th scope="col">{copy.fn}</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{row.reviewed}</td><td>{row.total}</td><td>{percent(row.fp)} <small>({row.fpCount}/{row.fpSample})</small></td><td>{percent(row.fn)} <small>({row.fnCount}/{row.fnSample})</small></td></tr>)}</tbody>
    </table></div></details>
  </>
}
