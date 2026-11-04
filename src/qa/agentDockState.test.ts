import assert from 'node:assert/strict'
import test from 'node:test'
import { agentHistoryComplete, agentOptions, deriveAgentDock, isAgentLog, isAgentRun } from './agentDockState'
import type { QaLog } from './qaTypes'

let id = 0
function log(type: string, payload: Record<string, unknown>): QaLog {
  id += 1
  return { id: String(id), type, payload, createdAt: '2026-11-03T00:00:00Z' } as unknown as QaLog
}
const writing = (step: number, replan = false, again = false) =>
  log('LOG', { step: String(step), message: `Step ${step}${replan ? ' (replan)' : ''}: the planner is writing macros${again ? ' again (the last answer was refused)' : ''}. Prompt v16.` })
const plan = (step: number, actions: string[], kind = 'step_macros') =>
  log('LOG', { kind, step, message: 'plan', decision: { summary: `요약 ${actions.length}`, actions, facts: ['word_hp'], source: 'def done() -> bool:\n    return scene() == "GameClearScene"\n' } })
const turn = (step: number, number: number, extra: Record<string, unknown> = {}) =>
  log('LOG', { kind: 'turn', step, turn: { turn: number, scene: 'TurnBattleScene', picked: 'developer:battle_end_turn', options: ['developer:battle_end_turn', 'REPLAN'], result: 'effect_met', ...extra } })
const evidence = (step: number, reads: number) => log('LOG', { kind: 'evidence', step, message: `Step ${step}: game values read ${reads} times` })
const refused = (step: number) =>
  log('LOG', { kind: 'replan_macros_refused', step, message: `Step ${step} (replan): the macros were refused (answer 1 of 3): x`, decision: { refusal: 'MACRO_NODE_REJECTED — `battle_place_card` appears twice in the ```developer block.' } })
const verdict = (step: number, status = 'COMPLETED') =>
  log('STATUS', { step, status, message: '통과했다. (executer 중단: step budget 480s)', played: { stopped: 'step budget 480s' }, verdict: {} })

test('행동 중인 에이전트와 넘어가는 것을 로그 순서대로 따라간다', () => {
  const logs = [writing(7)]
  assert.equal(deriveAgentDock(logs, true).active, 'planner')
  assert.deepEqual(deriveAgentDock(logs, true).status, { kind: 'writing' })

  logs.push(plan(7, ['developer:a', 'developer:b']))
  let dock = deriveAgentDock(logs, true)
  assert.deepEqual(dock.edge, { kind: 'plan', plan: 1, actions: 2 })
  assert.equal(dock.plan?.summary, '요약 2')

  logs.push(turn(7, 3))
  dock = deriveAgentDock(logs, true)
  assert.equal(dock.active, 'executor')
  assert.equal(dock.edge, null)
  assert.equal(dock.turn?.turn, 3)
  assert.equal(dock.plan?.number, 1, '계획은 Executor 가 행동하는 동안에도 남는다')
})

test('재계획은 evidence 를 Planner 로 되돌리고 거절 사유를 보인다', () => {
  const logs = [plan(7, ['developer:a']), turn(7, 0), evidence(7, 77), writing(7, true)]
  let dock = deriveAgentDock(logs, true)
  assert.equal(dock.active, 'planner')
  assert.deepEqual(dock.edge, { kind: 'replan', reads: 77 })
  assert.equal(dock.turn, null, '지난 행동은 남기지 않는다')

  logs.push(refused(7))
  dock = deriveAgentDock(logs, true)
  assert.deepEqual(dock.refusal, { answer: '1/3', reason: '`battle_place_card` appears twice in the developer block.' })

  logs.push(writing(7, true, true))
  assert.notEqual(deriveAgentDock(logs, true).refusal, null)

  logs.push(plan(7, ['developer:a', 'developer:b'], 'replan_macros'))
  dock = deriveAgentDock(logs, true)
  assert.equal(dock.plan?.number, 2)
  assert.equal(dock.refusal, null)
})

test('evidence 뒤에 재계획이 없으면 Evaluator 차례이고 다음 step 이 시작하면 창을 비운다', () => {
  const logs = [plan(6, ['developer:a']), evidence(6, 3)]
  let dock = deriveAgentDock(logs, true)
  assert.equal(dock.active, 'evaluator')
  assert.deepEqual(dock.edge, { kind: 'evaluate', reads: 3 })

  logs.push(verdict(6))
  dock = deriveAgentDock(logs, true)
  assert.deepEqual(dock.status, { kind: 'judged' })
  assert.deepEqual(dock.verdict, { step: 6, passed: true, message: '통과했다.', stopped: 'step budget 480s' })

  logs.push(writing(7))
  dock = deriveAgentDock(logs, true)
  assert.equal(dock.step, 7)
  assert.equal(dock.plan, null, '새 step 이면 앞 step 의 계획을 지운다')
  assert.equal(dock.verdict, null, '앞 step 의 판정도 지운다')
  assert.equal(dock.turn, null)
})

test('목표를 이뤄 끝난 step 은 중단으로 적지 않는다', () => {
  const done = log('STATUS', { step: 1, status: 'COMPLETED', message: '통과했다.', played: { stopped: 'done' } })
  assert.equal(deriveAgentDock([done], true).verdict?.stopped, null)
})

test('끝난 런은 내용만 남기고 아무도 행동 중으로 그리지 않는다', () => {
  const dock = deriveAgentDock([plan(1, ['developer:a']), turn(1, 0), verdict(1, 'FAILED')], false)
  assert.equal(dock.active, null)
  assert.equal(dock.edge, null)
  assert.equal(dock.verdict?.passed, false)
  assert.equal(dock.plan?.number, 1)
})

test('점수가 있으면 큰 순서로, 없으면 받은 선택지 그대로 보인다', () => {
  const scored = deriveAgentDock([turn(1, 0, { confidence: 0.45, probabilities: { REPLAN: 0.1, 'developer:battle_end_turn': 0.9, bad: 'x' } })], true).turn
  assert.equal(scored?.confidence, 0.45)
  assert.deepEqual(agentOptions(scored!), [
    { name: 'developer:battle_end_turn', probability: 0.9, picked: true },
    { name: 'REPLAN', probability: 0.1, picked: false },
  ])
  const plain = deriveAgentDock([turn(1, 0)], true).turn
  assert.equal(plain?.confidence, null)
  assert.deepEqual(agentOptions(plain!).map((option) => option.probability), [null, null])
})

test('action_timing 은 읽지 않고 런 종류와 거슬러 받을 범위를 가른다', () => {
  const timing = log('LOG', { event: 'action_timing' })
  assert.equal(isAgentLog(timing), false)
  assert.equal(isAgentRun([timing]), false)
  assert.equal(isAgentRun([turn(1, 0)]), true)
  assert.equal(isAgentRun([writing(1)]), true, '첫 계획을 쓰는 동안에도 창이 보인다')
  assert.equal(isAgentRun([log('TOOL', { tool: 'report_step' }), log('LOG', { message: 'tool loop' }), verdict(1)]), false, '다른 엔진의 런')
  assert.equal(agentHistoryComplete([turn(7, 1)]), false, '지금 계획을 아직 못 봤다')
  assert.equal(agentHistoryComplete([plan(7, []), turn(7, 1)]), false, '앞 계획이 더 있을 수 있다')
  assert.equal(agentHistoryComplete([verdict(6), plan(7, []), turn(7, 1)]), true)
})
