import { useTestCaseLabel } from '../../testCases/testCaseIdentifiers'
import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { reliability, type Counts, type Reliability } from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'
import { reliabilityDate, reliabilityRange } from './reliabilityRange'
import './evaluation.css'

const percentage = (value: number | null, digits = 1) => value === null ? '—' : `${(value * 100).toFixed(digits)}%`

export function ReliabilityPanel({ projectId }: { projectId: string }) {
  const { locale } = useI18n()
  const caseLabel = useTestCaseLabel()
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
  const rate = (value: number | null, numerator: number, denominator: number) => <>{percentage(value)}<small>{numerator}/{denominator}</small></>
  const cells = (counts: Counts) => <>
    <td>{counts.total}</td><td>{counts.reviewed}</td><td>{percentage(counts.reviewCoverage)}</td>
    <td>{rate(counts.falsePositiveRate, counts.falsePositives, counts.falsePositives + counts.trueNegatives)}</td>
    <td>{rate(counts.falseNegativeRate, counts.falseNegatives, counts.falseNegatives + counts.truePositives)}</td>
  </>
  const table = (title: string, first: string, rows: { key: string; label?: string; counts: Counts }[]) => <div className="qe-table">
    <h4>{title}</h4>
    <div className="qe-table-scroll"><table>
      <thead><tr><th scope="col">{first}</th><th scope="col">{copy.total}</th><th scope="col">{copy.reviewed}</th><th scope="col">{copy.coverage}</th><th scope="col">{copy.fp}</th><th scope="col">{copy.fn}</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}><td>{row.label ?? row.key}</td>{cells(row.counts)}</tr>)}</tbody>
    </table></div>
  </div>
  const overall = data?.overall
  return <details className="qe-rel">
    <summary>
      <h3>{copy.reliability}</h3>
      <span className="qe-meta mono">{range.from} – {range.to}</span>
      {overall && <div className="qe-stats">
        <div className="qe-stat"><span>{copy.total}</span><b>{overall.total}</b></div>
        <div className="qe-stat"><span>{copy.coverage}</span><b>{percentage(overall.reviewCoverage, 0)}</b></div>
        <div className="qe-stat"><span>{copy.fp}</span><b>{percentage(overall.falsePositiveRate)}</b><small>{overall.falsePositives}/{overall.falsePositives + overall.trueNegatives}</small></div>
        <div className="qe-stat"><span>{copy.fn}</span><b>{percentage(overall.falseNegativeRate)}</b><small>{overall.falseNegatives}/{overall.falseNegatives + overall.truePositives}</small></div>
      </div>}
    </summary>
    <div className="qe-rel-body">
      <form className="qe-dates" onSubmit={event => { event.preventDefault(); setRange({ from, to }) }}>
        <label>{copy.from}<input required type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label>
        <label>{copy.to}<input required type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></label>
        <button className="button button--secondary button--compact" type="submit">{copy.apply}</button>
      </form>
      {error && <p className="qe-status" role="alert">{copy.error}</p>}
      {!data && !error && <p className="qe-status" role="status">{copy.loading}</p>}
      {data && <>
        <p className="qe-hint">{copy.bias} · {copy.inconclusive} {data.overall.inconclusiveReviews} · {copy.interrupted} {data.overall.interruptedFalseNegatives}</p>
        <div className="qe-tables">
          {table(copy.trend, copy.date, data.daily)}
          {table(copy.cases, copy.case, data.cases.map(row => ({ ...row, label: caseLabel(row.key) })))}
        </div>
      </>}
    </div>
  </details>
}
