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
  outcomeHeadOf,
  toolCallOf,
  verdictOf,
  toolOutputOf,
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

test('an action and its result become one row', () => {
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

test('game state frames between an action and its result do not break the pair', () => {
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

test('a jump to an action result lands on the action row that swallowed it', () => {
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

// --- tool 호출 -----------------------------------------------------------------
//
// Agent 가 부르는 tool 하나와 그 답. 조작 tool 은 여기에 더해 SDK 로 나가는 ACTION 도
// 남기므로, 두 쌍이 한 런에 섞여 흐른다.

/** Agent 가 tool 호출 하나를 남기는 프레임. correlation 은 답이 들고 온다. */
function toolLog(id: string, tool: string, args: Record<string, unknown>): QaLog {
  return makeLog(id, 'TOOL', 'AGENT_TO_ORCHE', {
    messageId: `msg-${id}`,
    message: tool,
    payload: { message: tool, tool, tool_call_id: `call-${id}`, args, step: args.step },
  })
}

function toolResultLog(id: string, callId: string, tool: string, content: string): QaLog {
  return makeLog(id, 'TOOL_RESULT', 'AGENT_TO_ORCHE', {
    messageId: `msg-${id}`,
    correlationId: `msg-${callId}`,
    message: tool,
    payload: { message: tool, tool, tool_call_id: `call-${callId}`, content },
  })
}

test('a tool call and its answer become one row', () => {
  const logs = [
    toolLog('1', 'search_knowledge', { step: 2, query: '보스전 진입 조건', thought: '규칙이 애매하다' }),
    toolResultLog('2', '1', 'search_knowledge', '2 entries found.'),
  ]

  const rows = buildTimelineRows(logs)

  assert.equal(rows.length, 1)
  assert.equal(newestOf(rows[0]).type, 'TOOL')
  assert.deepEqual(
    rows[0].events[0].result?.map((hop) => hop.id),
    ['2'],
  )
})

test('a tool answer does not attach to an action, nor an action result to a tool', () => {
  // 조작 한 번이 남기는 네 줄이 섞여 흐른다. 층을 가리지 않으면 tool 의 답이 액션에 붙는다.
  const logs = [
    toolLog('1', 'click_button', { step: 1, target_id: 12, thought: '시작을 누른다' }),
    ...actionLogs('a1', '10', 'Clicking 12'),
    ...actionResultLogs('a1', '10', [{ id: 1, success: true }]),
    toolResultLog('2', '1', 'click_button', '  button_click: ok'),
  ]

  const rows = buildTimelineRows(logs)

  assert.deepEqual(
    rows.map((row) => newestOf(row).type),
    ['TOOL', 'ACTION'],
  )
  // tool 행에는 tool 의 답이, 액션 행에는 SDK 의 답이 붙는다.
  assert.deepEqual(rows[0].events[0].result?.map((hop) => hop.id), ['2'])
  assert.deepEqual(rows[1].events[0].result?.map((hop) => hop.id), ['101', '102'])
})

test('two tool calls keep their own answers', () => {
  const logs = [
    toolLog('1', 'observe_scene', { step: 1, thought: '화면을 본다' }),
    toolLog('2', 'report_step', { step: 1, thought: '판정한다' }),
    toolResultLog('3', '2', 'report_step', '1 step(s) left'),
    toolResultLog('4', '1', 'observe_scene', 'scene: Lobby'),
  ]

  const rows = buildTimelineRows(logs)

  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0].events[0].result?.map((hop) => hop.id), ['4'])
  assert.deepEqual(rows[1].events[0].result?.map((hop) => hop.id), ['3'])
})

test('a jump to a tool answer lands on the call that swallowed it', () => {
  const rows = buildTimelineRows([
    toolLog('1', 'observe_scene', { step: 1, thought: '화면을 본다' }),
    toolResultLog('2', '1', 'observe_scene', 'scene: Lobby'),
  ])

  assert.deepEqual(hiddenLogTargets(rows).get('2'), {
    anchor: null,
    target: newestOf(rows[0]).id,
  })
})

test('the call reads its tool, its reason, and the arguments worth expanding', () => {
  const call = toolCallOf(
    toolLog('1', 'search_knowledge', { step: 2, query: '보스전', thought: '규칙이 애매하다' }),
  )

  assert.equal(call?.tool, 'search_knowledge')
  assert.equal(call?.thought, '규칙이 애매하다')
  // `thought` 는 행의 본문으로, `step` 은 배지로 이미 보인다. 펼칠 것에 남기면 두 번 읽는다.
  assert.deepEqual(call?.args, { query: '보스전' })
})

test('a frame that names no tool is not read as a call', () => {
  assert.equal(toolCallOf(makeLog('1', 'LOG', 'ORCHE_TO_AGENT')), null)
  assert.equal(
    toolCallOf(makeLog('1', 'TOOL', 'AGENT_TO_ORCHE', { payload: { args: {} } })),
    null,
  )
})

test('the answer body is the string the tool returned', () => {
  assert.equal(toolOutputOf({ content: 'scene: Lobby' }), 'scene: Lobby')
  assert.equal(toolOutputOf({ content: '' }), null)
  assert.equal(toolOutputOf(null), null)
})

test('the outcome head is what the tool said before it dumped the screen', () => {
  // `click` 이 실제로 돌려준 모양. 결과 세 줄 뒤에 `<<pulse>>` 덤프가 붙는다.
  assert.equal(
    outcomeHeadOf(
      [
        '  move_mouse: ok',
        '  mouse_down: 닿은 것 없음 — 그 자리에 누를 것이 없다',
        '  mouse_up: ok',
        '',
        '<<pulse>>',
        'reading 41 · frame 3309 · scene Map_scene',
        'could not read: 514',
      ].join('\n'),
    ),
    'move_mouse: ok · mouse_down: 닿은 것 없음 — 그 자리에 누를 것이 없다 · mouse_up: ok',
  )
})

test('the outcome head stops at the content map, which is not an outcome', () => {
  assert.equal(
    outcomeHeadOf(
      [
        'Recorded. 20 step(s) left — continue with step 2.',
        '',
        'content map: you are on screen 33 of Map_scene',
        '  told apart by: Canvas[7]/Button (Legacy)[0] on',
      ].join('\n'),
    ),
    'Recorded. 20 step(s) left — continue with step 2.',
  )
})

test('a tool failure is kept whole, because that is the line worth reading', () => {
  assert.equal(
    outcomeHeadOf('  key_click: FAILED — key_click requires params [keyCode, positiveDurationSeconds].'),
    'key_click: FAILED — key_click requires params [keyCode, positiveDurationSeconds].',
  )
})

test('the outcome head is null when the tool said nothing of its own', () => {
  assert.equal(outcomeHeadOf(''), null)
  assert.equal(outcomeHeadOf('<<pulse>>\nreading 41'), null)
  assert.equal(outcomeHeadOf(null), null)
})

test('a long outcome head is cut, because the flow row holds one line', () => {
  const head = outcomeHeadOf('x'.repeat(400))
  assert.equal(head?.length, 160)
  assert.ok(head?.endsWith('…'))
})

test('a step report says its verdict, not the prompt text the tool echoed back', () => {
  const call = toolCallOf(
    toolLog('1', 'report_step', {
      step: 3,
      passed: false,
      thought: '적 HP 가 변했는지 본다',
      message: '적 HP 표시가 10에서 변하지 않았다',
    }),
  )

  assert.deepEqual(verdictOf(call), { passed: false, message: '적 HP 표시가 10에서 변하지 않았다' })
})

test('only a step report carries a verdict', () => {
  assert.equal(verdictOf(toolCallOf(toolLog('1', 'click', { step: 1, thought: '누른다' }))), null)
  assert.equal(verdictOf(null), null)
})

test('a step report without a verdict flag is not read as one', () => {
  // `passed` 가 없으면 통과인지 실패인지 지어낼 수 없다. 그때는 결과 머리로 돌아간다.
  assert.equal(verdictOf(toolCallOf(toolLog('1', 'report_step', { step: 1, thought: '적는다' }))), null)
})

test('a verdict with no message is still a verdict', () => {
  assert.deepEqual(
    verdictOf(toolCallOf(toolLog('1', 'report_step', { step: 1, passed: true, thought: '적는다' }))),
    { passed: true, message: null },
  )
})
