import { CompletionRate } from './CompletionRate'
import { ScoreRate } from './ScoreRate'
import { scoreCoverage, stepPassRate, verdictCoverage } from './pivot'
import type { QaStatsTotals } from './qaStatsTypes'
import { useQa } from './useQa'

/**
 * 기간 전체 합계.
 *
 * 카드 격자가 아니라 한 줄 레일이다 — DESIGN.md가 반복되는 둥근 카드와 일반적인 KPI 타일을
 * 금지하고, 이 숫자들은 서로 비교되는 값이 아니라 아래 표 전체의 스코프를 알려 주는 머리말이다.
 */
export function TotalsRail({ total }: { total: QaStatsTotals }) {
  const { t, fmt } = useQa()
  const tokens = total.inputTokens + total.outputTokens

  return (
    <div className="rail">
      <div className="rail__item">
        <span className="rail__label">{t.rail.totalRuns}</span>
        <span className="rail__value">{fmt.count(total.runs)}</span>
        <span className="rail__hint">
          {t.rail.inProgressCancelled(fmt.count(total.active), fmt.count(total.cancelled))}
        </span>
      </div>
      <div className="rail__item">
        <span className="rail__label">{t.rail.completionRate}</span>
        <span className="rail__value">
          <CompletionRate row={total} />
        </span>
        {/* 통과율이 아니다. qa_try.status는 런 생명주기이지 QA 판정이 아니다. */}
        <span className="rail__hint">
          {t.rail.completedFailed(fmt.count(total.completed), fmt.count(total.failed))}
        </span>
      </div>
      <div className="rail__item">
        <span className="rail__label">{t.rail.stepPassRate}</span>
        <span className="rail__value">
          <ScoreRate
            rate={stepPassRate(total)}
            detail={t.rail.stepPassDetail(total.stepsPassed, total.stepsTotal)}
          />
        </span>
        {/* 이 비율의 분모를 같은 칸에 둔다. 판정을 못 받은 런이 빠진 값이라, 커버리지 없이는
            "깔끔하게 끝난 런"에만 조건부라는 사실이 화면에서 사라진다. */}
        <span className="rail__hint">
          {t.rail.verdictCoverage(
            fmt.rate(verdictCoverage(total)),
            fmt.count(total.verdictKnown),
            fmt.count(total.runs),
          )}
        </span>
      </div>
      <div className="rail__item">
        <span className="rail__label">{t.rail.missFalseAlarm}</span>
        {/* 두 방향을 한 숫자로 접지 않는다. 미탐(실패해야 할 것을 통과라 함)이 훨씬 나쁘고,
            스칼라 하나로 접으면 두 종류의 나쁜 설정이 같은 점수로 보인다. */}
        <span className="rail__value" title={t.rail.missFalseAlarmTitle(total.miss, total.falseAlarm)}>
          {fmt.count(total.miss)} / {fmt.count(total.falseAlarm)}
        </span>
        <span className="rail__hint">
          {total.scoredRuns === 0
            ? t.rail.noScoredRuns
            : t.rail.scoreCoverage(fmt.rate(scoreCoverage(total)), fmt.count(total.unreported))}
        </span>
      </div>
      <div className="rail__item">
        <span className="rail__label">{t.rail.llmTokens}</span>
        <span className="rail__value" title={fmt.count(tokens)}>
          {fmt.tokens(tokens)}
        </span>
        <span className="rail__hint">
          {t.rail.tokensInOut(fmt.tokens(total.inputTokens), fmt.tokens(total.outputTokens))}
        </span>
      </div>
      <div className="rail__item">
        <span className="rail__label">{t.rail.llmCost}</span>
        <span className="rail__value">{fmt.cost(total.costUsd)}</span>
        <span className="rail__hint">
          {total.costUsd === null
            ? t.rail.noPricedCall
            : t.rail.calls(fmt.count(total.llmCalls))}
        </span>
      </div>
      <div className="rail__item">
        <span className="rail__label">{t.rail.avgDuration}</span>
        <span className="rail__value">{fmt.duration(total.avgCompletedDurationMs)}</span>
        {/* 실패·취소를 섞으면 즉시 실패가 "빨라졌다"로 읽힌다. */}
        <span className="rail__hint">{t.rail.completedOnly}</span>
      </div>
    </div>
  )
}
