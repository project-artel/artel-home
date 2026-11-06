import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import { RateCell } from './RateCell'
import {
  breakdown,
  citationCoverage,
  citationRate,
  repudiationRate,
  sumCells,
} from './pivot'
import { type Axis, type KnowledgeStatsCell } from './knowledgeStatsTypes'

/**
 * 축 하나로 접은 표.
 *
 * 미상(null) 행을 지우지 않는다 — 지우면 이 표의 합이 위 레일의 총계와 어긋나고, 화면에는 그
 * 차이를 설명할 자리가 없다. 여기 모이는 것은 "만든 런은 아는데 그 런의 축이 비어 있는" 버전이다
 * (만든 런 자체를 모르는 버전은 집계 질의의 `qa_try` 조인이 이미 떨군다).
 */
export function KnowledgeAxisBreakdown({
  axis,
  cells,
}: {
  axis: Axis
  cells: KnowledgeStatsCell[]
}) {
  const { t, locale } = useI18n()
  const strings = t.adminKnowledge
  const format = adminFormat(locale)
  const groups = breakdown(cells, axis)
  const footer = sumCells(groups)

  return (
    <section aria-labelledby={`knowledge-axis-${axis}`}>
      <h3 className="panel__title" id={`knowledge-axis-${axis}`}>
        {strings.axes[axis]}
      </h3>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{strings.axes[axis]}</th>
              <th scope="col" className="num">
                {strings.createdVersions}
              </th>
              <th scope="col" className="num">
                {strings.deletedByLaterRuns}
              </th>
              <th scope="col" className="num">
                {strings.retrievals}
              </th>
              <th scope="col" className="num">
                {strings.citationRate}
              </th>
              <th scope="col" className="num">
                {strings.knownCitations}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.value ?? ' unknown'}>
                <td>
                  <span
                    className={
                      group.value === null ? 'axis-value axis-value--unknown' : 'axis-value'
                    }
                  >
                    {group.value ?? strings.unknown}
                  </span>
                </td>
                <td className="num">{format.count(group.entryVersions)}</td>
                <td className="num">
                  {/* 낮을수록 좋다. 방향을 안 뒤집으면 잘 살아남는 설정이 빨갛게 칠해진다. */}
                  <RateCell
                    rate={repudiationRate(group)}
                    higherIsBetter={false}
                    title={strings.deletedRateTitle(format.count(group.repudiatedVersions), format.count(group.entryVersions))}
                    unknownHint={strings.deletedRateUnknown}
                  />
                </td>
                <td className="num">{format.count(group.retrievalTotal)}</td>
                <td className="num">
                  <RateCell
                    rate={citationRate(group)}
                    title={strings.citationRateTitle(format.count(group.citationTotal), format.count(group.citationKnownTotal))}
                    unknownHint={strings.citationRateUnknown}
                  />
                </td>
                <td className="num">
                  {/* 인용률을 얼마나 믿을 수 있는지. 낮으면 옆 칸 숫자가 표본 몇 건짜리다. */}
                  <RateCell
                    rate={citationCoverage(group)}
                    title={strings.coverageTitle(format.count(group.citationKnownTotal), format.count(group.retrievalTotal))}
                    unknownHint={strings.coverageUnknown}
                  />
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {strings.emptyPeriod}
                </td>
              </tr>
            )}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr>
                <td>합계</td>
                <td className="num">{format.count(footer.entryVersions)}</td>
                <td className="num">
                  <RateCell rate={repudiationRate(footer)} higherIsBetter={false} />
                </td>
                <td className="num">{format.count(footer.retrievalTotal)}</td>
                <td className="num">
                  <RateCell rate={citationRate(footer)} />
                </td>
                <td className="num">
                  <RateCell rate={citationCoverage(footer)} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}
