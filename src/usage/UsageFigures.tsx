import { useI18n } from '../i18n/useI18n'
import { formatCost, totalTokens } from './format'
import { dayAt, dayTokens, type GrassGrid, type DayTotals } from './grass'
import type { UsageTotals } from './usageApi'

const counts = new Intl.NumberFormat()

function yesterdayOf(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
}

/**
 * The window total, and the two days a reader checks first.
 *
 * Today and yesterday are read off the grid rather than the raw response so all
 * three figures sit on one calendar — the grid already resolved which local day
 * each bucket belongs to.
 */
export function UsageFigures({
  grid,
  today,
  total,
}: {
  grid: GrassGrid
  today: Date
  total: UsageTotals
}) {
  const { t } = useI18n()
  const u = t.usage
  const partial = total.pricedCalls < total.calls

  return (
    <dl className="usage-figures">
      <div className="usage-figure">
        <dt>{u.windowTotal}</dt>
        <dd className="mono">{counts.format(totalTokens(total))}</dd>
        <p className="usage-figure-hint">
          {total.costUsd === null
            ? u.noPricedCall
            : partial
              ? u.partialPrice(formatCost(total.costUsd, u.costUnknown), total.pricedCalls, total.calls)
              : u.fullyPriced(formatCost(total.costUsd, u.costUnknown), total.calls)}
        </p>
      </div>

      <DayFigure label={u.today} totals={dayAt(grid, today)} />
      <DayFigure label={u.yesterday} totals={dayAt(grid, yesterdayOf(today))} />

      <div className="usage-figure">
        <dt>{u.busiestDay}</dt>
        <dd className="mono">{grid.max === 0 ? u.dash : counts.format(grid.max)}</dd>
        {/* 이 값이 잔디 눈금의 위쪽 끝이다. 짙은 칸이 얼마쯤인지 숫자로 한 번은 나와야 한다. */}
        <p className="usage-figure-hint">{u.busiestHint}</p>
      </div>
    </dl>
  )
}

/**
 * One day.
 *
 * No record is a sentence, not a zero. The agent batches usage and drops a
 * failed batch, so an empty day is "nothing has arrived" as often as it is
 * "nothing ran" — and `0` would state the second.
 */
function DayFigure({ label, totals }: { label: string; totals: DayTotals | null }) {
  const { t } = useI18n()
  const u = t.usage

  return (
    <div className="usage-figure">
      <dt>{label}</dt>
      <dd className="mono">{totals === null ? u.dash : counts.format(dayTokens(totals))}</dd>
      <p className="usage-figure-hint">
        {totals === null
          ? u.noRecord
          : u.dayHint(formatCost(totals.costUsd, u.costUnknown), counts.format(totals.calls))}
      </p>
    </div>
  )
}
