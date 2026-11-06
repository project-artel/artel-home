import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import type { UsageTotals } from './llmUsageTypes'
import { fillDays, totalTokens } from './usage'

/**
 * 일별 토큰 추이.
 *
 * 라이브러리를 들이지 않는다 — 필요한 것은 높이가 값에 비례하는 막대 한 줄이고, 그것을 위해
 * 차트 라이브러리를 넣으면 이 화면 하나 때문에 번들이 몇 배가 된다.
 *
 * **호출이 없던 날도 자리를 차지한다.** 서버는 그런 날에 줄을 안 주므로 [fillDays]로 채운다.
 * 안 채우면 지출이 없던 주가 통째로 사라지고, 막대 사이 간격이 시간 간격과 어긋나 추이가 실제보다
 * 고르게 보인다.
 *
 * 막대만으로는 값을 읽을 수 없으므로 각 막대에 `title`과 스크린 리더용 텍스트를 함께 둔다
 * (DESIGN.md — 색과 길이만으로 뜻을 말하지 않는다).
 */
export function DailyTrend({
  days,
  from,
  to,
  zone,
}: {
  days: { date: string; totals: UsageTotals }[]
  from: Date
  to: Date
  /** 하루 경계를 자른 시간대. 이것을 안 적으면 자정 근처 지출이 어느 날인지 알 수 없다. */
  zone: string
}) {
  const { t, locale } = useI18n()
  const strings = t.adminUsage.trend
  const format = adminFormat(locale)
  const filled = fillDays(days, from, to)
  const peak = Math.max(0, ...filled.map((day) => (day.totals ? totalTokens(day.totals) : 0)))

  return (
    <section aria-labelledby="usage-daily">
      <div className="section__head">
        <h3 className="panel__title" id="usage-daily">
          {strings.title}
        </h3>
        <span className="section__note">{strings.note(zone, format.tokens(peak))}</span>
      </div>

      {peak === 0 ? (
        <p className="muted">{strings.empty}</p>
      ) : (
        <ol className="trend">
          {filled.map((day) => {
            const tokens = day.totals ? totalTokens(day.totals) : 0
            const label = day.totals
              ? strings.dayLabel(
                  day.date,
                  format.count(tokens),
                  format.cost(day.totals.costUsd),
                  format.count(day.totals.calls),
                )
              : strings.noCallDay(day.date)

            return (
              <li className="trend__day" key={day.date} title={label}>
                <span className="trend__bar" aria-hidden="true">
                  {/* 0인 날도 바닥선 1px을 남긴다. 아무것도 안 그리면 "호출이 없었다"와
                      "그 날이 표에 없다"가 같은 빈칸이 된다. */}
                  <span
                    className={tokens === 0 ? 'trend__fill trend__fill--empty' : 'trend__fill'}
                    style={{ height: tokens === 0 ? '1px' : `${(tokens / peak) * 100}%` }}
                  />
                </span>
                <span className="visually-hidden">{label}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
