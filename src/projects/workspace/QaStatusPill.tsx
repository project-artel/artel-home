import { useI18n } from '../../i18n/useI18n'
import type { QaTryStatus } from '../../qa/qaTypes'
import type { CaseRatio } from '../../qa/scenarioOutcome'

/**
 * A run's state, as a label with a dot beside it.
 *
 * Reuses the existing `qa-status` classes so a status looks the same in a list
 * as it does inside the run itself — including its dot, which that rule draws
 * with `::before` rather than an element, keeping colour out of the text layer.
 *
 * `ratio` 가 있으면 상태 이름 대신 TC 통과 수와 비율을 그 비율의 색으로 보인다. TC 하나만 실패해도 빨간 "실패" 로
 * 보이던 것을 바꾼다(`caseRatioOf`).
 */
export function QaStatusPill({ status, ratio = null }: { status: QaTryStatus; ratio?: CaseRatio | null }) {
  const { t } = useI18n()

  if (ratio !== null) {
    return (
      <span className={`qa-status qa-status--ratio-${ratio.tone}`} title={t.qa.run.caseRatioTitle(ratio.passed, ratio.total)}>
        {t.qa.run.caseRatio(ratio.passed, ratio.total, ratio.percent)}
      </span>
    )
  }
  return (
    <span className={`qa-status qa-status--${status.toLowerCase()}`}>
      {t.qa.statusLabels[status]}
    </span>
  )
}
