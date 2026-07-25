import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { compareDecimalIds } from './qaApi'
import type { QaLog } from './qaTypes'

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const TYPE_LABELS: Record<QaLog['type'], string> = {
  LOG: 'Log',
  ACTION: 'Action',
  ACTION_RESULT: 'Action result',
  GAME_STATE: 'Game state',
  STATUS: 'Status',
  ERROR: 'Error',
  CHAT: 'Chat',
}

const DIRECTION_LABELS: Record<QaLog['direction'], string> = {
  AGENT_TO_ORCHE: 'Agent → Orchestration',
  ORCHE_TO_AGENT: 'Orchestration → Agent',
  ORCHE_TO_SDK: 'Orchestration → SDK',
  SDK_TO_ORCHE: 'SDK → Orchestration',
  ORCHE_INTERNAL: 'Orchestration',
  USER_TO_ORCHE: 'You → Orchestration',
}

/**
 * One rendered row: a log, plus how many identical ones directly followed it.
 *
 * Repeats are collapsed rather than dropped — a game streaming its state emits
 * the same row many times a second, and left alone that pushes the events worth
 * reading off the screen. Only *consecutive* repeats fold, so the chronology is
 * unchanged; the newest of the run is what the row shows.
 */
type TimelineRow = {
  log: QaLog
  repeats: number
}

function isSameEvent(left: QaLog, right: QaLog): boolean {
  return (
    left.type === right.type &&
    left.direction === right.direction &&
    left.message === right.message &&
    // Payload equality is what separates a real repeat from a same-titled event
    // carrying new evidence. Cheap enough: only adjacent rows are compared.
    JSON.stringify(left.payload) === JSON.stringify(right.payload)
  )
}

function collapseRepeats(logs: QaLog[]): TimelineRow[] {
  const rows: TimelineRow[] = []
  for (const log of logs) {
    const previous = rows[rows.length - 1]
    if (previous !== undefined && isSameEvent(previous.log, log)) {
      // Keep the newest instance so its id and timestamp stay the row's identity.
      rows[rows.length - 1] = { log, repeats: previous.repeats + 1 }
      continue
    }
    rows.push({ log, repeats: 1 })
  }
  return rows
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : DATE_FORMAT.format(date)
}

function payloadText(payload: unknown): string {
  try {
    const serialized = JSON.stringify(payload, null, 2)
    if (serialized === undefined) return 'No payload'
    const limit = 12_000
    return serialized.length > limit
      ? `${serialized.slice(0, limit)}\n… Payload preview truncated`
      : serialized
  } catch {
    return 'Payload could not be displayed.'
  }
}

function QaLogRow({ log, repeats }: { log: QaLog; repeats: number }) {
  const hasPayload = log.payload !== null && log.payload !== undefined

  return (
    <li className={`qa-log-row qa-log-row--${log.type.toLowerCase()}`} data-log-id={log.id}>
      <div className="qa-log-marker" aria-hidden="true" />
      <article aria-labelledby={`qa-log-${log.id}-message`}>
        <header className="qa-log-meta">
          <span className="qa-log-kind">{TYPE_LABELS[log.type]}</span>
          {repeats > 1 && (
            /* Counted, not just styled: the number is the information. */
            <span className="qa-log-repeat">×{repeats}</span>
          )}
          <time dateTime={log.createdAt}>{formatTimestamp(log.createdAt)}</time>
          <span>{DIRECTION_LABELS[log.direction]}</span>
          <span className="mono" translate="no">#{log.id}</span>
        </header>
        <p className="qa-log-message" id={`qa-log-${log.id}-message`}>
          {log.message.length > 0 ? log.message : 'No message'}
        </p>
        {(log.messageId !== null || log.correlationId !== null) && (
          <p className="qa-log-identifiers">
            {log.messageId !== null && (
              <span translate="no">Message {log.messageId}</span>
            )}
            {log.correlationId !== null && (
              <span translate="no">Correlation {log.correlationId}</span>
            )}
          </p>
        )}
        {hasPayload && (
          <details className="qa-log-payload">
            <summary>Inspect payload</summary>
            <pre>{payloadText(log.payload)}</pre>
          </details>
        )}
      </article>
    </li>
  )
}

type AnchorSnapshot = {
  id: string
  top: number
}

export function QaLogTimeline({
  hasMore,
  historyFailure,
  historyLoading,
  live,
  loadOlder,
  logs,
}: {
  hasMore: boolean
  historyFailure: string | null
  historyLoading: boolean
  live: boolean
  loadOlder: () => Promise<boolean>
  logs: QaLog[]
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const initialScrollDoneRef = useRef(false)
  const intersectingRef = useRef(false)
  const anchorRef = useRef<AnchorSnapshot | null>(null)
  const previousNewestRef = useRef<string | null>(null)
  const [nearLiveEdge, setNearLiveEdge] = useState(true)
  const [unseenLogs, setUnseenLogs] = useState(0)
  const oldestId = logs[0]?.id
  const newestId = logs.at(-1)?.id ?? null
  const rows = useMemo(() => collapseRepeats(logs), [logs])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null || logs.length === 0) return

    if (!initialScrollDoneRef.current) {
      viewport.scrollTop = viewport.scrollHeight
      initialScrollDoneRef.current = true
      previousNewestRef.current = newestId
      return
    }

    const anchor = anchorRef.current
    if (anchor !== null) {
      const row = viewport.querySelector<HTMLElement>(`[data-log-id="${anchor.id}"]`)
      if (row !== null) viewport.scrollTop += row.getBoundingClientRect().top - anchor.top
      anchorRef.current = null
    }

    if (previousNewestRef.current !== newestId) {
      if (nearLiveEdge) {
        viewport.scrollTop = viewport.scrollHeight
      } else {
        // Count every log newer than the last-seen newest, not +1 per commit: several
        // logs can land in one render and the pill must not undercount them.
        const previousNewest = previousNewestRef.current
        const arrived =
          previousNewest === null
            ? logs.length
            : logs.reduce(
                (count, log) => (compareDecimalIds(log.id, previousNewest) > 0 ? count + 1 : count),
                0,
              )
        window.requestAnimationFrame(() => setUnseenLogs((count) => count + arrived))
      }
      previousNewestRef.current = newestId
    }
  }, [logs, nearLiveEdge, newestId])

  const requestOlder = useCallback(async () => {
    const viewport = viewportRef.current
    if (viewport === null || historyLoading || !hasMore || anchorRef.current !== null) return
    const firstRow = viewport.querySelector<HTMLElement>('[data-log-id]')
    if (firstRow === null) return

    anchorRef.current = {
      id: firstRow.dataset.logId ?? '',
      top: firstRow.getBoundingClientRect().top,
    }
    const changed = await loadOlder()
    if (!changed) anchorRef.current = null
  }, [hasMore, historyLoading, loadOlder])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (sentinel === null || !hasMore || historyLoading || historyFailure !== null) return undefined

    // Reset on re-subscribe: a stale `true` left from the previous observer would make
    // the new observer's first callback early-return, stalling auto-load when a freshly
    // loaded page is shorter than the viewport and the sentinel stays intersecting.
    intersectingRef.current = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          intersectingRef.current = false
          return
        }
        if (intersectingRef.current) return
        intersectingRef.current = true
        void requestOlder()
      },
      { root: viewportRef.current, rootMargin: '80px 0px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, historyFailure, historyLoading, requestOlder, oldestId])

  function updateLiveEdge() {
    const viewport = viewportRef.current
    if (viewport === null) return
    const atEdge = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 48
    setNearLiveEdge(atEdge)
    if (atEdge) setUnseenLogs(0)
  }

  function goToLiveEdge() {
    const viewport = viewportRef.current
    if (viewport === null) return
    viewport.scrollTop = viewport.scrollHeight
    setNearLiveEdge(true)
    setUnseenLogs(0)
  }

  if (logs.length === 0) {
    return (
      <div className="qa-log-empty">
        <p>No logs have been recorded for this QA Try.</p>
        {live && <span>New activity will appear here.</span>}
      </div>
    )
  }

  return (
    <div
      className="qa-log-viewport"
      onScroll={updateLiveEdge}
      ref={viewportRef}
      tabIndex={0}
      role="region"
      aria-label="QA Try activity log"
    >
      <div className="qa-log-history-controls">
        <div aria-hidden="true" ref={sentinelRef} />
        {historyLoading && <span role="status">Loading older logs…</span>}
        {historyFailure !== null && (
          <>
            <span role="alert">{historyFailure}</span>
            <button className="button button--secondary button--compact" onClick={requestOlder} type="button">
              Retry older logs
            </button>
          </>
        )}
        {!historyLoading && historyFailure === null && hasMore && (
          <button className="qa-load-older" onClick={requestOlder} type="button">
            Load older logs
          </button>
        )}
        {!hasMore && <span>Beginning of log</span>}
      </div>

      <ol className="qa-log-list">
        {rows.map((row) => (
          <QaLogRow key={row.log.id} log={row.log} repeats={row.repeats} />
        ))}
      </ol>

      {!nearLiveEdge && unseenLogs > 0 && (
        <button className="qa-new-logs" onClick={goToLiveEdge} type="button">
          {unseenLogs} new {unseenLogs === 1 ? 'log' : 'logs'}
        </button>
      )}
    </div>
  )
}
