import { asRecord } from '../projects/projectApi'
import type { QaLog } from './qaTypes'

/**
 * 로그 목록을 화면에 그릴 행으로 바꾸는 순수 규칙들.
 *
 * 렌더와 떼어 둔 이유는 두 가지다. 이 규칙들은 화면 없이 단위 테스트로 고정할 수 있고,
 * 한 tool 호출을 이루는 로그가 네 줄까지 흩어져 있어 그 짝을 맞추는 판단이 렌더 안에
 * 섞여 있으면 읽을 수 없기 때문이다.
 */

/** 각 방향의 양 끝. 중계된 이벤트 하나를 한 경로로 그리기 위한 것이다. */
const DIRECTION_NODES: Record<QaLog['direction'], [string, string]> = {
  AGENT_TO_ORCHE: ['Agent', 'Orchestration'],
  ORCHE_TO_AGENT: ['Orchestration', 'Agent'],
  ORCHE_TO_SDK: ['Orchestration', 'SDK'],
  SDK_TO_ORCHE: ['SDK', 'Orchestration'],
  ORCHE_INTERNAL: ['Orchestration', 'Orchestration'],
  USER_TO_ORCHE: ['You', 'Orchestration'],
}

/** payload 가 달라도 연속이면 접는 종류. */
const STREAMED_TYPES = new Set<QaLog['type']>(['GAME_STATE'])

/**
 * 답이 돌아오는 종류와, 그 답의 종류.
 *
 * 둘은 층이 다르다. `TOOL` 은 에이전트가 부른 tool 하나이고, `ACTION` 은 그중 조작 tool 이
 * SDK 로 내보낸 요청이다. 조작 한 번은 둘 다 남기므로 두 쌍이 한 런에 섞여 흐른다.
 */
const RESULT_OF: Partial<Record<QaLog['type'], QaLog['type']>> = {
  TOOL: 'TOOL_RESULT',
  ACTION: 'ACTION_RESULT',
}

const RESULT_TYPES = new Set<QaLog['type']>(Object.values(RESULT_OF))

/**
 * 이벤트 하나와 그것이 거쳐 간 모든 중계 hop, 오래된 순.
 *
 * SDK -> Orchestration -> Agent 를 건너는 메시지는 hop 마다 한 줄씩 기록되므로, 하나인
 * 것이 셋으로 읽힌다.
 *
 * `result` 는 ACTION 이벤트에만 붙는다. 그 tool 호출에 답한 ACTION_RESULT 의 hop 들이며,
 * 아직 결과가 없거나 이 이벤트가 ACTION 이 아니면 null 이다.
 */
export type TimelineEvent = {
  hops: QaLog[]
  result: QaLog[] | null
}

/**
 * 그려지는 행 하나: 연속 이벤트 묶음을 그중 가장 새 것으로 대표하고, 그것들이 지나간
 * 경로를 함께 보인다. 펼치면 접힌 이벤트를 하나씩 전부 읽을 수 있다.
 *
 * 접히는 것은 두 가지이며, 둘 다 *연속일 때만* 접으므로 시간순은 바뀌지 않는다.
 *
 * 1. 흘러 들어오는 상태. 실행 중인 게임은 GAME_STATE 를 초당 한 번쯤 내보내고 프레임마다
 *    조금씩 다르다. payload 를 비교하는 방식으로는 하나도 접히지 않으므로 종류로 접는다.
 * 2. 그 밖의 완전히 같은 반복.
 *
 * 버리는 것은 없다. `events` 가 접힌 로그를 전부 들고 있다.
 */
export type TimelineRow = {
  events: TimelineEvent[]
  path: QaLog['direction'][]
}

/** 접힌 행이 대표하는 로그: 가장 새 이벤트의 마지막 hop. */
export function newestOf(row: TimelineRow): QaLog {
  const event = row.events[row.events.length - 1]
  return event.hops[event.hops.length - 1]
}

/**
 * 펼쳐져 있는 동안 행을 기억하는 id.
 *
 * 가장 새 로그가 아니라 가장 *오래된* 로그다. 실행 중인 런은 새 프레임을 꼬리 행에 계속
 * 접어 넣으므로, 그것을 따라 움직이는 id 였다면 다음 프레임에서 펼침이 풀린다.
 */
export function anchorOf(row: TimelineRow): string {
  return row.events[0].hops[0].id
}

/** 펼쳤을 때 이벤트 하나가 갖는 요소 id. */
export function eventIdOf(event: TimelineEvent): string {
  return event.hops[0].id
}

function isSameEvent(left: QaLog, right: QaLog): boolean {
  return (
    left.direction === right.direction &&
    left.message === right.message &&
    // payload 가 같은지가 진짜 반복과 제목만 같고 새 근거를 실은 이벤트를 가른다.
    // 인접한 행끼리만 비교하므로 비용은 감당된다.
    JSON.stringify(left.payload) === JSON.stringify(right.payload)
  )
}

/**
 * `right` 가 `left` 의 다음 hop 인지.
 *
 * 중계는 id 를 그대로 들고 가거나(GAME_STATE, ACTION_RESULT) 새로 딴 id 의 correlation
 * 으로 참조한다(ACTION 이 SDK 호출이 될 때). 잇는 데는 id 가 있어야 한다. 둘 다 id 가
 * 없는 두 줄은 아무 근거도 아니므로, 그때는 내용을 비교하는 쪽으로 물러난다.
 */
function isNextHop(left: QaLog, right: QaLog): boolean {
  if (left.direction === right.direction) return false
  const linked =
    (left.messageId !== null && left.messageId === right.messageId) ||
    (left.messageId !== null && left.messageId === right.correlationId) ||
    (right.messageId !== null && right.messageId === left.correlationId)
  if (linked) return true
  // id 없이 쓰인 중계 사본 — Agent 로 가는 중인 운영자 메시지가 그렇다 — 은 대신 같은
  // 문구와 payload 를 들고 있다.
  return (
    left.messageId === null &&
    right.messageId === null &&
    left.message === right.message &&
    JSON.stringify(left.payload) === JSON.stringify(right.payload)
  )
}

/**
 * 행의 경로에 hop 을 더한다. 이미 올라 있는 방향은 무시한다.
 *
 * 접힌 스트림은 프레임마다 같은 길을 지나므로, 그냥 이어 붙이면
 * "SDK -> Orchestration -> Agent -> Orchestration -> Agent -> ..." 가 된다.
 */
function withHop(path: QaLog['direction'][], direction: QaLog['direction']): QaLog['direction'][] {
  return path.includes(direction) ? path : [...path, direction]
}

/** 연속하는 로그를 hop 으로 이어 이벤트를 만든다. */
export function groupHops(logs: QaLog[]): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const log of logs) {
    const previous = events[events.length - 1]
    const latest = previous?.hops[previous.hops.length - 1]
    if (latest !== undefined && latest.type === log.type && isNextHop(latest, log)) {
      previous.hops.push(log)
      continue
    }
    events.push({ hops: [log], result: null })
  }
  return events
}

/**
 * 한 이벤트가 들고 있는 상관 id 전부.
 *
 * Orchestration 이 tool 호출 한 번을 이렇게 적는다.
 *
 * | 로그 | messageId | correlationId |
 * |---|---|---|
 * | ACTION `AGENT_TO_ORCHE` | Agent 의 messageId | 없음 |
 * | ACTION `ORCHE_TO_SDK` | 그 로그 자신의 id | Agent 의 messageId |
 * | ACTION_RESULT `SDK_TO_ORCHE` | ACTION outbound 의 messageId | Agent 의 messageId |
 * | ACTION_RESULT `ORCHE_TO_AGENT` | 같음 | 같음 |
 *
 * 그래서 호출과 그 결과는 이 집합이 반드시 겹치고, 서로 다른 호출은 겹치지 않는다.
 */
function linkIdsOf(event: TimelineEvent): Set<string> {
  const ids = new Set<string>()
  for (const hop of event.hops) {
    if (hop.messageId !== null) ids.add(hop.messageId)
    if (hop.correlationId !== null) ids.add(hop.correlationId)
  }
  return ids
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const id of left) {
    if (right.has(id)) return true
  }
  return false
}

/**
 * ACTION_RESULT 이벤트를 자기 ACTION 이벤트에 붙이고 목록에서 뺀다.
 *
 * 접기와 달리 인접을 요구하지 않는다. 액션이 실행되는 동안 GAME_STATE 프레임이 사이에
 * 끼는 것이 보통이고, 그때마다 짝을 놓치면 묶음이 성립하지 않는다. 결과는 언제나 자기
 * 호출보다 뒤에 오므로 뒤로만 훑으며, 시간 역전은 생기지 않는다.
 *
 * 짝을 못 찾은 결과는 제 이벤트로 남는다. 페이지 경계에서 호출이 아직 안 실렸거나,
 * Orchestration 이 모르는 액션의 결과를 받은 경우다. 지우는 편보다 남기는 편이 낫다.
 */
export function attachToolResults(events: TimelineEvent[]): TimelineEvent[] {
  const kept: TimelineEvent[] = []
  // 아직 답을 못 받은 호출. 가장 최근 것부터 맞춰 본다. id 집합을 넣을 때 한 번만 만들어
  // 들고 다니는 이유는, 실행 중인 런이 로그가 늘 때마다 이 전체를 다시 돌리기 때문이다.
  // 후보마다 다시 만들면 로그 수의 제곱으로 커진다.
  //
  // `resultType` 을 함께 든다. TOOL 과 ACTION 이 한 런에 섞여 흐르므로, 답이 왔을 때 그것이
  // 어느 층의 답인지 가려야 tool 의 답이 액션에 붙는 일이 없다.
  const awaiting: { event: TimelineEvent; ids: Set<string>; resultType: QaLog['type'] }[] = []

  for (const event of events) {
    const type = event.hops[0].type
    const resultType = RESULT_OF[type]
    if (resultType !== undefined) {
      awaiting.push({ event, ids: linkIdsOf(event), resultType })
      kept.push(event)
      continue
    }
    if (!RESULT_TYPES.has(type)) {
      kept.push(event)
      continue
    }

    const ids = linkIdsOf(event)
    let matched = false
    for (let index = awaiting.length - 1; index >= 0; index -= 1) {
      const candidate = awaiting[index]
      if (candidate.resultType !== type || !intersects(candidate.ids, ids)) continue
      candidate.event.result = event.hops
      awaiting.splice(index, 1)
      matched = true
      break
    }
    if (!matched) kept.push(event)
  }

  return kept
}

/** 이벤트가 지나간 방향 전부. 결과가 붙어 있으면 돌아온 길까지 포함한다. */
function directionsOf(event: TimelineEvent): QaLog['direction'][] {
  const hops = event.result === null ? event.hops : [...event.hops, ...event.result]
  return hops.map((hop) => hop.direction)
}

/** 연속하는 같은 종류의 이벤트를 행으로 접는다. */
export function collapseRepeats(events: TimelineEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = []

  for (const event of events) {
    const log = event.hops[0]
    const previous = rows[rows.length - 1]
    const latest = previous === undefined ? null : newestOf(previous)

    if (
      latest !== null &&
      latest.type === log.type &&
      (STREAMED_TYPES.has(log.type) || isSameEvent(latest, log))
    ) {
      previous.events.push(event)
      for (const direction of directionsOf(event)) {
        previous.path = withHop(previous.path, direction)
      }
      continue
    }

    let path: QaLog['direction'][] = []
    for (const direction of directionsOf(event)) path = withHop(path, direction)
    rows.push({ events: [event], path })
  }

  return rows
}

/** 로그 목록을 행으로 바꾸는 전체 과정. 화면은 이것만 부른다. */
export function buildTimelineRows(logs: QaLog[]): TimelineRow[] {
  return collapseRepeats(attachToolResults(groupHops(logs)))
}

/** 제 요소 없이 다른 요소 안에 들어간 로그를 어디서 찾는지. */
export type HiddenLogTarget = {
  /** 그 요소가 나타나려면 펼쳐야 하는 행. 펼칠 것이 없으면 null. */
  anchor: string | null
  /** 펼친 뒤 스크롤할 요소의 `data-log-id`. */
  target: string
}

/**
 * 화면에 제 행을 갖지 못한 로그 id 를 실제로 그려진 요소로 돌려주는 지도.
 *
 * 세 가지가 여기로 온다. 접힌 반복 안의 이벤트, 한 이벤트 안의 중계 hop, 그리고 이제
 * tool 행 안으로 들어간 ACTION_RESULT 다. 스텝 타임라인의 점프는 로그 id 로 오므로,
 * 이 지도가 없으면 묶는 순간 그 점프가 아무 데도 도착하지 못한다.
 */
export function hiddenLogTargets(rows: TimelineRow[]): Map<string, HiddenLogTarget> {
  const targets = new Map<string, HiddenLogTarget>()

  for (const row of rows) {
    const expandable = row.events.length > 1
    const anchor = expandable ? anchorOf(row) : null
    const rowTarget = newestOf(row).id

    for (const event of row.events) {
      const target = expandable ? eventIdOf(event) : rowTarget
      const hops = event.result === null ? event.hops : [...event.hops, ...event.result]
      for (const hop of hops) targets.set(hop.id, { anchor, target })
    }
  }

  return targets
}

/** 실제로 그려진 방향들로 "SDK -> Orchestration -> Agent" 를 만든다. */
export function formatPath(path: QaLog['direction'][]): string {
  const nodes: string[] = []
  for (const direction of path) {
    const [from, to] = DIRECTION_NODES[direction]
    if (nodes.length === 0) nodes.push(from)
    if (nodes[nodes.length - 1] !== to) nodes.push(to)
  }
  return nodes.join(' → ')
}

/** TOOL 프레임 하나가 말하는 것: 무엇을 어떤 인자로 불렀고, 왜 불렀는지. */
export type ToolCall = {
  tool: string
  /** 모델이 적은 이유. 거의 모든 tool 이 `thought` 를 인자로 받는다. */
  thought: string | null
  /**
   * 나머지 인자.
   *
   * `thought` 와 `step` 은 뺀다. 앞의 것은 행의 본문으로, 뒤의 것은 스텝 배지로 이미
   * 보이므로 펼쳐 봐야 할 것에 남겨 두면 같은 값을 두 번 읽게 한다.
   */
  args: Record<string, unknown>
}

export function toolCallOf(log: QaLog): ToolCall | null {
  const payload = asRecord(log.payload)
  if (payload === null) return null
  const tool = typeof payload.tool === 'string' ? payload.tool : null
  if (tool === null) return null

  const source = asRecord(payload.args) ?? {}
  const args: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key === 'thought' || key === 'step') continue
    args[key] = value
  }
  const thought = source.thought
  return {
    tool,
    thought: typeof thought === 'string' && thought.length > 0 ? thought : null,
    args,
  }
}

/**
 * TOOL_RESULT 가 실어 온 본문. tool 이 모델에게 돌려준 문자열 그대로다.
 *
 * 성패를 말하는 값이 없다. tool 은 문자열 하나를 돌려줄 뿐이라 Agent 도 지어내지 않았고,
 * 조작이 실제로 됐는지는 같은 왕복의 ACTION_RESULT 가 말한다.
 */
export function toolOutputOf(payload: unknown): string | null {
  const record = asRecord(payload)
  if (record === null) return null
  return typeof record.content === 'string' && record.content.length > 0 ? record.content : null
}

/** ACTION_RESULT 하나가 말하는 것: 몇 개가 돌았고 그중 몇 개가 실패했는지. */
export type ToolResultSummary = {
  total: number
  failed: number
  /** 첫 실패가 남긴 문구. 실패가 없거나 문구가 없으면 null. */
  firstError: string | null
}

/**
 * ACTION_RESULT payload 에서 요약을 뽑는다.
 *
 * `results` 배열이 없으면 null 이다. 그런 payload 는 SDK 가 아니라 중계가 만든 것이거나
 * 형태가 어긋난 것이므로, 지어내는 대신 요약 줄을 아예 그리지 않는다.
 */
export function toolResultSummary(payload: unknown): ToolResultSummary | null {
  const record = asRecord(payload)
  if (record === null) return null
  const results = record.results
  if (!Array.isArray(results)) return null

  let failed = 0
  let firstError: string | null = null
  for (const item of results) {
    const entry = asRecord(item)
    if (entry === null || entry.success === true) continue
    failed += 1
    if (firstError === null && typeof entry.error === 'string' && entry.error.length > 0) {
      firstError = entry.error
    }
  }

  return { total: results.length, failed, firstError }
}

/** 요약 한 줄. 색만으로는 못 읽으므로 성공과 실패를 글자로도 말한다. */
export function formatToolResult(summary: ToolResultSummary): string {
  const actions = summary.total === 1 ? '1 action' : `${summary.total} actions`
  if (summary.failed === 0) return `${actions} succeeded`
  const failure = `${summary.failed} of ${actions} failed`
  return summary.firstError === null ? failure : `${failure} · ${summary.firstError}`
}
