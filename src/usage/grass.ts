/**
 * The contribution-graph grid: which day sits in which cell, and how dark it is.
 *
 * Kept apart from the component because both questions are arithmetic with
 * edges that are easy to get wrong — a week that straddles a month, a project
 * whose busiest day is fifty times its median — and neither is visible in a
 * rendered grid until it is already wrong.
 */

/** One day's spend. The fields the graph reads; the API carries more. */
export interface DayTotals {
  inputTokens: number
  outputTokens: number
  /** null is "no provider priced these calls", not "free". */
  costUsd: number | null
  calls: number
}

/** How dark a cell is drawn. 0 is "no call was recorded on this day". */
export type GrassLevel = 0 | 1 | 2 | 3 | 4

export interface GrassDay {
  /** `YYYY-MM-DD` in the viewer's own calendar, matching what the server bucketed. */
  date: string
  totals: DayTotals | null
  level: GrassLevel
  /**
   * False for the cells before the window starts. The grid always begins on a
   * Sunday, so up to six leading cells belong to no day in range — they hold
   * the shape of the week without claiming the project spent nothing then.
   */
  inRange: boolean
}

export interface GrassGrid {
  /** Column-major, like the graph reads: `weeks[column][weekday]`, Sunday first. */
  weeks: GrassDay[][]
  /** Upper bound of levels 1, 2 and 3 in tokens. The legend names these. */
  thresholds: [number, number, number]
  /** The busiest day in the window, in tokens. 0 when nothing was recorded. */
  max: number
}

export const WEEKS = 12
export const DAYS_PER_WEEK = 7

/** Tokens a day used. Cached input and reasoning are already inside these two. */
export function dayTokens(totals: DayTotals): number {
  return totals.inputTokens + totals.outputTokens
}

/** `YYYY-MM-DD` in the local calendar. Slicing an ISO string would cut in UTC. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  copy.setDate(copy.getDate() + days)
  return copy
}

/**
 * The window the graph covers: [start, end] inclusive, both local midnights.
 *
 * `end` is today, so the last column is the current week and the newest cell is
 * the rightmost one — the direction a reader already expects from GitHub.
 */
export function grassWindow(today: Date): { start: Date; end: Date } {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return { start: addDays(end, -(WEEKS * DAYS_PER_WEEK - 1)), end }
}

/**
 * Level boundaries from the days that actually had calls.
 *
 * **Quartiles of non-empty days, not fractions of the maximum.** One heavy day
 * is normal here — a long QA run costs more than a week of idle browsing — and
 * against the maximum every other day collapses into the lightest shade, which
 * is the same picture an empty project draws. Quartiles keep the ordinary days
 * spread across the scale.
 *
 * Fewer than four distinct values cannot fill four levels. Rather than invent
 * boundaries, the thresholds repeat, and [levelOf] gives every day the same
 * shade — honest for a project with two busy days and nothing else.
 */
export function levelThresholds(dayTotals: number[]): [number, number, number] {
  const used = dayTotals.filter((value) => value > 0).sort((a, b) => a - b)
  if (used.length === 0) return [0, 0, 0]
  // `ceil(p * n) - 1` — the value at or below which that fraction of active days
  // sits. `floor` would push each boundary one value too high and leave level 1
  // holding no day at all in a short series.
  const at = (fraction: number) =>
    used[Math.min(used.length - 1, Math.max(0, Math.ceil(fraction * used.length) - 1))]
  return [at(0.25), at(0.5), at(0.75)]
}

/**
 * Which shade a day gets. 0 tokens is level 0 — an empty cell, not a faint one.
 *
 * When every active day spent the same amount the boundaries collapse, and the
 * shade can carry no information at all. Those days get one clearly visible
 * middle shade rather than the faintest: at level 1 an active day is nearly
 * indistinguishable from an empty one, which is the opposite of what happened.
 */
export function levelOf(tokens: number, thresholds: [number, number, number]): GrassLevel {
  if (tokens <= 0) return 0
  if (thresholds[0] === thresholds[2]) return 3
  if (tokens <= thresholds[0]) return 1
  if (tokens <= thresholds[1]) return 2
  if (tokens <= thresholds[2]) return 3
  return 4
}

/**
 * The grid, one cell per day, padded to whole weeks.
 *
 * Days the server did not send become cells with `totals: null`. That is the
 * point of building the grid from dates rather than from the response: the API
 * omits days with no calls, and a graph drawn from what it sent would silently
 * shorten the calendar and put a quiet week next to a busy one.
 *
 * @param days what the server sent, keyed by `YYYY-MM-DD` in the same zone the
 *   request asked for. Days outside the window are ignored.
 */
export function buildGrass(days: { date: string; totals: DayTotals }[], today: Date): GrassGrid {
  const byDate = new Map(days.map((day) => [day.date, day.totals]))
  const { start, end } = grassWindow(today)

  // The column always begins on a Sunday, so the grid starts at the Sunday on or
  // before the window. The cells before `start` are padding, not empty days.
  const gridStart = addDays(start, -start.getDay())
  const cells: GrassDay[] = []
  const cellCount = Math.ceil((diffDays(gridStart, end) + 1) / DAYS_PER_WEEK) * DAYS_PER_WEEK

  for (let index = 0; index < cellCount; index += 1) {
    const date = addDays(gridStart, index)
    const key = toDateKey(date)
    const inRange = date >= start && date <= end
    cells.push({
      date: key,
      totals: inRange ? (byDate.get(key) ?? null) : null,
      level: 0,
      inRange,
    })
  }

  const thresholds = levelThresholds(
    cells.filter((c) => c.inRange && c.totals !== null).map((c) => dayTokens(c.totals!)),
  )
  const graded = cells.map((cell) => ({
    ...cell,
    level: cell.totals === null ? 0 : levelOf(dayTokens(cell.totals), thresholds),
  }))

  const weeks: GrassDay[][] = []
  for (let index = 0; index < graded.length; index += DAYS_PER_WEEK) {
    weeks.push(graded.slice(index, index + DAYS_PER_WEEK))
  }

  const max = graded.reduce(
    (best, cell) => (cell.totals === null ? best : Math.max(best, dayTokens(cell.totals))),
    0,
  )
  return { weeks, thresholds, max }
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * One day's totals out of the grid, or null when that day has no cell.
 *
 * Used for "today" and "yesterday", which the summary states as their own
 * numbers. Reading them off the grid rather than the raw response keeps the
 * three figures on one calendar — otherwise a viewer whose clock has crossed
 * midnight sees a "today" the grid does not show.
 */
export function dayAt(grid: GrassGrid, date: Date): DayTotals | null {
  const key = toDateKey(date)
  for (const week of grid.weeks) {
    for (const cell of week) {
      if (cell.date === key) return cell.totals
    }
  }
  return null
}
