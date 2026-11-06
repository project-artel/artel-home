import { compareDecimalIds, listQaLogs } from './qaApi'
import type { QaLog } from './qaTypes'

export function logsAround(logs: QaLog[], timestamp: number, limit = 80): QaLog[] {
  const next = logs.findIndex(log => Date.parse(log.createdAt) >= timestamp)
  const center = next === -1 ? logs.length - 1 : next
  const start = Math.max(0, Math.min(logs.length - limit, center - Math.floor(limit / 2)))
  return logs.slice(start, start + limit)
}

export async function loadReplayLogContext(qaTryId: string, timestamp: number, verdicts: QaLog[], signal: AbortSignal): Promise<QaLog[]> {
  const next = verdicts.filter(log => Date.parse(log.createdAt) >= timestamp)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0]
  let cursor = next?.id
  const collected = new Map<string, QaLog>(next ? [[next.id, next]] : [])
  while (!signal.aborted) {
    const page = await listQaLogs(qaTryId, cursor, signal)
    for (const log of page.items) collected.set(log.id, log)
    const reached = page.items.some(log => Date.parse(log.createdAt) <= timestamp)
    if (reached || !page.hasMore || !page.nextBeforeId || page.nextBeforeId === cursor) break
    cursor = page.nextBeforeId
  }
  return [...collected.values()].sort((left, right) => compareDecimalIds(left.id, right.id))
}
