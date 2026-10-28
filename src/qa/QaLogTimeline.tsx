import { TestCaseHover } from '../testCases/TestCaseHover'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { asRecord } from '../projects/projectApi'
import { useI18n } from '../i18n/useI18n'
import { groupStepsByCase, type ExecutionMode, type ScenarioStep } from '../testScenarios/scenarioTypes'
import { compareDecimalIds } from './qaApi'
import { behaviorEndedOf } from './qaFunctionTimeline'
import {
  anchorOf,
  buildTimelineRows,
  eventIdOf,
  formatPath,
  formatToolResult,
  hiddenLogTargets,
  newestOf,
  toolCallOf,
  toolOutputOf,
  toolResultSummary,
  type TimelineEvent,
  type TimelineRow,
} from './qaLogGrouping'
import { buildFreeFlow, buildFlowSteps, objectNamesOf, type FlowAction, type FlowLine, type FlowStep } from './qaFlow'
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
  PULSE: 'Pulse',
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

/** 덩어리 왼쪽의 원 하나. 생각과 행동을 눈으로 가른다. */
function QaFlowDot({ kind, last }: { kind: FlowLine['kind'] | 'blocked' | 'verdict'; last: boolean }) {
  return (
    <span aria-hidden="true" className="qa-flow-rail">
      <span className={`qa-flow-dot qa-flow-dot--${kind}`} />
      {!last && <span className="qa-flow-link" />}
    </span>
  )
}

/**
 * `흐름` 한 덩어리 = 스텝 하나.
 *
 * 묻는 것이 둘뿐이라(무엇을 생각했고 무엇을 했나) 담는 것도 둘뿐이다. 도구 이름도,
 * tool 이 돌려준 본문도, 판정 문구도 안 보인다 — 그것들은 `Raw` 탭이 그대로 그린다.
 *
 * 판정은 글이 아니라 덩어리의 상태다. 오른쪽 아래에 통과 · 실패만 붙고, 아무것도 안 해 보고
 * 내린 판정이면 그렇게 적는다 — try 46 에서 43 스텝 중 32 가 그랬다.
 */
function QaFlowStep({ projectId, gameBuildId, block, free = false, caseId = null, logId }: { projectId: string; gameBuildId: string | null; block: FlowStep; free?: boolean; caseId?: string | null; logId?: string }) {
  const { t } = useI18n()
  const text = t.qa.run

  function sentence(action: FlowAction): string {
    const say = text.flowDid[action.tool]
    return say === undefined ? text.flowDidOther(action.tool) : say(action.subject)
  }

  // 같은 문장은 한 덩어리에 한 번만 그린다. `buildFlowSteps` 도 접지만 그쪽은 들어온 순서를
  // 타고, 이 자리는 안 탄다 — 되풀이해 시도한 호출이 `thought` 를 글자 그대로 다시 싣는다.
  const shown = block.lines.filter((line, at) =>
    line.kind !== 'thought' ||
    block.lines.findIndex((other) => other.kind === 'thought' && other.text === line.text) === at,
  )

  const verdict =
    block.passed === null
      ? null
      : [
          block.passed ? text.flowPassed : text.flowFailed,
          // 실패에만 붙인다. 보기만 하면 되는 TC 가 많아서(try 46 의 조작 0회 스텝 대부분이
          // 그렇다) 통과에 붙이면 멀쩡한 판정을 흠처럼 읽게 한다.
          !free && !block.passed && block.attempts === 0 ? text.flowNoAttempt : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' · ')

  return (
    <li className="qa-flow-step" data-log-id={logId ?? block.lines[0]?.id}>
      <div className="qa-flow-card">
        {/* 한 TC 가 스텝 여럿에 걸칠 때 어디서 갈리는지, 그리고 레일의 몇 번째인지를 잇는다. */}
        {!free && <p className="qa-flow-step-no">{text.flowStepLabel(block.step)}</p>}
        {shown.map((line, at) => {
          // 판정 줄이 아래에 붙으므로 마지막 조작 줄에서도 선을 잇는다.
          const last = at === shown.length - 1 && block.passed === null
          if (line.kind === 'thought') {
            return (
              <p className="qa-flow-line" key={line.key}>
                <QaFlowDot kind="thought" last={last} />
                <span className="qa-flow-said">{line.text}</span>
              </p>
            )
          }
          const blocked = line.action.blocked
          return (
            <p className="qa-flow-line" key={line.key}>
              <QaFlowDot kind={blocked ? 'blocked' : 'action'} last={last} />
              <span className={`qa-flow-said qa-flow-said--${blocked ? 'blocked' : 'did'}`}>
                {sentence(line.action)}
                {blocked && <span className="qa-flow-blocked"> · {text.flowBlockedSuffix}</span>}
              </span>
            </p>
          )
        })}
        {block.passed !== null && (
          <div
            className={`qa-flow-verdict qa-flow-verdict--${block.passed ? 'passed' : 'failed'}${shown.length === 0 ? ' qa-flow-verdict--alone' : ''}`}
          >
            <QaFlowDot kind="verdict" last />
            <div className="qa-flow-said">
              {block.reason !== null && <p className="qa-flow-reason">{block.reason}</p>}
              {/* 결과는 이유에 이어 붙이지 않는다. 붙이면 모델이 쓴 문장의 일부처럼 읽힌다. */}
              <p className="qa-flow-call">{caseId !== null && <TestCaseHover projectId={projectId} caseId={caseId} gameBuildId={gameBuildId}><span translate="no">TC #{caseId} · </span></TestCaseHover>}{verdict}</p>
            </div>
          </div>
        )}
      </div>
    </li>
  )
}

function QaLogRow({
  projectId,
  gameBuildId,
  executionMode,
  scenarioSteps,
  expanded,
  focusedLogId,
  onToggle,
  row,
}: {
  projectId: string
  gameBuildId: string | null
  executionMode: ExecutionMode
  scenarioSteps: ScenarioStep[]
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
  const payload = asRecord(log.payload)
  const verdictCaseId = log.type === 'CASE_VERDICT'
    ? payload?.case_id
    : log.type === 'STATUS' && (payload?.status === 'COMPLETED' || payload?.status === 'FAILED') && step !== null
      ? scenarioSteps[step - 1]?.case_id
      : null
  const caseId = typeof verdictCaseId === 'number' || typeof verdictCaseId === 'string'
    ? String(verdictCaseId) : null
  // TOOL 행은 `message` 가 tool 이름이다. 그것은 메타 줄의 칩으로 따로 보이므로, 본문
  // 자리에는 모델이 왜 불렀는지를 적은 `thought` 를 놓는다.
  const call = log.type === 'TOOL' ? toolCallOf(log) : null
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
          {executionMode === 'FREE'
            ? caseId !== null && <TestCaseHover projectId={projectId} caseId={caseId} gameBuildId={gameBuildId}><span className="qa-tc-badge" translate="no">TC #{caseId}</span></TestCaseHover>
            : step !== null && <span className="qa-log-step">{t.qa.steps.short(step)}</span>}
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
  projectId,
  gameBuildId = null,
  executionMode = 'ORDERED',
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
  executionMode?: ExecutionMode
  projectId: string
  gameBuildId?: string | null
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
  const caseGroups = groupStepsByCase(scenarioSteps).filter((group) => group.caseId !== null)
  const orderedFlow = flow && executionMode === 'ORDERED'
  // `흐름` 은 로그 한 줄이 아니라 스텝 하나를 그린다. `PULSE` 는 행으로 안 서지만
  // 조작 대상의 이름이 거기에만 있으므로 사전을 만드는 데 쓴다.
  const flowSteps = useMemo(
    () => (orderedFlow ? buildFlowSteps(logs, objectNamesOf(logs)) : []),
    [orderedFlow, logs],
  )
  const freeFlow = useMemo(
    () => flow && executionMode === 'FREE' ? buildFreeFlow(logs, objectNamesOf(logs), scenarioSteps) : [],
    [flow, executionMode, logs, scenarioSteps],
  )
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

  /**
   * 같은 TC 에 속한 스텝을 한 머리 아래로 모은다.
   *
   * 한 TC 가 스텝 여럿에 걸치면 전에는 같은 `TC n` 머리가 여러 번 찍혔다. TC 가 없는
   * 조작 스텝은 저 혼자 한 묶음이고 스텝 번호를 머리로 쓴다.
   */
  const flowGroups = useMemo(() => {
    const groups: { key: string; tcNo: number | null; blocks: FlowStep[] }[] = []
    for (const block of flowSteps) {
      const tcNo = regionByStep.get(block.step) ?? null
      const last = groups[groups.length - 1]
      if (tcNo !== null && last !== undefined && last.tcNo === tcNo) {
        last.blocks.push(block)
        continue
      }
      groups.push({ key: `${tcNo ?? 's'}:${block.step}`, tcNo, blocks: [block] })
    }
    return groups
  }, [flowSteps, regionByStep])

  // Interleave TC-region headers between rows (#6). A log without its own step
  // (GAME_STATE, generic LOG) inherits the last region seen, so the noise between
  // two verdicts clusters under the region that was active. Headers appear only
  // when scenario steps are known; otherwise the list is exactly `rows`.
  const listItems = useMemo<ListItem[]>(() => {
    if (executionMode === 'FREE' || regionByStep.size === 0) return rows.map((row) => ({ kind: 'row', row }))
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
  }, [rows, regionByStep, executionMode])

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
    // 그려진 것이 하나도 없으면 되돌릴 스크롤 위치도 없다. 그래도 **불러오기는 한다** —
    // 여기서 돌아가면 다시 부를 길이 없다. `흐름` 은 받은 50건이 전부 `PULSE` 이면 덩어리가
    // 0 일 수 있고(try 46 의 꼬리가 그렇다), 그때 목록이 영영 비어 있게 된다.
    const firstRow = viewport.querySelector<HTMLElement>('[data-log-id]')
    anchorRef.current =
      firstRow === null
        ? null
        : { id: firstRow.dataset.logId ?? '', top: firstRow.getBoundingClientRect().top }
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

      <ol className={flow ? 'qa-flow-list' : 'qa-log-list'}>
        {orderedFlow
          ? flowGroups.map((group) => (
              <li className="qa-flow-group" key={group.key}>
                <TestCaseHover projectId={projectId} caseId={group.tcNo === null ? null : caseGroups[group.tcNo - 1]?.caseId} gameBuildId={gameBuildId}><p className={`qa-flow-label${group.tcNo === null ? ' qa-flow-label--plain' : ''}`}>
                  {group.tcNo === null
                    ? t.qa.run.flowStepLabel(group.blocks[0].step)
                    : t.qa.steps.caseLabel(group.tcNo)}
                </p></TestCaseHover>
                <ol className="qa-flow-blocks">
                  {group.blocks.map((block) => (
                    <QaFlowStep projectId={projectId} gameBuildId={gameBuildId} block={block} key={block.step} />
                  ))}
                </ol>
              </li>
            ))
          : flow ? freeFlow.map((block) => (
              <QaFlowStep projectId={projectId} gameBuildId={gameBuildId} block={block} free caseId={block.caseId} logId={block.id} key={block.id} />
            )) : listItems.map((item) => {
              if (item.kind === 'header') {
            return (
              <li className="qa-log-section" key={item.id}>
                {item.section.kind === 'tc' ? (
                  <TestCaseHover projectId={projectId} caseId={caseGroups[item.section.tcNo - 1]?.caseId} gameBuildId={gameBuildId}><span className="qa-tc-badge">{t.qa.steps.caseLabel(item.section.tcNo)}</span></TestCaseHover>
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
            <QaLogRow
              projectId={projectId}
              gameBuildId={gameBuildId}
              executionMode={executionMode}
              scenarioSteps={scenarioSteps}
              expanded={expandedRows.has(anchor)}
              focusedLogId={focusedLogId}
              key={newestOf(item.row).id}
              onToggle={() => toggleRow(anchor)}
              row={item.row}
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
