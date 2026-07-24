import { useCallback, useEffect, useRef, useState } from 'react'
import { asRecord } from '../projects/projectApi'
import {
  compareDecimalIds,
  getQaTry,
  listQaLogs,
  parseQaLogEvent,
  qaEventsUrl,
} from './qaApi'
import {
  isTerminalQaStatus,
  QA_TRY_STATUSES,
  type QaLog,
  type QaStreamState,
  type QaTry,
  type QaTryStatus,
} from './qaTypes'

type LoadStatus = 'loading' | 'ready' | 'missing' | 'error'

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isAscending(logs: QaLog[]): boolean {
  for (let index = 1; index < logs.length; index += 1) {
    if (compareDecimalIds(logs[index - 1].id, logs[index].id) >= 0) return false
  }
  return true
}

function mergeLogs(current: QaLog[], incoming: QaLog[]): QaLog[] {
  if (incoming.length === 0) return current
  if (current.length === 0 || !isAscending(incoming)) return mergeSorted(current, incoming)

  // Hot paths: SSE appends a single newer log, history prepends an older page.
  // Both stay sorted with an O(n) concat and skip the full Map rebuild + re-sort.
  const first = current[0]
  const last = current[current.length - 1]
  if (compareDecimalIds(incoming[0].id, last.id) > 0) return current.concat(incoming)
  if (compareDecimalIds(incoming[incoming.length - 1].id, first.id) < 0) return incoming.concat(current)

  return mergeSorted(current, incoming)
}

function mergeSorted(current: QaLog[], incoming: QaLog[]): QaLog[] {
  const byId = new Map(current.map((log) => [log.id, log]))
  incoming.forEach((log) => byId.set(log.id, log))
  return [...byId.values()].sort((left, right) => compareDecimalIds(left.id, right.id))
}

function statusFromLog(log: QaLog): { status: QaTryStatus; completedAt: string | null } | null {
  if (log.type !== 'STATUS') return null
  const payload = asRecord(log.payload)
  const status = payload?.status
  if (
    typeof status !== 'string' ||
    !QA_TRY_STATUSES.some((candidate) => candidate === status)
  ) {
    return null
  }
  return {
    status: status as QaTryStatus,
    completedAt: typeof payload?.completedAt === 'string' ? payload.completedAt : null,
  }
}

export function useQaTry(qaTryId: string) {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [qaTry, setQaTry] = useState<QaTry | null>(null)
  const [logs, setLogs] = useState<QaLog[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextBeforeId, setNextBeforeId] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyFailure, setHistoryFailure] = useState<string | null>(null)
  const [streamState, setStreamState] = useState<QaStreamState>('closed')
  const [reloadToken, setReloadToken] = useState(0)
  const generationRef = useRef(0)
  const initialAfterIdRef = useRef<string | undefined>(undefined)
  const historyControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const generation = ++generationRef.current
    const controller = new AbortController()
    initialAfterIdRef.current = undefined

    Promise.all([getQaTry(qaTryId, controller.signal), listQaLogs(qaTryId, undefined, controller.signal)])
      .then(([loadedTry, page]) => {
        if (generationRef.current !== generation) return
        setQaTry(loadedTry)
        setLogs(page.items)
        setHasMore(page.hasMore)
        setNextBeforeId(page.nextBeforeId)
        initialAfterIdRef.current = page.items.at(-1)?.id
        setLoadStatus('ready')
      })
      .catch((error: unknown) => {
        if (isAbort(error) || generationRef.current !== generation) return
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? (error as { status?: unknown }).status
            : null
        setLoadStatus(status === 404 ? 'missing' : 'error')
      })

    return () => {
      controller.abort()
      historyControllerRef.current?.abort()
    }
  }, [qaTryId, reloadToken])

  const streamEligible =
    loadStatus === 'ready' &&
    qaTry !== null &&
    !isTerminalQaStatus(qaTry.status)

  useEffect(() => {
    if (!streamEligible) return undefined

    const generation = generationRef.current
    const source = new EventSource(qaEventsUrl(qaTryId, initialAfterIdRef.current), {
      withCredentials: true,
    })

    source.addEventListener('open', () => {
      if (generationRef.current === generation) setStreamState('live')
    })

    source.addEventListener('log', (event: Event) => {
      if (!(event instanceof MessageEvent) || generationRef.current !== generation) return
      const log = parseQaLogEvent(event.data)
      if (log === null || log.qaTryId !== qaTryId) return

      // Advance the resume cursor so a remount/eligibility retoggle reopens from the
      // newest seen log instead of replaying the whole session tail.
      const seen = initialAfterIdRef.current
      if (seen === undefined || compareDecimalIds(log.id, seen) > 0) {
        initialAfterIdRef.current = log.id
      }

      setLogs((current) => mergeLogs(current, [log]))
      const statusUpdate = statusFromLog(log)
      if (statusUpdate === null) return

      setQaTry((current) => {
        if (current === null || isTerminalQaStatus(current.status)) return current
        return { ...current, ...statusUpdate }
      })
    })

    source.addEventListener('error', () => {
      if (generationRef.current !== generation) return
      // readyState CLOSED = terminal (e.g. 404, or a 401 whose cookie expired mid-stream,
      // which never reaches apiFetch's unauthorizedHandler): the browser will not reconnect,
      // so surface an offline state instead of claiming perpetual reconnection.
      setStreamState(source.readyState === EventSource.CLOSED ? 'offline' : 'degraded')
    })

    return () => {
      source.close()
    }
  }, [qaTryId, streamEligible])

  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (historyLoading || !hasMore || nextBeforeId === null) return false
    const generation = generationRef.current
    const cursor = nextBeforeId
    historyControllerRef.current?.abort()
    const controller = new AbortController()
    historyControllerRef.current = controller
    setHistoryLoading(true)
    setHistoryFailure(null)

    try {
      const page = await listQaLogs(qaTryId, cursor, controller.signal)
      if (generationRef.current !== generation) return false
      setLogs((current) => mergeLogs(current, page.items))
      const cursorAdvanced = page.nextBeforeId !== cursor
      setHasMore(page.hasMore && cursorAdvanced)
      setNextBeforeId(cursorAdvanced ? page.nextBeforeId : null)
      return page.items.length > 0
    } catch (error: unknown) {
      if (!isAbort(error) && generationRef.current === generation) {
        setHistoryFailure('Older logs could not be loaded. Try again.')
      }
      return false
    } finally {
      if (historyControllerRef.current === controller) historyControllerRef.current = null
      if (generationRef.current === generation) setHistoryLoading(false)
    }
  }, [hasMore, historyLoading, nextBeforeId, qaTryId])

  return {
    hasMore,
    historyFailure,
    historyLoading,
    loadOlder,
    loadStatus,
    logs,
    qaTry,
    reload: () => {
      setLoadStatus('loading')
      setQaTry(null)
      setLogs([])
      setHistoryFailure(null)
      setStreamState('closed')
      setReloadToken((value) => value + 1)
    },
    streamState: streamEligible
      ? streamState === 'closed' ? 'connecting' : streamState
      : 'closed',
  }
}
