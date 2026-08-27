import assert from 'node:assert/strict'
import test from 'node:test'
import {
  anchorOf,
  buildTimelineRows,
  eventIdOf,
  formatPath,
  formatToolResult,
  hiddenLogTargets,
  newestOf,
  toolResultSummary,
} from './qaLogGrouping'
import type { QaLog, QaLogDirection, QaLogType } from './qaTypes'

function makeLog(
  id: string,
  type: QaLogType,
  direction: QaLogDirection,
  extra: Partial<QaLog> = {},
): QaLog {
  return {
    id,
    qaTryId: '1',
    messageId: null,
    correlationId: null,
    direction,
    type,
    message: '',
    payload: null,
    createdAt: '2026-08-27T00:00:00.000Z',
    ...extra,
  }
}

/**
 * Orchestration 이 tool 호출 하나에 남기는 두 줄.
 *
 * `agentMessageId` 는 Agent 가 딴 것이고, `outboundId` 는 SDK 로 나가는 로그가 제 id 를
 * messageId 로 다시 쓴 것이다. 결과는 이 `outboundId` 를 되돌려 준다.
 */
function actionLogs(agentMessageId: string, outboundId: string, message: string): QaLog[] {
  return [
    makeLog(`${outboundId}0`, 'ACTION', 'AGENT_TO_ORCHE', { messageId: agentMessageId, message }),
    makeLog(outboundId, 'ACTION', 'ORCHE_TO_SDK', {
      messageId: outboundId,
      correlationId: agentMessageId,
      message,
    }),
  ]
}

/** 그 호출에 SDK 가 답하는 두 줄. */
function actionResultLogs(
  agentMessageId: string,
  outboundId: string,
  results: { id: number; success: boolean; error?: string }[],
): QaLog[] {
  const payload = { requestId: Number(outboundId), results }
  return [
    makeLog(`${outboundId}1`, 'ACTION_RESULT', 'SDK_TO_ORCHE', {
      messageId: outboundId,
      correlationId: agentMessageId,
      message: 'Action result received.',
      payload,
    }),
    makeLog(`${outboundId}2`, 'ACTION_RESULT', 'ORCHE_TO_AGENT', {
      messageId: outboundId,
      correlationId: agentMessageId,
      message: 'Action result is available.',
      payload,
    }),
  ]
}

function gameStateLogs(id: string): QaLog[] {
  return [
    makeLog(`${id}1`, 'GAME_STATE', 'SDK_TO_ORCHE', { messageId: id, payload: { scene: id } }),
    makeLog(`${id}2`, 'GAME_STATE', 'ORCHE_TO_AGENT', { messageId: id, payload: { scene: id } }),
  ]
}

test('a tool call and its result become one row', () => {
  const logs = [
    ...actionLogs('a1', '10', 'Click Start'),
    ...actionResultLogs('a1', '10', [{ id: 1, success: true }]),
  ]

  const rows = buildTimelineRows(logs)

  assert.equal(rows.length, 1)
  assert.equal(newestOf(rows[0]).type, 'ACTION')
  assert.deepEqual(
    rows[0].events[0].result?.map((hop) => hop.id),
    ['101', '102'],
  )
})

test('game state frames between a call and its result do not break the pair', () => {
  const logs = [
    ...actionLogs('a1', '10', 'Click Start'),
    ...gameStateLogs('11'),
    ...gameStateLogs('12'),
    ...actionResultLogs('a1', '10', [{ id: 1, success: true }]),
  ]

  const rows = buildTimelineRows(logs)

  // 호출이 먼저, 그 사이에 흐른 상태가 뒤. 결과를 끌어와도 시간순은 그대로다.
  assert.deepEqual(
    rows.map((row) => newestOf(row).type),
    ['ACTION', 'GAME_STATE'],
  )
  assert.notEqual(rows[0].events[0].result, null)
  // 연속 GAME_STATE 는 여전히 한 행으로 접힌다.
  assert.equal(rows[1].events.length, 2)
})

test('a result whose call was not loaded stays a row of its own', () => {
  const rows = buildTimelineRows(actionResultLogs('a1', '10', [{ id: 1, success: true }]))

  assert.equal(rows.length, 1)
  assert.equal(newestOf(rows[0]).type, 'ACTION_RESULT')
  assert.equal(rows[0].events[0].result, null)
})

test('a result attaches to its own call, not to an earlier one', () => {
  const logs = [
    ...actionLogs('a1', '10', 'Click Start'),
    ...actionLogs('a2', '20', 'Click Next'),
    ...actionResultLogs('a2', '20', [{ id: 1, success: false, error: 'Element not found.' }]),
  ]

  const rows = buildTimelineRows(logs)

  assert.equal(rows.length, 2)
  assert.equal(rows[0].events[0].result, null)
  assert.equal(rows[1].events[0].result?.length, 2)
})

test('the row path shows the whole round trip once a result is attached', () => {
  const logs = [
    ...actionLogs('a1', '10', 'Click Start'),
    ...actionResultLogs('a1', '10', [{ id: 1, success: true }]),
  ]

  assert.equal(
    formatPath(buildTimelineRows(logs)[0].path),
    'Agent → Orchestration → SDK → Orchestration → Agent',
  )
})

test('a jump to a result log lands on the tool row that swallowed it', () => {
  const logs = [
    ...actionLogs('a1', '10', 'Click Start'),
    ...actionResultLogs('a1', '10', [{ id: 1, success: true }]),
  ]
  const rows = buildTimelineRows(logs)

  const targets = hiddenLogTargets(rows)

  // 행이 하나뿐이면 펼칠 것이 없고, 도착지는 그 행이 그리는 로그다.
  assert.deepEqual(targets.get('101'), { anchor: null, target: newestOf(rows[0]).id })
  assert.deepEqual(targets.get('102'), { anchor: null, target: newestOf(rows[0]).id })
})

test('a jump into a folded run names the row to expand and the event inside it', () => {
  const repeated = (id: string) =>
    makeLog(id, 'LOG', 'ORCHE_TO_AGENT', { message: 'Same note', payload: { note: 1 } })
  const rows = buildTimelineRows([repeated('1'), repeated('2')])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].events.length, 2)

  const targets = hiddenLogTargets(rows)

  assert.deepEqual(targets.get('1'), { anchor: anchorOf(rows[0]), target: eventIdOf(rows[0].events[0]) })
  assert.deepEqual(targets.get('2'), { anchor: anchorOf(rows[0]), target: eventIdOf(rows[0].events[1]) })
})

test('the result summary counts failures and quotes the first error', () => {
  assert.deepEqual(toolResultSummary({ results: [{ id: 1, success: true }] }), {
    total: 1,
    failed: 0,
    firstError: null,
  })

  assert.deepEqual(
    toolResultSummary({
      results: [
        { id: 1, success: true },
        { id: 2, success: false, error: 'Element not found.' },
        { id: 3, success: false },
      ],
    }),
    { total: 3, failed: 2, firstError: 'Element not found.' },
  )
})

test('a payload carrying no results array gets no summary', () => {
  assert.equal(toolResultSummary(null), null)
  assert.equal(toolResultSummary({ message: 'done' }), null)
})

test('the summary line says the outcome in words', () => {
  assert.equal(formatToolResult({ total: 1, failed: 0, firstError: null }), '1 action succeeded')
  assert.equal(formatToolResult({ total: 3, failed: 0, firstError: null }), '3 actions succeeded')
  assert.equal(
    formatToolResult({ total: 3, failed: 2, firstError: 'Element not found.' }),
    '2 of 3 actions failed · Element not found.',
  )
  assert.equal(formatToolResult({ total: 2, failed: 1, firstError: null }), '1 of 2 actions failed')
})
