import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import type { LlmUsageStats } from './llmUsageTypes'
import { isPartiallyPriced, totalTokens } from './usage'
import { InfoHint } from '../../design-system/primitives/InfoHint'

/**
 * 기간 전체 합계.
 *
 * 카드 격자가 아니라 한 줄 레일이다 — DESIGN.md가 반복되는 둥근 카드와 일반적인 KPI 타일을
 * 금지하고, 이 숫자들은 서로 비교되는 값이 아니라 아래 표 전체의 스코프를 알려 주는 머리말이다.
 * QA 화면의 레일과 같은 클래스를 쓴다.
 */
export function TotalsRail({ stats }: { stats: LlmUsageStats }) {
  const { t, locale } = useI18n()
  const strings = t.adminUsage.rail
  const format = adminFormat(locale)
  const total = stats.total
  const tokens = totalTokens(total)
  const partial = isPartiallyPriced(total)

  return (
    <div className="rail">
      <div className="rail__item">
        <span className="rail__label">{strings.totalTokens}</span>
        <span className="rail__value" title={format.count(tokens)}>
          {format.tokens(tokens)}
        </span>
        <span className="rail__hint">
          {strings.tokensHint(format.tokens(total.inputTokens), format.tokens(total.outputTokens))}
        </span>
      </div>

      <div className="rail__item">
        <span className="rail__label">{strings.totalCost}</span>
        <span className="rail__value">{format.cost(total.costUsd)}</span>
        {/* 단가 미상 호출이 섞이면 이 금액은 하한이다. 안 적으면 절반이 미상인 합계가 전체
            지출로 읽힌다. */}
        <span className="rail__hint">
          {total.costUsd === null
            ? strings.noPricedCalls
            : partial
              ? strings.partialCost(format.count(total.pricedCalls), format.count(total.calls))
              : strings.fullyPriced(format.count(total.calls))}
        </span>
      </div>

      <div className="rail__item">
        <span className="rail__label">
          {strings.cachedInput}
          <InfoHint>{strings.cachedHint}</InfoHint>
        </span>
        <span className="rail__value" title={format.count(total.cachedInputTokens)}>
          {format.tokens(total.cachedInputTokens)}
        </span>
      </div>

      <div className="rail__item">
        <span className="rail__label">
          {strings.reasoning}
          <InfoHint>{strings.reasoningHint}</InfoHint>
        </span>
        <span className="rail__value" title={format.count(total.reasoningTokens)}>
          {format.tokens(total.reasoningTokens)}
        </span>
      </div>

      <div className="rail__item">
        <span className="rail__label">{strings.calls}</span>
        <span className="rail__value">{format.count(total.calls)}</span>
        <span className="rail__hint">
          {total.calls === 0
            ? strings.noCallsHint
            : strings.perCallHint(format.tokens(Math.round(tokens / total.calls)))}
        </span>
      </div>

      <div className="rail__item">
        <span className="rail__label">{strings.unattributed}</span>
        <span className="rail__value">{format.count(stats.unattributedCalls)}</span>
        {/* 위 어느 합계에도 안 들어간 호출이다. 알리지 않으면 "전체"가 조용히 실제보다 작아진다. */}
        <span className="rail__hint">
          {stats.unattributedCalls === 0 ? strings.allAttributed : strings.someUnattributed}
        </span>
      </div>
    </div>
  )
}
