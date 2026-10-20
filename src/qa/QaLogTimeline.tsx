import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { groupStepsByCase, type ScenarioStep } from '../testScenarios/scenarioTypes'
import { compareDecimalIds } from './qaApi'
import { behaviorEndedOf, cheatNamesOf, usedCheatsOf } from './qaFunctionTimeline'
import {
  anchorOf,
  buildTimelineRows,
  eventIdOf,
  formatPath,
  formatToolResult,
  hiddenLogTargets,
  newestOf,
  outcomeHeadOf,
  toolCallOf,
  verdictOf,
  toolOutputOf,
  toolResultSummary,
  type TimelineEvent,
  type TimelineRow,
} from './qaLogGrouping'
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
  // 에이전트가 부른 tool 하나. 답이 그 행 안에 붙으므로 호출 하나를 통째로 말하는
  // 'Tool' 이고, 짝을 못 찾아 홀로 남은 답만 'Tool result' 로 뜬다.
  TOOL: 'Tool',
  TOOL_RESULT: 'Tool result',
  // 그중 조작 tool 이 SDK 로 내보낸 요청. tool 호출이 아니라 그 아래 층의 전송이므로
  // Tool 과 이름을 나눠 둔다.
  ACTION: 'Action',
  ACTION_RESULT: 'Action result',
  GAME_STATE: 'Game state',
  STATUS: 'Status',
  ERROR: 'Error',
  CHAT: 'Chat',
  CASE_VERDICT: 'Case verdict',
  BEHAVIOR_ENDED: 'Behavior ended',
}

/** Breathing room above a row scrolled to, so it does not sit flush at the edge. */
const FOCUS_MARGIN = 16

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

/**
 * 한 행 안에 붙는 답.
 *
 * 한 줄 요약이 먼저이고 원본은 접어 둔다. 읽는 사람이 로그에서 찾는 것은 "이게 됐나"
 * 하나인데, 그 답이 배열이나 긴 본문 안에 묻혀 있으면 매번 펼쳐야 한다.
 *
 * 요약을 뽑는 방법이 층마다 다르다. `ACTION_RESULT` 는 `results` 배열이라 성패를 셀 수
 * 있고, `TOOL_RESULT` 는 tool 이 모델에게 돌려준 문자열이라 셀 것이 없다 — 그래서 성패를
 * 지어내지 않고 본문 첫 줄을 보인다.
 */
function QaCallResult({ result }: { result: QaLog[] }) {
  const newest = result[result.length - 1]
  const summary = toolResultSummary(newest.payload)
  const output = toolOutputOf(newest.payload)
  const failed = summary !== null && summary.failed > 0
  const outcome = summary === null ? 'Returned' : failed ? 'Failed' : 'Succeeded'
  const headline =
    summary !== null ? formatToolResult(summary) : (output?.split('\n')[0] ?? null)

  return (
    <div className={`qa-log-tool-result${failed ? ' qa-log-tool-result--failed' : ''}`}>
      <p className="qa-log-tool-verdict">
        {/* 색만으로는 못 읽는다. 성패는 글자로도 말한다. */}
        <span className="qa-log-tool-outcome">{outcome}</span>
        {headline !== null && <span>{headline}</span>}
        <time dateTime={newest.createdAt}>{formatTimestamp(newest.createdAt)}</time>
      </p>
      <details className="qa-log-payload">
        <summary>Inspect result</summary>
        {/* tool 이 돌려준 것은 사람이 읽으라고 쓴 글이다. JSON 으로 다시 감싸면
            줄바꿈이 \n 으로 굳어 읽을 수 없다. */}
        <pre>{output ?? payloadText(newest.payload)}</pre>
      </details>
    </div>
  )
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
  const first = event.hops[0]
  const newest = event.hops[event.hops.length - 1]
  const hasPayload = newest.payload !== null && newest.payload !== undefined

  return (
    <li
      className={`qa-log-folded-event${focused ? ' qa-log-folded-event--focused' : ''}`}
      data-log-id={first.id}
      tabIndex={-1}
    >
      <div className="qa-log-meta">
        <time dateTime={newest.createdAt}>{formatTimestamp(newest.createdAt)}</time>
        <span>{formatPath(event.hops.map((hop) => hop.direction))}</span>
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
      {event.result !== null && <QaCallResult result={event.result} />}
    </li>
  )
}

/**
 * `흐름` 한 행: Agent 가 무엇을 생각했고 무엇을 했는지, 두 줄.
 *
 * 칩도 배지도 경로도 반복수도 없다. 그것들은 `Raw` 탭이 그대로 그린다. 이 탭은 런을
 * 따라 읽는 자리이고, 읽는 사람이 찾는 것은 그 두 줄이다.
 *
 * `행동` 줄의 뒷부분은 tool 이 돌려준 결과의 머리다 — `args` 를 쓰지 않는 이유는 `click`
 * 이 `target: "#26570"` 으로 오기 때문이다. 그 숫자는 사람이 읽을 수 없고, 같은 왕복의
 * 결과는 `mouse_down: 닿은 것 없음` 이라고 말한다.
 */
function QaFlowRow({
  focusedLogId,
  row,
}: {
  focusedLogId: string | null
  row: TimelineRow
}) {
  const { t } = useI18n()
  const text = t.qa.run
  const log = newestOf(row)
  const newestEvent = row.events[row.events.length - 1]
  const call = log.type === 'TOOL' ? toolCallOf(log) : null
  const result = newestEvent.result
  const summary = result === null ? null : toolResultSummary(result[result.length - 1].payload)
  // 판정은 tool 의 답이 아니라 모델이 낸 값에서 읽는다 — `report_step` 의 답은 결과가 아니라
  // 다음에 할 일을 이르는 프롬프트 문구다.
  const verdict = verdictOf(call)
  const outcome =
    verdict !== null
      ? [verdict.passed ? text.flowPassed : text.flowFailed, verdict.message]
          .filter((part): part is string => part !== null)
          .join(' · ')
      : result === null
        ? null
        : outcomeHeadOf(toolOutputOf(result[result.length - 1].payload))
  const failed = verdict !== null ? !verdict.passed : summary !== null && summary.failed > 0

  // tool 을 부르지 않은 프레임(STATUS·ERROR 등)은 생각이 없다. 한 줄로 둔다.
  const thought = call === null ? null : (call.thought ?? text.flowNoThought)
  const did = call !== null ? call.tool : log.message

  return (
    <li
      className={`qa-flow-row${failed ? ' qa-flow-row--failed' : ''}${log.id === focusedLogId ? ' qa-flow-row--focused' : ''}`}
      data-log-id={log.id}
      tabIndex={-1}
    >
      <div className="qa-log-marker" aria-hidden="true" />
      <article aria-labelledby={`qa-log-${log.id}-message`}>
        {thought !== null && (
          <p className="qa-flow-line qa-flow-line--thought">
            <span className="qa-flow-label">{text.flowThought}</span>
            <span className="qa-flow-text">{thought}</span>
          </p>
        )}
        <p className="qa-flow-line qa-flow-line--action" id={`qa-log-${log.id}-message`}>
          <span className="qa-flow-label">{text.flowAction}</span>
          <span className="qa-flow-text">
            {call !== null ? (
              <span className="qa-flow-tool mono" translate="no">{did}</span>
            ) : (
              did
            )}
            {outcome !== null && <span className="qa-flow-outcome">{outcome}</span>}
          </span>
        </p>
      </article>
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
  // 행이 대표하는 이벤트. 결과가 붙어 있다면 그 이벤트의 것이다.
  const newestEvent = row.events[row.events.length - 1]
  const repeats = row.events.length
  const hasPayload = log.payload !== null && log.payload !== undefined
  const step = stepOf(log)
  // TOOL 행은 `message` 가 tool 이름이다. 그것은 메타 줄의 칩으로 따로 보이므로, 본문
  // 자리에는 모델이 왜 불렀는지를 적은 `thought` 를 놓는다.
  const call = log.type === 'TOOL' ? toolCallOf(log) : null
  // cheat 호출이 담긴 ACTION 행과, cheat 를 쓴 step 의 STATUS 행에 배지를 단다(ARTEL-1051).
  const cheatNames = cheatNamesOf(log)
  const usedCheats = log.type === 'STATUS' ? usedCheatsOf(log.payload) : []
  const behaviorEnded = log.type === 'BEHAVIOR_ENDED' ? behaviorEndedOf(log.payload) : null
  const functionText = t.gameFunctions.timeline
  const behaviorEndedMessage =
    behaviorEnded === null
      ? null
      : [
          behaviorEnded.name,
          behaviorEnded.reason === null ? functionText.unknownReason : functionText.endReason[behaviorEnded.reason],
          behaviorEnded.detail,
        ]
          .filter((part): part is string => part !== null && part.length > 0)
          .join(' · ')
  const message =
    call !== null
      ? (call.thought ?? 'No reason given')
      : log.message.length > 0
        ? log.message
        : (behaviorEndedMessage ?? 'No message')
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
          {call !== null && (
            <span className="qa-log-tool-name mono" translate="no">{call.tool}</span>
          )}
          {step !== null && <span className="qa-log-step">{t.qa.steps.short(step)}</span>}
          {cheatNames.length > 0 && (
            <span className="gf-badge" translate="no">
              {cheatNames.length === 1 && cheatNames[0].length > 0
                ? functionText.cheatBadgeNamed(cheatNames[0])
                : functionText.cheatBadge}
            </span>
          )}
          {usedCheats.length > 0 && (
            <span
              className="gf-badge"
              title={usedCheats
                .map((used) => (used.success ? used.name : `${used.name} (${functionText.usedCheatFailed})`))
                .join(', ')}
            >
              {functionText.usedCheats(usedCheats.length)}
            </span>
          )}
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
        {call !== null
          ? Object.keys(call.args).length > 0 && (
              <details className="qa-log-payload">
                <summary>Inspect arguments</summary>
                <pre>{payloadText(call.args)}</pre>
              </details>
            )
          : hasPayload && (
              <details className="qa-log-payload">
                <summary>Inspect payload</summary>
                <pre>{payloadText(log.payload)}</pre>
              </details>
            )}
        {newestEvent.result !== null && <QaCallResult result={newestEvent.result} />}
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
                    focused={eventIdOf(event) === focusedLogId}
                    headline={message}
                    key={eventIdOf(event)}
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

/**
 * A section boundary inserted between rows: the run entered a different TC region
 * (or the plain action/general area). Display-only — it carries no `data-log-id`,
 * so focus/fold/scroll logic (which queries by that) is untouched.
 */
type SectionKey = { kind: 'tc'; tcNo: number } | { kind: 'action' } | { kind: 'general' }
type ListItem = { kind: 'header'; id: string; section: SectionKey } | { kind: 'row'; row: TimelineRow }

function sectionId(section: SectionKey): string {
  return section.kind === 'tc' ? `tc:${section.tcNo}` : section.kind
}

export function QaLogTimeline({
  focusRequest,
  hasMore,
  historyFailure,
  historyLoading,
  live,
  loadOlder,
  flow = false,
  logs,
  onFocusResolved,
  scenarioSteps = [],
}: {
  /** `흐름` 탭인가. true 면 한 행이 생각 · 행동 두 줄이고, 그 밖은 `Raw` 와 같다. */
  flow?: boolean
  focusRequest: QaLogFocusRequest | null
  hasMore: boolean
  historyFailure: string | null
  historyLoading: boolean
  live: boolean
  loadOlder: () => Promise<boolean>
  logs: QaLog[]
  onFocusResolved: () => void
  /** Scenario steps, so consecutive logs can be grouped under their TC region (#6). */
  scenarioSteps?: ScenarioStep[]
}) {
  const { t } = useI18n()
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
  const rows = useMemo(() => buildTimelineRows(logs), [logs])
  const hiddenTargets = useMemo(() => hiddenLogTargets(rows), [rows])

  // step (1-based) → its TC region ordinal, or null for a case-less action step.
  const regionByStep = useMemo(() => {
    const map = new Map<number, number | null>()
    let tcSeq = 0
    for (const group of groupStepsByCase(scenarioSteps)) {
      const tcNo = group.caseId !== null ? (tcSeq += 1) : null
      for (const index of group.indices) map.set(index + 1, tcNo)
    }
    return map
  }, [scenarioSteps])

  // Interleave TC-region headers between rows (#6). A log without its own step
  // (GAME_STATE, generic LOG) inherits the last region seen, so the noise between
  // two verdicts clusters under the region that was active. Headers appear only
  // when scenario steps are known; otherwise the list is exactly `rows`.
  const listItems = useMemo<ListItem[]>(() => {
    if (regionByStep.size === 0) return rows.map((row) => ({ kind: 'row', row }))
    const items: ListItem[] = []
    let lastKey: string | null = null
    let carried: SectionKey = { kind: 'general' }
    for (const row of rows) {
      const step = stepOf(newestOf(row))
      if (step !== null && regionByStep.has(step)) {
        const tcNo = regionByStep.get(step) ?? null
        carried = tcNo !== null ? { kind: 'tc', tcNo } : { kind: 'action' }
      }
      const key = sectionId(carried)
      if (key !== lastKey) {
        items.push({ kind: 'header', id: `sec:${key}:${newestOf(row).id}`, section: carried })
        lastKey = key
      }
      items.push({ kind: 'row', row })
    }
    return items
  }, [rows, regionByStep])

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

    // 제 요소가 없는 로그다. 접힌 묶음 안이거나, 한 이벤트의 중계 hop 이거나, tool 행
    // 안으로 들어간 ACTION_RESULT 다. 펼쳐야 나오는 것이면 먼저 펼치고, 요소가 생긴
    // 다음 렌더에서 그리로 스크롤한다.
    const hidden = hiddenTargets.get(focusRequest.logId)
    if (hidden !== undefined) {
      const anchor = hidden.anchor
      if (anchor !== null && !expandedRows.has(anchor)) {
        // Deferred a frame for the same reason the unseen counter is: opening the
        // run is a render this effect asks for, not one it should cascade into.
        window.requestAnimationFrame(() => expandRow(anchor))
        return
      }
      const element = viewport.querySelector<HTMLElement>(`[data-log-id="${hidden.target}"]`)
      if (element !== null) {
        focusOn(viewport, element, hidden.target)
        return
      }
    }

    // Nothing left to reveal, and retrying would loop, so drop the request.
    onFocusResolved()
  }, [
    expandRow,
    expandedRows,
    focusRequest,
    hasMore,
    hiddenTargets,
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
        {listItems.map((item) => {
          if (item.kind === 'header') {
            return (
              <li className="qa-log-section" key={item.id}>
                {item.section.kind === 'tc' ? (
                  <span className="qa-tc-badge">{t.qa.steps.caseLabel(item.section.tcNo)}</span>
                ) : (
                  <span className="qa-log-section-label">
                    {item.section.kind === 'action' ? t.qa.run.logAction : t.qa.run.logGeneral}
                  </span>
                )}
              </li>
            )
          }
          const anchor = anchorOf(item.row)
          return (
            flow ? (
              <QaFlowRow
                focusedLogId={focusedLogId}
                key={newestOf(item.row).id}
                row={item.row}
              />
            ) : (
              <QaLogRow
                expanded={expandedRows.has(anchor)}
                focusedLogId={focusedLogId}
                key={newestOf(item.row).id}
                onToggle={() => toggleRow(anchor)}
                row={item.row}
              />
            )
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
