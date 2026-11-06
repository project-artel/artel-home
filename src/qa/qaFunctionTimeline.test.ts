import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  barPlacement,
  buildBehaviorLanes,
  cheatNamesOf,
  usedCheatsOf,
} from './qaFunctionTimeline'
import type { QaLog, QaLogDirection, QaLogType } from './qaTypes'

function makeLog(
  id: string,
  type: QaLogType,
  direction: QaLogDirection,
  second: number,
  payload: unknown,
): QaLog {
  return {
    id,
    qaTryId: '1',
    messageId: null,
    correlationId: null,
    direction,
    type,
    message: '',
    payload,
    createdAt: new Date(Date.UTC(2026, 9, 14, 8, 0, second)).toISOString(),
  }
}

function startAction(id: string, second: number, actionId: number, params: Record<string, unknown>): QaLog {
  return makeLog(id, 'ACTION', 'ORCHE_TO_SDK', second, {
    actions: [{ id: actionId, jsonrpc: '2.0', method: 'start_behavior', params: [params] }],
  })
}

function startResult(id: string, second: number, requestId: string, actionId: number, returnValue: unknown): QaLog {
  return makeLog(id, 'ACTION_RESULT', 'SDK_TO_ORCHE', second, {
    requestId: Number(requestId),
    results: [{ id: actionId, success: true, returnValue }],
  })
}

function ended(id: string, second: number, fields: Record<string, unknown>): QaLog {
  return makeLog(id, 'BEHAVIOR_ENDED', 'SDK_TO_ORCHE', second, { name: 'auto_attack', target: null, ...fields })
}

describe('cheatNamesOf', () => {
  it('invoke_cheat 를 담은 ACTION 행에서 cheat 이름을 읽는다', () => {
    const log = makeLog('10', 'ACTION', 'ORCHE_TO_SDK', 0, {
      actions: [
        { id: 1, jsonrpc: '2.0', method: 'invoke_cheat', params: [{ name: 'give_gold', args: { amount: 500 } }] },
        { id: 2, jsonrpc: '2.0', method: 'press_key', params: [{ key: 'A' }] },
      ],
    })
    assert.deepEqual(cheatNamesOf(log), ['give_gold'])
  })

  it('ACTION 이 아니거나 cheat 호출이 없으면 빈 목록이다', () => {
    const other = makeLog('11', 'ACTION', 'ORCHE_TO_SDK', 0, { actions: [{ id: 1, method: 'press_key', params: [] }] })
    const result = makeLog('12', 'ACTION_RESULT', 'SDK_TO_ORCHE', 0, { actions: [] })
    assert.deepEqual(cheatNamesOf(other), [])
    assert.deepEqual(cheatNamesOf(result), [])
    assert.deepEqual(cheatNamesOf(makeLog('13', 'ACTION', 'ORCHE_TO_SDK', 0, null)), [])
  })
})

describe('usedCheatsOf', () => {
  it('STATUS 의 used_cheats 를 읽는다', () => {
    const used = usedCheatsOf({
      step: 2,
      used_cheats: [
        { name: 'give_gold', args: { amount: 500 }, target: null, success: true },
        { name: 'skip_level', args: {}, target: 'Root[0]', success: false },
      ],
    })
    assert.deepEqual(used, [
      { name: 'give_gold', success: true, target: null },
      { name: 'skip_level', success: false, target: 'Root[0]' },
    ])
  })

  it('필드가 없거나 비어 있는 옛 STATUS 는 빈 목록이다', () => {
    assert.deepEqual(usedCheatsOf({ step: 2 }), [])
    assert.deepEqual(usedCheatsOf({ used_cheats: [] }), [])
    assert.deepEqual(usedCheatsOf(null), [])
  })

  it('이름이 없는 항목은 버린다', () => {
    assert.deepEqual(usedCheatsOf({ used_cheats: [{ success: true }, 'x']}), [])
  })
})

describe('buildBehaviorLanes', () => {
  it('시작과 종료를 behaviorId 로 이어 한 막대를 만든다', () => {
    const lanes = buildBehaviorLanes([
      startAction('100', 0, 5, { name: 'auto_attack', maxSeconds: 30 }),
      startResult('101', 1, '100', 5, { behaviorId: 7, report: null }),
      ended('102', 13, { behaviorId: 7, reason: 'completed', detail: 'no enemy in range', seconds: 12.4 }),
    ])

    assert.equal(lanes.lanes.length, 1)
    const [bar] = lanes.lanes[0].bars
    assert.equal(bar.behaviorId, 7)
    assert.equal(bar.reason, 'completed')
    assert.equal(bar.tone, 'success')
    assert.equal(bar.detail, 'no enemy in range')
    assert.equal(bar.endMs! - bar.startMs, 13_000)
    assert.equal(bar.startLogId, '100')
  })

  it('끝나지 않은 behavior 는 running 이고 구간은 마지막 로그까지 이어진다', () => {
    const lanes = buildBehaviorLanes([
      startAction('100', 0, 5, { name: 'auto_attack' }),
      startResult('101', 1, '100', 5, { behaviorId: 7, report: 'target=Slime hp=4' }),
      makeLog('102', 'GAME_STATE', 'SDK_TO_ORCHE', 20, null),
    ])

    const [bar] = lanes.lanes[0].bars
    assert.equal(bar.endMs, null)
    assert.equal(bar.tone, 'running')
    assert.equal(bar.report, 'target=Slime hp=4')
    assert.equal(lanes.endMs - lanes.startMs, 20_000)
  })

  it('시작에 실패한 호출은 막대가 아니다', () => {
    const lanes = buildBehaviorLanes([
      startAction('100', 0, 5, { name: 'auto_attack' }),
      makeLog('101', 'ACTION_RESULT', 'SDK_TO_ORCHE', 1, {
        requestId: 100,
        results: [{ id: 5, success: false, error: 'too many behaviors running: a, b' }],
      }),
    ])
    assert.deepEqual(lanes.lanes, [])
  })

  it('종료 행만 있으면 seconds 만큼 앞을 시작으로 둔다', () => {
    const lanes = buildBehaviorLanes([ended('200', 30, { behaviorId: 9, reason: 'timeout', seconds: 10 })])
    const [bar] = lanes.lanes[0].bars
    assert.equal(bar.endMs! - bar.startMs, 10_000)
    assert.equal(bar.tone, 'warning')
    assert.equal(bar.startLogId, null)
  })

  it('에이전트 쪽 사본 ACTION 은 시작으로 세지 않는다', () => {
    const copy = makeLog('99', 'ACTION', 'AGENT_TO_ORCHE', 0, {
      actions: [{ id: 5, jsonrpc: '2.0', method: 'start_behavior', params: [{ name: 'auto_attack' }] }],
    })
    const lanes = buildBehaviorLanes([copy, startAction('100', 0, 5, { name: 'auto_attack' })])
    assert.equal(lanes.lanes[0].bars.length, 1)
  })

  it('같은 behavior 라도 대상이 다르면 줄이 갈린다', () => {
    const lanes = buildBehaviorLanes([
      startAction('100', 0, 1, { name: 'flee', target: 'Root[0]/P[1]' }),
      startAction('101', 1, 2, { name: 'flee', target: 'Root[0]/P[2]' }),
    ])
    assert.equal(lanes.lanes.length, 2)
  })

  it('reason 별로 색 분류를 가른다', () => {
    const toneOf = (reason: string) =>
      buildBehaviorLanes([ended('1', 5, { behaviorId: 1, reason, seconds: 1 })]).lanes[0].bars[0].tone
    assert.equal(toneOf('completed'), 'success')
    assert.equal(toneOf('failed'), 'critical')
    assert.equal(toneOf('stopped'), 'neutral')
    assert.equal(toneOf('unavailable'), 'warning')
    assert.equal(toneOf('never_seen'), 'neutral')
  })

  it('이 기능 이전의 run 은 막대가 없다', () => {
    assert.deepEqual(buildBehaviorLanes([makeLog('1', 'GAME_STATE', 'SDK_TO_ORCHE', 0, null)]).lanes, [])
  })
})

describe('barPlacement', () => {
  it('전체 구간 대비 퍼센트로 놓고 너무 짧은 막대는 보이는 폭을 준다', () => {
    const bar = buildBehaviorLanes([ended('1', 10, { behaviorId: 1, reason: 'completed', seconds: 5 })]).lanes[0].bars[0]
    const placement = barPlacement(bar, bar.startMs - 5_000, bar.startMs + 20_000)
    assert.equal(placement.left, 20)
    assert.equal(placement.width, 20)

    const instant = barPlacement({ ...bar, endMs: bar.startMs }, bar.startMs - 100_000, bar.startMs + 100_000)
    assert.ok(instant.width >= 0.8)
  })
})
