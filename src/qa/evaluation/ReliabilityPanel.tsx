import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { reliability, type Counts, type Reliability } from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'
import { reliabilityDate, reliabilityRange } from './reliabilityRange'
import './evaluation.css'

const percentage = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`

export function ReliabilityPanel({ projectId }: { projectId: string }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [from, setFrom] = useState(() => reliabilityDate(-30))
  const [to, setTo] = useState(() => reliabilityDate(0))
  const [range, setRange] = useState({ from, to })
  const [data, setData] = useState<Reliability | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const period = reliabilityRange(range.from, range.to)
    void reliability(projectId, period.from, period.to, controller.signal)
      .then(result => { setData(result); setError(false) }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [projectId, range])
  const cells = (counts: Counts) => <>
    <td>{counts.total}</td><td>{counts.reviewed}</td><td>{percentage(counts.reviewCoverage)}</td>
    <td>{percentage(counts.falsePositiveRate)} ({counts.falsePositives}/{counts.falsePositives + counts.trueNegatives})</td>
    <td>{percentage(counts.falseNegativeRate)} ({counts.falseNegatives}/{counts.falseNegatives + counts.truePositives})</td>
  </>
  const table = (rows: { key: string; counts: Counts }[]) => <div className="qe-table"><table>
    <thead><tr><th scope="col">—</th><th scope="col">{copy.total}</th><th scope="col">{copy.reviewed}</th><th scope="col">{copy.coverage}</th><th scope="col">{copy.fp}</th><th scope="col">{copy.fn}</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.key}</th>{cells(row.counts)}</tr>)}</tbody>
  </table></div>
  return <details className="qe-panel"><summary>{copy.reliability}</summary>
    <p>{copy.bias}</p>
    <form className="qe-dates" onSubmit={event => { event.preventDefault(); setRange({ from, to }) }}>
      <label>{copy.from}<input required type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label>
      <label>{copy.to}<input required type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></label>
      <button className="button button--secondary" type="submit">{copy.apply}</button>
    </form>
    {error && <p role="alert">{copy.error}</p>}
    {!data && !error && <p role="status">{copy.loading}</p>}
    {data && <>
      {table([{ key: copy.total, counts: data.overall }])}
      <p>{copy.inconclusive}: {data.overall.inconclusiveReviews} · {copy.interrupted}: {data.overall.interruptedFalseNegatives}</p>
      <h4>{copy.trend}</h4>{table(data.daily)}
      <h4>{copy.cases}</h4>{table(data.cases.map(row => ({ ...row, key: `TC ${row.key}` })))}
    </>}
  </details>
}
