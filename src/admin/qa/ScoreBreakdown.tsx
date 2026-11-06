import { useId, useState } from 'react'
import { Coverage } from './Coverage'
import { ScoreRate } from './ScoreRate'
import {
  breakdown,
  casePassRate,
  falseAlarmRate,
  gradedSteps,
  missRate,
  stepPassRate,
  sumCells,
  unreportedRate,
  type AxisGroup,
} from './pivot'
import { AXES, type Axis, type QaStatsCell } from './qaStatsTypes'
import { emphasize } from './emphasize'
import { useQa } from './useQa'
import { InfoHint } from '../../design-system/primitives/InfoHint'

/**
 * "그래서 QA를 잘했나"를 축 하나로 접어 보는 표.
 *
 * 축별 분해와 따로 두는 이유는 컬럼 수다. 완주율 표에 아홉 칸을 더 붙이면 두 열 격자에서 전부
 * 가로 스크롤 안으로 들어가 비교가 되지 않는다. 대신 축을 고르게 하고 폭을 전부 쓴다.
 *
 * **자기채점과 기대-라벨 채점을 같은 표에 두되 커버리지를 각각 앞에 둔다.** 두 지표의 분모가
 * 다르기 때문이다 — 요약을 못 받은 런과, 요약은 받았지만 라벨이 없어 채점하지 않은 런은 다른
 * 이유로 빠진다. 하나의 "커버리지"로 합치면 그 둘이 섞여 저작의 공백이 설정의 성질로 읽힌다.
 */
export function ScoreBreakdown({ cells }: { cells: QaStatsCell[] }) {
  const { t } = useQa()
  const [axis, setAxis] = useState<Axis>('model')
  const axisFieldId = useId()

  const groups = breakdown(cells, axis)
  const footer = sumCells(groups)

  return (
    <section aria-labelledby="score-title">
      <div className="section__head">
        <h2 className="section__title" id="score-title">
          {t.score.title}
          <InfoHint>
            {t.score.note}
            <br />
            {emphasize(t.score.footnote)}
          </InfoHint>
        </h2>
        <span className="topbar__spacer" />
        <span className="field">
          <label className="field__label" htmlFor={axisFieldId}>
            {t.score.axis}
          </label>
          <select
            className="control"
            id={axisFieldId}
            value={axis}
            onChange={(event) => setAxis(event.target.value as Axis)}
          >
            {AXES.map((value) => (
              <option key={value} value={value}>
                {t.axes[value]}
              </option>
            ))}
          </select>
        </span>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t.axes[axis]}</th>
              <th scope="col" className="num">
                {t.runsColumn}
              </th>
              <th scope="col" className="num">
                {t.score.verdictCoverage}
              </th>
              <th scope="col" className="num">
                {t.score.stepPassRate}
              </th>
              <th scope="col" className="num">
                {t.score.casePassRate}
              </th>
              <th scope="col" className="num">
                {t.score.scoreCoverage}
              </th>
              {/* 미탐을 오탐보다 앞에 둔다. QA 에이전트에게 더 나쁜 쪽이고, 표는 왼쪽부터 읽힌다. */}
              <th scope="col" className="num">
                {t.score.missRate}
              </th>
              <th scope="col" className="num">
                {t.score.falseAlarmRate}
              </th>
              <th scope="col" className="num">
                {t.score.unreportedRate}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <ScoreRow key={group.value ?? '\0unknown'} group={group} />
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  {t.noRuns}
                </td>
              </tr>
            )}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <ScoreRow group={{ value: t.totalRow, ...footer }} />
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}

function ScoreRow({ group }: { group: AxisGroup }) {
  const { t, fmt } = useQa()
  const graded = gradedSteps(group)

  return (
    <tr>
      <td>
        <span className={group.value === null ? 'axis-value axis-value--unknown' : 'axis-value'}>
          {group.value ?? t.unknown}
        </span>
      </td>
      <td className="num">{fmt.count(group.runs)}</td>
      <td className="num">
        <Coverage known={group.verdictKnown} runs={group.runs} nothing={t.score.noVerdict} />
      </td>
      <td className="num">
        <ScoreRate
          rate={stepPassRate(group)}
          detail={t.score.stepDetail(group.stepsPassed, group.stepsTotal, group.verdictKnown)}
        />
      </td>
      <td className="num">
        <ScoreRate
          rate={casePassRate(group)}
          detail={t.score.caseDetail(group.casesPassed, group.casesTotal, group.verdictKnown)}
        />
      </td>
      <td className="num">
        <Coverage known={group.scoredRuns} runs={group.runs} nothing={t.score.noGrading} />
      </td>
      <td className="num">
        <ScoreRate
          rate={missRate(group)}
          polarity="lower-better"
          detail={t.score.missDetail(group.miss, group.miss + group.correctFail)}
        />
      </td>
      <td className="num">
        <ScoreRate
          rate={falseAlarmRate(group)}
          polarity="lower-better"
          detail={t.score.falseAlarmDetail(group.falseAlarm, group.correctPass + group.falseAlarm)}
        />
      </td>
      <td className="num">
        <ScoreRate
          rate={unreportedRate(group)}
          polarity="lower-better"
          detail={t.score.unreportedDetail(group.unreported, graded)}
        />
      </td>
    </tr>
  )
}
