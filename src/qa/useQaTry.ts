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

function mergeLogs(current: QaLog[], incoming: QaLog[]): QaLog[] {
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

    return () => controller.abort()
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

      setLogs((current) => mergeLogs(current, [log]))
      const statusUpdate = statusFromLog(log)
      if (statusUpdate === null) return

      setQaTry((current) => {
        if (current === null || isTerminalQaStatus(current.status)) return current
        return { ...current, ...statusUpdate }
      })
    })

    source.addEventListener('error', () => {
      if (generationRef.current === generation) setStreamState('degraded')
    })

    return () => {
      source.close()
    }
  }, [qaTryId, streamEligible])

  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (historyLoading || !hasMore || nextBeforeId === null) return false
    const generation = generationRef.current
    const cursor = nextBeforeId
    setHistoryLoading(true)
    setHistoryFailure(null)

    try {
      const page = await listQaLogs(qaTryId, cursor)
      if (generationRef.current !== generation) return false
      setLogs((current) => mergeLogs(current, page.items))
      const cursorAdvanced = page.nextBeforeId !== cursor
      setHasMore(page.hasMore && cursorAdvanced)
      setNextBeforeId(cursorAdvanced ? page.nextBeforeId : null)
      return page.items.length > 0
    } catch {
      if (generationRef.current === generation) {
        setHistoryFailure('Older logs could not be loaded. Try again.')
      }
      return false
    } finally {
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
