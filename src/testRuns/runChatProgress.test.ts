import assert from 'node:assert/strict'
import test from 'node:test'
import { AUTHORING_STAGES, STAGE_STALL_MS, parseRunStreamEvent } from './runChatApi'

/**
 * 진행 표시를 워크플로 노드 기준으로 읽는다(ARTEL-952).
 *
 * 왜 바꿨나. 런 87 trace(2026-10-06)에서 턴 하나에 진행 줄이 둘뿐이었고 그 사이가
 * **50.3초**(묶기)와 **54.2초**(문장 쓰기 한 묶음)였다. 그리고 마지막 턴은 일을 다 끝낸 뒤
 * 답만 못 내보내고 죽었는데, 화면은 16시간 48분 뒤에도 같았다 — 느린 것과 죽은 것을
 * 구분할 방법이 없었다.
 */

test('Agent 가 보내는 노드 단계를 다 알아본다', () => {
  // Agent `app/agents/scenario/progress.py` 가 내보내는 값. 한쪽만 고치면 그 줄이 버려진다.
  for (const wire of ['grouping', 'grouped', 'bridging', 'writing', 'saving', 'modifying']) {
    const parsed = parseRunStreamEvent(JSON.stringify({ type: 'progress', stage: wire }))
    assert.notEqual(parsed, null, `${wire} 를 못 읽는다 — 그 줄은 화면에 안 나온다`)
  }
})

test('문장 쓰기의 분자와 분모를 읽는다', () => {
  const parsed = parseRunStreamEvent(
    JSON.stringify({ type: 'progress', stage: 'writing', done: 3, total: 7 }),
  )
  assert.deepEqual(parsed, { type: 'progress', stage: 'writing', done: 3, total: 7 })
})

test('셀 것이 없으면 수를 안 만든다', () => {
  // 서버는 null 을 실어 보내고(그 DTO 는 null 을 그대로 싣는다), 옛 서버는 칸이 없다.
  // 둘 다 "셀 것이 없다" 로 같게 읽혀야 한다 — `0` 으로 읽으면 "0개 중 0번째" 를 그린다.
  for (const frame of [
    { type: 'progress', stage: 'grouping', done: null, total: null },
    { type: 'progress', stage: 'grouping' },
  ]) {
    const parsed = parseRunStreamEvent(JSON.stringify(frame))
    assert.deepEqual(parsed, { type: 'progress', stage: 'grouping', done: undefined, total: undefined })
  }
})

test('모르는 단계는 버린다', () => {
  // 단계는 알리는 것이지 시키는 것이 아니다. 새 단계를 받아 터지느니 그 줄만 없는 편이 낫다.
  assert.equal(parseRunStreamEvent(JSON.stringify({ type: 'progress', stage: '없는단계' })), null)
})

test('모든 단계에 끊김 한도가 있다', () => {
  // 한도가 빠진 단계는 **영원히 기다린다** — 그것이 런 87 에서 일어난 일이다.
  for (const stage of AUTHORING_STAGES) {
    assert.equal(typeof STAGE_STALL_MS[stage], 'number', `${stage} 에 한도가 없다`)
  }
})

test('끝난 단계는 끊김을 재지 않는다', () => {
  // 턴이 끝난 뒤에도 시계를 돌리면 멀쩡히 끝난 판에 "끊겼다" 가 붙는다.
  assert.equal(Number.isFinite(STAGE_STALL_MS.saved), false)
  assert.equal(Number.isFinite(STAGE_STALL_MS.blocked), false)
})

test('한도는 노드가 걸리는 시간에 비례한다', () => {
  // 한 값으로 두면 둘 중 하나가 틀린다 — 라우터는 0.24초이고 문장 쓰기는 묶음 하나에
  // 29~54초다(실측). 전량 저작 한 판이 141초이므로 90초 한 값은 정상 턴을 끊긴 것으로 부른다.
  assert.ok(STAGE_STALL_MS.writing > STAGE_STALL_MS.saving)
  assert.ok(STAGE_STALL_MS.grouping > STAGE_STALL_MS.grouped)
  // 실측(54.2초)의 세 배 남짓. 느린 날을 끊긴 것으로 부르는 쪽이 끊긴 것을 느리다고 부르는
  // 쪽보다 나쁘다 — 앞은 멀쩡한 턴을 버리게 하고, 뒤는 16시간을 기다리게 했다.
  assert.ok(STAGE_STALL_MS.writing >= 150_000)
})
