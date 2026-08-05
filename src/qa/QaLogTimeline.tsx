import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { compareDecimalIds } from './qaApi'
import { stepOf } from './qaProgress'
import type { QaLog } from './qaTypes'

/**
 * A request to bring one log into view.
 *
 * `token` is what makes a repeat of the same target a new request: selecting the
 * same step twice must scroll back to it, and an unchanged `logId` alone would
 * look like nothing happened.
 */
export type QaLogFocusRequest = {
  logId: string
  token: number
}

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

/** Endpoints of each direction, so a relayed event can be shown as one path. */
const DIRECTION_NODES: Record<QaLog['direction'], [string, string]> = {
  AGENT_TO_ORCHE: ['Agent', 'Orchestration'],
  ORCHE_TO_AGENT: ['Orchestration', 'Agent'],
  ORCHE_TO_SDK: ['Orchestration', 'SDK'],
  SDK_TO_ORCHE: ['SDK', 'Orchestration'],
  ORCHE_INTERNAL: ['Orchestration', 'Orchestration'],
  USER_TO_ORCHE: ['You', 'Orchestration'],
}

/**
 * One event and every relay hop of it, oldest first.
 *
 * A message crossing SDK → Orchestration → Agent is written once per hop, which
 * reads as three events when it is one.
 */
type TimelineEvent = QaLog[]

/**
 * One rendered row: a run of consecutive events shown as their newest, the path
 * they travelled, and — once expanded — every event still available in full.
 *
 * Two things are folded, both only when *consecutive*, so the chronology never
 * changes:
 *
 * 1. Streamed state. A running game emits GAME_STATE about once a second; each
 *    frame differs slightly, so nothing that compares payloads would ever fold
 *    them. Only the newest is worth reading by default.
 * 2. Exact repeats of anything else.
 *
 * Nothing is discarded: `events` keeps every folded log so the reader can open
 * the run and read the frames one by one.
 */
type TimelineRow = {
  events: TimelineEvent[]
  path: QaLog['direction'][]
}

/** The log a collapsed row speaks for: the last hop of its newest event. */
function newestOf(row: TimelineRow): QaLog {
  const event = row.events[row.events.length - 1]
  return event[event.length - 1]
}

/**
 * The id a row is remembered by while it is expanded.
 *
 * Its *oldest* log, not its newest: a live run keeps folding new frames into the
 * tail row, and an identity that moved with them would drop the reader's
 * expansion on the next frame.
 */
function anchorOf(row: TimelineRow): string {
  return row.events[0][0].id
}

/** Breathing room above a row scrolled to, so it does not sit flush at the edge. */
const FOCUS_MARGIN = 16

/** Types whose consecutive rows are folded even when their payloads differ. */
const STREAMED_TYPES = new Set<QaLog['type']>(['GAME_STATE'])

function isSameEvent(left: QaLog, right: QaLog): boolean {
  return (
    left.direction === right.direction &&
    left.message === right.message &&
    // Payload equality is what separates a real repeat from a same-titled event
    // carrying new evidence. Cheap enough: only adjacent rows are compared.
    JSON.stringify(left.payload) === JSON.stringify(right.payload)
  )
}

/**
 * Whether `right` is `left` arriving at its next hop.
 *
 * Relays either carry the id forward (GAME_STATE, ACTION_RESULT) or reference it
 * as the correlation of a newly allocated one (an ACTION becoming an SDK call).
 * Ids must be present to link: two rows that both lack one are not evidence of
 * anything, so those fall back to comparing content.
 */
function isNextHop(left: QaLog, right: QaLog): boolean {
  if (left.direction === right.direction) return false
  const linked =
    (left.messageId !== null && left.messageId === right.messageId) ||
    (left.messageId !== null && left.messageId === right.correlationId) ||
    (right.messageId !== null && right.messageId === left.correlationId)
  if (linked) return true
  // Relay copies written without ids (an operator message on its way to the
  // Agent) carry the same text and payload instead.
  return (
    left.messageId === null &&
    right.messageId === null &&
    left.message === right.message &&
    JSON.stringify(left.payload) === JSON.stringify(right.payload)
  )
}

/**
 * Add a hop to a row's path, ignoring one already on it.
 *
 * A folded stream travels the same route on every frame, so appending blindly
 * would render "SDK → Orchestration → Agent → Orchestration → Agent → …".
 */
function withHop(path: QaLog['direction'][], direction: QaLog['direction']): QaLog['direction'][] {
  return path.includes(direction) ? path : [...path, direction]
}

function collapseRepeats(logs: QaLog[]): TimelineRow[] {
  const rows: TimelineRow[] = []

  for (const log of logs) {
    const previous = rows[rows.length - 1]
    if (previous === undefined || newestOf(previous).type !== log.type) {
      rows.push({ events: [[log]], path: [log.direction] })
      continue
    }

    const latest = newestOf(previous)
    if (isNextHop(latest, log)) {
      // Same event, one hop later: it joins that event rather than becoming one.
      previous.events[previous.events.length - 1].push(log)
      previous.path = withHop(previous.path, log.direction)
      continue
    }

    // Streamed frames fold whichever hop they were caught on: the same frame is
    // logged on arrival and again on relay, so consecutive frames alternate
    // direction and a same-direction test would fold nothing at all.
    if (STREAMED_TYPES.has(log.type) || isSameEvent(latest, log)) {
      previous.events.push([log])
      previous.path = withHop(previous.path, log.direction)
      continue
    }

    rows.push({ events: [[log]], path: [log.direction] })
  }

  return rows
}

/**
 * Where a log that is not rendered on its own can be found: the row to expand,
 * and the element that appears once it is.
 *
 * Only rows with something to expand are mapped. A relay hop folded into a
 * single-event row stays unreachable, as it was before: the row it belongs to is
 * the same event, and scrolling to that row is what a jump to it means.
 */
function foldedTargets(rows: TimelineRow[]): Map<string, { anchor: string; target: string }> {
  const targets = new Map<string, { anchor: string; target: string }>()
  for (const row of rows) {
    if (row.events.length < 2) continue
    const anchor = anchorOf(row)
    for (const event of row.events) {
      for (const hop of event) targets.set(hop.id, { anchor, target: event[0].id })
    }
  }
  return targets
}

/** "SDK → Orchestration → Agent" from the hops actually seen. */
function formatPath(path: QaLog['direction'][]): string {
  const nodes: string[] = []
  for (const direction of path) {
    const [from, to] = DIRECTION_NODES[direction]
    if (nodes.length === 0) nodes.push(from)
    if (nodes[nodes.length - 1] !== to) nodes.push(to)
  }
  return nodes.join(' → ')
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

/** One folded event, read on its own once the reader opens the run. */
function QaFoldedEvent({
  event,
  focused,
  headline,
}: {
  event: TimelineEvent
  focused: boolean
  headline: string
}) {
  const first = event[0]
  const newest = event[event.length - 1]
  const hasPayload = newest.payload !== null && newest.payload !== undefined

  return (
    <li
      className={`qa-log-folded-event${focused ? ' qa-log-folded-event--focused' : ''}`}
      data-log-id={first.id}
      tabIndex={-1}
    >
      <div className="qa-log-meta">
        <time dateTime={newest.createdAt}>{formatTimestamp(newest.createdAt)}</time>
        <span>{formatPath(event.map((hop) => hop.direction))}</span>
        <span className="mono" translate="no">#{first.id}</span>
      </div>
      {/* The row already states the message the whole run shares; only a frame
          that says something else needs to repeat it. */}
      {newest.message.length > 0 && newest.message !== headline && (
        <p className="qa-log-message">{newest.message}</p>
      )}
      {hasPayload && (
        <details className="qa-log-payload">
          <summary>Inspect payload</summary>
          <pre>{payloadText(newest.payload)}</pre>
        </details>
      )}
    </li>
  )
}

function QaLogRow({
  expanded,
  focusedLogId,
  onToggle,
  row,
}: {
  expanded: boolean
  focusedLogId: string | null
  onToggle: () => void
  row: TimelineRow
}) {
  const { t } = useI18n()
  const log = newestOf(row)
  const repeats = row.events.length
  const hasPayload = log.payload !== null && log.payload !== undefined
  const step = stepOf(log)
  const message = log.message.length > 0 ? log.message : 'No message'
  const focused = log.id === focusedLogId

  return (
    <li
      className={`qa-log-row qa-log-row--${log.type.toLowerCase()}${focused ? ' qa-log-row--focused' : ''}`}
      data-log-id={log.id}
      // Focusable only as a jump destination: making every row a tab stop would
      // put hundreds of them between the reader and the controls below.
      tabIndex={-1}
    >
      <div className="qa-log-marker" aria-hidden="true" />
      <article aria-labelledby={`qa-log-${log.id}-message`}>
        <header className="qa-log-meta">
          <span className="qa-log-kind">{TYPE_LABELS[log.type]}</span>
          {step !== null && <span className="qa-log-step">{t.qa.steps.short(step)}</span>}
          {repeats > 1 && (
            /* Counted, not just styled: the number is the information. */
            <span className="qa-log-repeat">×{repeats}</span>
          )}
          <time dateTime={log.createdAt}>{formatTimestamp(log.createdAt)}</time>
          <span>{formatPath(row.path)}</span>
          <span className="mono" translate="no">#{log.id}</span>
        </header>
        <p className="qa-log-message" id={`qa-log-${log.id}-message`}>
          {message}
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
        {repeats > 1 && (
          <>
            <button
              aria-expanded={expanded}
              className="qa-log-expand"
              onClick={onToggle}
              type="button"
            >
              {expanded ? `Collapse ${repeats} events` : `Show all ${repeats} events`}
            </button>
            {expanded && (
              <ol className="qa-log-folded">
                {row.events.map((event) => (
                  <QaFoldedEvent
                    event={event}
                    focused={event[0].id === focusedLogId}
                    headline={message}
                    key={event[0].id}
                  />
                ))}
              </ol>
            )}
          </>
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
  focusRequest,
  hasMore,
  historyFailure,
  historyLoading,
  live,
  loadOlder,
  logs,
  onFocusResolved,
}: {
  focusRequest: QaLogFocusRequest | null
  hasMore: boolean
  historyFailure: string | null
  historyLoading: boolean
  live: boolean
  loadOlder: () => Promise<boolean>
  logs: QaLog[]
  onFocusResolved: () => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const initialScrollDoneRef = useRef(false)
  const intersectingRef = useRef(false)
  const anchorRef = useRef<AnchorSnapshot | null>(null)
  const previousNewestRef = useRef<string | null>(null)
  const [nearLiveEdge, setNearLiveEdge] = useState(true)
  const [unseenLogs, setUnseenLogs] = useState(0)
  const [focusedLogId, setFocusedLogId] = useState<string | null>(null)
  // Rows the reader opened, by anchor id. A set rather than one open row: opening
  // a run to compare frames should not close the one compared against.
  const [expandedRows, setExpandedRows] = useState<ReadonlySet<string>>(() => new Set())
  const oldestId = logs[0]?.id
  const newestId = logs.at(-1)?.id ?? null
  const rows = useMemo(() => collapseRepeats(logs), [logs])
  const foldTargets = useMemo(() => foldedTargets(rows), [rows])

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

  const expandRow = useCallback((anchor: string) => {
    setExpandedRows((open) => (open.has(anchor) ? open : new Set(open).add(anchor)))
  }, [])

  useEffect(() => {
    if (focusRequest === null) return
    const viewport = viewportRef.current
    if (viewport === null) return

    function focusOn(root: HTMLElement, element: HTMLElement, logId: string) {
      root.scrollTop +=
        element.getBoundingClientRect().top - root.getBoundingClientRect().top - FOCUS_MARGIN
      // Leaving the tail has to stop the auto-follow, or the next log arriving
      // pulls the reader straight back off the row they asked for.
      setNearLiveEdge(false)
      setUnseenLogs(0)
      setFocusedLogId(logId)
      element.focus({ preventScroll: true })
      onFocusResolved()
    }

    const row = viewport.querySelector<HTMLElement>(`[data-log-id="${focusRequest.logId}"]`)
    if (row !== null) {
      focusOn(viewport, row, focusRequest.logId)
      return
    }

    // Older than anything loaded: pull one page and let the next render retry.
    // The walk only ever goes backwards and stops at `hasMore`, so it ends.
    const older = oldestId !== undefined && compareDecimalIds(focusRequest.logId, oldestId) < 0
    if (older && hasMore && !historyLoading && historyFailure === null) {
      void requestOlder()
      return
    }

    // Folded into a collapsed run: open it, and let the next render scroll to the
    // event now that it has an element of its own.
    const folded = foldTargets.get(focusRequest.logId)
    if (folded !== undefined) {
      if (!expandedRows.has(folded.anchor)) {
        // Deferred a frame for the same reason the unseen counter is: opening the
        // run is a render this effect asks for, not one it should cascade into.
        window.requestAnimationFrame(() => expandRow(folded.anchor))
        return
      }
      const event = viewport.querySelector<HTMLElement>(`[data-log-id="${folded.target}"]`)
      if (event !== null) {
        focusOn(viewport, event, folded.target)
        return
      }
    }

    // Nothing left to reveal, and retrying would loop, so drop the request.
    onFocusResolved()
  }, [
    expandRow,
    expandedRows,
    focusRequest,
    foldTargets,
    hasMore,
    historyFailure,
    historyLoading,
    logs,
    oldestId,
    onFocusResolved,
    requestOlder,
  ])

  const toggleRow = useCallback((anchor: string) => {
    setExpandedRows((open) => {
      const next = new Set(open)
      if (!next.delete(anchor)) next.add(anchor)
      return next
    })
  }, [])

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
        {rows.map((row) => {
          const anchor = anchorOf(row)
          return (
            <QaLogRow
              expanded={expandedRows.has(anchor)}
              focusedLogId={focusedLogId}
              key={newestOf(row).id}
              onToggle={() => toggleRow(anchor)}
              row={row}
            />
          )
        })}
      </ol>

      {!nearLiveEdge && unseenLogs > 0 && (
        <button className="qa-new-logs" onClick={goToLiveEdge} type="button">
          {unseenLogs} new {unseenLogs === 1 ? 'log' : 'logs'}
        </button>
      )}
    </div>
  )
}
