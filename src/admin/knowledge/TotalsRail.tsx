import { useI18n } from '../../i18n/useI18n'
import { adminFormat, EMPTY_MARK } from '../shared/format'
import { citationCoverage, citationRate, repudiationRate } from './pivot'
import type { KnowledgeStatsTotals } from './knowledgeStatsTypes'

/**
 * 기간 전체 합계.
 *
 * qaStats와 같은 한 줄 레일이다 — DESIGN.md가 반복되는 둥근 카드와 일반적인 KPI 타일을 금지하고,
 * 이 숫자들은 서로 비교되는 값이 아니라 아래 표 전체의 스코프를 알려 주는 머리말이다.
 */
export function KnowledgeTotalsRail({ total }: { total: KnowledgeStatsTotals }) {
  const { t, locale } = useI18n()
  const strings = t.adminKnowledge
  const format = adminFormat(locale)
  const cited = citationRate(total)
  const coverage = citationCoverage(total)
  const repudiated = repudiationRate(total)

  return (
    <div className="rail">
      <div className="rail__item">
        <span className="rail__label">{strings.createdVersions}</span>
        <span className="rail__value">{format.count(total.entryVersions)}</span>
        {/* 항목 수가 아니다. 한 항목을 두 번 고치면 세 버전이다. */}
        <span className="rail__hint">{strings.versionsNotEntries}</span>
      </div>

      <div className="rail__item">
        <span className="rail__label">{strings.currentVersions}</span>
        <span className="rail__value">{format.count(total.currentVersions)}</span>
        <span className="rail__hint">{strings.deletedVersions(format.count(total.deletedVersions))}</span>
      </div>

      <div className="rail__item">
        <span className="rail__label">{strings.deletedByLaterRuns}</span>
        <span className="rail__value">
          {repudiated === null ? EMPTY_MARK : format.rate(repudiated)}
        </span>
        {/* 이 화면에서 제일 오해받기 쉬운 숫자. 수리와 폐기가 아직 안 갈린다. */}
        <span className="rail__hint">
          {strings.deletedRateHint(format.count(total.repudiatedVersions))}
        </span>
      </div>

      <div className="rail__item">
        <span className="rail__label">{strings.retrievals}</span>
        <span className="rail__value">{format.count(total.retrievalTotal)}</span>
        <span className="rail__hint">{strings.retrievalHint}</span>
      </div>

      <div className="rail__item">
        <span className="rail__label">{strings.citationRate}</span>
        <span className="rail__value">{cited === null ? EMPTY_MARK : format.rate(cited)}</span>
        {/* 커버리지 없이는 인용률을 읽을 수 없다. 5% 커버리지의 100%는 스무 번 중 한 번이다. */}
        <span className="rail__hint">
          {coverage === null
            ? strings.noRetrievals
            : cited === null
              ? strings.noKnownCitations
              : strings.coverageHint(format.rate(coverage), format.count(total.citationKnownTotal))}
        </span>
      </div>
    </div>
  )
}
