import { useI18n } from '../i18n/useI18n'
import { dayTokens, type GrassDay, type GrassGrid } from './grass'

const counts = new Intl.NumberFormat()

/** Weekday rows that carry a printed label. Three is enough to read the axis. */
const LABELLED_ROWS = [1, 3, 5]

function formatCost(value: number | null, unknown: string): string {
  if (value === null) return unknown
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`
}

/**
 * Twelve weeks of daily spend, one cell per day.
 *
 * **The shade is a relative scale, not an absolute one.** Its boundaries are
 * quartiles of the days that had calls in this window, so the same colour means
 * different amounts in two projects — and in the same project a month later.
 * The heading says so, and every cell carries its own number, because a colour
 * that cannot be compared across screens must not be the only thing that speaks
 * (DESIGN.md).
 *
 * Weeks run left to right and the newest column is last, matching the graph
 * every reader already knows.
 */
export function UsageGrass({ grid, zone }: { grid: GrassGrid; zone: string }) {
  const { t } = useI18n()
  const u = t.usage

  return (
    <div className="grass">
      <div className="grass-plot">
        <ol className="grass-weekdays" aria-hidden="true">
          {Array.from({ length: 7 }, (_, row) => (
            <li className="grass-weekday" key={row}>
              {LABELLED_ROWS.includes(row) ? u.weekdays[row] : ''}
            </li>
          ))}
        </ol>

        {/* A table, not a pile of divs: the graph is a calendar, and a screen
            reader that walks it row by row is walking weekdays down and weeks
            across, which is what the picture means. */}
        <table className="grass-grid">
          <caption className="visually-hidden">{u.grassCaption(zone)}</caption>
          <tbody>
            {Array.from({ length: 7 }, (_, row) => (
              <tr key={row}>
                {grid.weeks.map((week, column) => (
                  <Cell day={week[row]} key={`${column}-${row}`} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grass-legend">
        <span className="grass-legend-note">{u.scaleNote}</span>
        <span className="grass-legend-scale">
          <span>{u.less}</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span className={`grass-cell grass-cell--${level}`} key={level} aria-hidden="true" />
          ))}
          <span>{u.more}</span>
        </span>
      </div>
    </div>
  )
}

/**
 * One day.
 *
 * A cell outside the window keeps the week's shape but says nothing — it is not
 * a day the project spent nothing on, and marking it as one would add four
 * false quiet days to the start of every graph.
 */
function Cell({ day }: { day: GrassDay }) {
  const { t } = useI18n()
  const u = t.usage

  if (!day.inRange) {
    return <td className="grass-cell grass-cell--void" aria-hidden="true" />
  }

  const label =
    day.totals === null
      ? u.cellEmpty(day.date)
      : u.cellSpend(
          day.date,
          counts.format(dayTokens(day.totals)),
          formatCost(day.totals.costUsd, u.costUnknown),
          counts.format(day.totals.calls),
        )

  return (
    <td className={`grass-cell grass-cell--${day.level}`} title={label}>
      <span className="visually-hidden">{label}</span>
    </td>
  )
}
