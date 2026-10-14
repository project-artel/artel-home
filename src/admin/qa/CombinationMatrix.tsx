import { useId, useState } from 'react'
import {
  completionRate,
  matrix,
  missRate,
  scoreCoverage,
  stepPassRate,
  verdictCoverage,
} from './pivot'
import { AXES, type Axis, type QaStatsCell, type QaStatsTotals } from './qaStatsTypes'
import { useQa } from './useQa'

/**
 * 칸에 무엇을 쓸지.
 *
 * **커버리지를 지표마다 다르게 잡는다.** 완주율은 모든 런이 분모지만, 합격률은 판정을 받은 런만,
 * 미탐률은 채점된 런만이 분모다. 한 칸에 비율만 쓰고 커버리지를 지표와 무관하게 고정하면 "이
 * 조합은 다섯 번 돌렸는데 하나만 채점됐다"가 화면에서 사라지고, 그 한 번의 결과가 다섯 번의
 * 결과처럼 읽힌다.
 */
interface Metric {
  /** Key of the metric's strings under `t.matrix.metrics`. */
  key: 'completion' | 'stepPass' | 'miss'
  rate: (row: QaStatsTotals) => number | null
  /** 그 비율이 몇 개의 런 위에 얹혔는지. null이면 분모가 곧 런 수라 따로 쓸 것이 없다. */
  coverage: ((row: QaStatsTotals) => number | null) | null
  known: ((row: QaStatsTotals) => number) | null
  /** 낮을수록 좋은 지표인지. 같은 색 규칙을 쓰면 최악의 설정이 초록으로 칠해진다. */
  lowerBetter: boolean
}

const METRICS = {
  completion: {
    key: 'completion',
    rate: completionRate,
    coverage: null,
    known: null,
    lowerBetter: false,
  },
  stepPass: {
    key: 'stepPass',
    rate: stepPassRate,
    coverage: verdictCoverage,
    known: (row: QaStatsTotals) => row.verdictKnown,
    lowerBetter: false,
  },
  miss: {
    key: 'miss',
    rate: missRate,
    coverage: scoreCoverage,
    known: (row: QaStatsTotals) => row.scoredRuns,
    lowerBetter: true,
  },
} satisfies Record<string, Metric>

type MetricKey = keyof typeof METRICS

/**
 * 두 축 교차표. "모델을 바꾼 덕인가, 구조를 바꾼 덕인가"는 한 축만 봐서는 갈리지 않는다.
 *
 * 서버를 다시 부르지 않는다 — 런은 4축 조합으로 분할되어 있어 어떤 두 축의 교차든 같은 셀
 * 목록의 부분합이다.
 */
export function CombinationMatrix({ cells }: { cells: QaStatsCell[] }) {
  const { t, fmt } = useQa()
  const [rowAxis, setRowAxis] = useState<Axis>('model')
  const [colAxis, setColAxis] = useState<Axis>('agentArch')
  // 기본값은 완주율이다 — 이 화면이 원래 보여 주던 값이라, 새 지표를 기본으로 두면 같은 표가
  // 어느 날 다른 뜻이 된다.
  const [metricKey, setMetricKey] = useState<MetricKey>('completion')
  const rowId = useId()
  const colId = useId()
  const metricId = useId()
  const metric: Metric = METRICS[metricKey]
  const metricText = t.matrix.metrics[metric.key]

  /** 같은 축을 양쪽에 놓으면 대각선만 찬 표가 된다. 고르는 순간 반대쪽을 비켜 준다. */
  const pick = (next: Axis, side: 'row' | 'col') => {
    const other = side === 'row' ? colAxis : rowAxis
    const setThis = side === 'row' ? setRowAxis : setColAxis
    const setOther = side === 'row' ? setColAxis : setRowAxis
    setThis(next)
    if (next === other) {
      setOther(side === 'row' ? rowAxis : colAxis)
    }
  }

  const view = matrix(cells, rowAxis, colAxis)

  return (
    <section aria-labelledby="matrix-title">
      <div className="section__head">
        <h2 className="section__title" id="matrix-title">
          {t.matrix.title}
        </h2>
        <span className="section__note">{metricText.note}. {t.matrix.emptyCellsNote}</span>
        <span className="topbar__spacer" />
        <span className="field">
          <label className="field__label" htmlFor={metricId}>
            {t.matrix.metric}
          </label>
          <select
            className="control"
            id={metricId}
            value={metricKey}
            onChange={(event) => setMetricKey(event.target.value as MetricKey)}
          >
            {(Object.keys(METRICS) as MetricKey[]).map((key) => (
              <option key={key} value={key}>
                {t.matrix.metrics[METRICS[key].key].label}
              </option>
            ))}
          </select>
        </span>
        <span className="field">
          <label className="field__label" htmlFor={rowId}>
            {t.matrix.row}
          </label>
          <select
            className="control"
            id={rowId}
            value={rowAxis}
            onChange={(event) => pick(event.target.value as Axis, 'row')}
          >
            {AXES.map((axis) => (
              <option key={axis} value={axis}>
                {t.axes[axis]}
              </option>
            ))}
          </select>
        </span>
        <span className="field">
          <label className="field__label" htmlFor={colId}>
            {t.matrix.column}
          </label>
          <select
            className="control"
            id={colId}
            value={colAxis}
            onChange={(event) => pick(event.target.value as Axis, 'col')}
          >
            {AXES.map((axis) => (
              <option key={axis} value={axis}>
                {t.axes[axis]}
              </option>
            ))}
          </select>
        </span>
      </div>

      <div className="table-scroll">
        <table className="table matrix">
          <caption className="section__note" style={{ captionSide: 'bottom', textAlign: 'left' }}>
            {t.matrix.caption(t.axes[rowAxis], t.axes[colAxis], metricText.label)}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                {t.axes[rowAxis]} \ {t.axes[colAxis]}
              </th>
              {view.colValues.map((value) => (
                <th scope="col" className="num" key={value ?? ' unknown'}>
                  {value ?? t.unknown}
                </th>
              ))}
              <th scope="col" className="num">
                {t.totalRow}
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rowValues.map((rowValue, rowIndex) => (
              <tr key={rowValue ?? ' unknown'}>
                <th scope="row">{rowValue ?? t.unknown}</th>
                {view.grid[rowIndex].map((cell, colIndex) => (
                  <td
                    className={cell ? 'cell' : 'cell cell--empty'}
                    key={view.colValues[colIndex] ?? ' unknown'}
                  >
                    {cell ? (
                      <MatrixCell row={cell} metric={metric} />
                    ) : (
                      // 0이 아니라 빈 칸이다. "돌려 보고 전부 실패했다"와 "안 돌려 봤다"는 다르다.
                      <span aria-label={t.matrix.noRun}>·</span>
                    )}
                  </td>
                ))}
                <td className="cell">
                  <MatrixCell row={view.rowTotals[rowIndex]} metric={metric} />
                </td>
              </tr>
            ))}
            {view.rowValues.length === 0 && (
              <tr>
                <td className="muted">{t.noRuns}</td>
              </tr>
            )}
          </tbody>
          {view.rowValues.length > 0 && (
            <tfoot>
              <tr>
                <td>{t.totalRow}</td>
                {view.colTotals.map((cell, index) => (
                  <td className="cell" key={view.colValues[index] ?? ' unknown'}>
                    <MatrixCell row={cell} metric={metric} />
                  </td>
                ))}
                <td className="cell">
                  <span className="cell__runs">
                    {fmt.count(view.rowTotals.reduce((sum, row) => sum + row.runs, 0))}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}

/**
 * 칸 하나 — 런 수, 지표, 그리고 그 지표의 커버리지.
 *
 * 커버리지 줄을 지표와 함께 놓는 것이 이 칸의 요점이다. 다섯 번 돌렸는데 하나만 채점된 조합과
 * 다섯 번 다 채점된 조합이 같은 비율을 낼 수 있고, 그 둘을 같은 칸으로 보여 주면 표본 하나짜리
 * 결과가 다섯 번의 결과로 읽힌다. 커버리지가 0이면 비율 자리는 `—`가 되고 이 줄이 이유를 쓴다.
 */
function MatrixCell({ row, metric }: { row: QaStatsTotals; metric: Metric }) {
  const { t, fmt } = useQa()
  const known = metric.known?.(row) ?? null

  return (
    <>
      <span className="cell__runs">{fmt.count(row.runs)}</span>
      <span className="cell__rate">{fmt.rate(metric.rate(row))}</span>
      {metric.coverage !== null && (
        <span
          className={known === 0 ? 'cell__coverage cell__coverage--none' : 'cell__coverage'}
          title={t.matrix.coverageTitle(known ?? 0, row.runs)}
        >
          {known === 0 ? t.matrix.noSample : `${fmt.count(known ?? 0)}/${fmt.count(row.runs)}`}
        </span>
      )}
    </>
  )
}
