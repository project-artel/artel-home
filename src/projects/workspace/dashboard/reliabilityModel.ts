import type { Reliability } from '../../../qa/evaluation/evaluationApi'
import { reliabilityDate, reliabilityRange } from '../../../qa/evaluation/reliabilityRange'

export function dashboardReliabilityRange(days: number, now: number) {
  const from = reliabilityDate(1 - days, now)
  const to = reliabilityDate(0, now)
  return { ...reliabilityRange(from, to), firstDay: from, lastDay: to }
}

export function reliabilityDays(daily: Reliability['daily'], first: string, last: string) {
  const byDay = new Map(daily.map(row => [row.key, row.counts]))
  const rows = []
  for (let time = Date.parse(`${first}T00:00:00Z`); time <= Date.parse(`${last}T00:00:00Z`); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10)
    const counts = byDay.get(date)
    rows.push({ date, reviewed: counts?.reviewed ?? 0, total: counts?.total ?? 0,
      fp: counts?.falsePositiveRate ?? null, fn: counts?.falseNegativeRate ?? null,
      fpCount: counts?.falsePositives ?? 0, fpSample: (counts?.falsePositives ?? 0) + (counts?.trueNegatives ?? 0),
      fnCount: counts?.falseNegatives ?? 0, fnSample: (counts?.falseNegatives ?? 0) + (counts?.truePositives ?? 0) })
  }
  return rows
}

export function rateLines(values: readonly (number | null)[]) {
  const lines: { index: number; value: number }[][] = []
  let line: { index: number; value: number }[] = []
  values.forEach((value, index) => {
    if (value === null) { if (line.length) lines.push(line); line = [] }
    else line.push({ index, value })
  })
  if (line.length) lines.push(line)
  return lines
}

export const reliabilityPercent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`
