import type { QaLog, QaLogDirection, QaLogType } from './qaTypes'

export type QaLogFilter = {
  includePulse: boolean
  type: QaLogType | ''
  direction: QaLogDirection | ''
  text: string
}

export const DEFAULT_QA_LOG_FILTER: QaLogFilter = {
  includePulse: false, type: '', direction: '', text: '',
}

export function qaLogContains(log: QaLog, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return true
  return [log.id, log.message, log.type, log.direction, log.messageId, log.correlationId,
    JSON.stringify(log.payload)].some((value) => value?.toLocaleLowerCase().includes(needle))
}

export function filterQaLogs(logs: QaLog[], filter: QaLogFilter): QaLog[] {
  return logs.filter((log) =>
    (filter.includePulse || log.type !== 'PULSE') &&
    (filter.type === '' || log.type === filter.type) &&
    (filter.direction === '' || log.direction === filter.direction) &&
    qaLogContains(log, filter.text),
  )
}
