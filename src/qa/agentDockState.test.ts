import assert from 'node:assert/strict'
import test from 'node:test'
import { agentGoals, agentHistoryComplete, agentOptions, deriveAgentDock, deriveStepSegments, isAgentLog, isAgentRun } from './agentDockState'
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
  assert.deepEqual(dock.status, { kind: 'handoff', plan: 1 })
  assert.equal(dock.plan?.summary, '요약 2')
  assert.deepEqual(dock.plan?.covers, [7])

  logs.push(turn(7, 3))
  dock = deriveAgentDock(logs, true)
  assert.equal(dock.active, 'executor')
  assert.equal(dock.turn?.turn, 3)
  assert.equal(dock.plan?.number, 1, '계획은 Executor 가 행동하는 동안에도 남는다')
})

test('재계획은 Planner 차례로 되돌리고 거절 사유를 보인다', () => {
  const logs = [plan(7, ['developer:a']), turn(7, 0), evidence(7, 77), writing(7, true)]
  let dock = deriveAgentDock(logs, true)
  assert.equal(dock.active, 'planner')
  assert.deepEqual(dock.status, { kind: 'replanning' })
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

test('판정은 뒤에서 와도 지금 step 을 건드리지 않고 step 번호를 단다', () => {
  const logs = [plan(6, ['developer:a']), evidence(6, 3)]
  let dock = deriveAgentDock(logs, true)
  assert.deepEqual(dock.status, { kind: 'finished' })
  assert.deepEqual(dock.pending, { step: 6, played: true }, '실행이 끝나 판정을 기다린다')

  logs.push(writing(7), plan(7, ['developer:b']), turn(7, 0))
  dock = deriveAgentDock(logs, true)
  assert.equal(dock.step, 7)
  assert.equal(dock.plan?.step, 7, '새 step 이면 앞 step 의 계획을 지운다')
  assert.equal(dock.verdict, null)
  assert.deepEqual(dock.pending, { step: 6, played: true }, 'step 7 이 돌아도 판정을 기다리는 것은 step 6 이다')

  logs.push(verdict(6))
  dock = deriveAgentDock(logs, true)
  assert.deepEqual(dock.verdict, { step: 6, passed: true, message: '통과했다.', stopped: 'step budget 480s' })
  assert.equal(dock.step, 7, '늦게 온 판정은 지금 step 을 바꾸지 않는다')
  assert.equal(dock.turn?.turn, 0, '지금 step 의 turn 도 남는다')
  assert.equal(dock.active, 'executor')
  assert.deepEqual(dock.pending, { step: 7, played: false }, '다음 판정은 실행 중인 step 7')

  logs.push(writing(8))
  assert.equal(deriveAgentDock(logs, true).verdict?.step, 6, '판정은 다음 step 으로 넘어가도 남는다')
})

test('목표를 이뤄 끝난 step 은 중단으로 적지 않는다', () => {
  const done = log('STATUS', { step: 1, status: 'COMPLETED', message: '통과했다.', played: { stopped: 'done' } })
  assert.equal(deriveAgentDock([done], true).verdict?.stopped, null)
})

test('끝난 런은 내용만 남기고 아무도 행동 중으로 그리지 않는다', () => {
  const dock = deriveAgentDock([plan(1, ['developer:a']), turn(1, 0), verdict(1, 'FAILED')], false)
  assert.equal(dock.active, null)
  assert.equal(dock.pending, null)
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

const segmentPlan = (step: number, segment: Record<string, string[]> | null) =>
  log('LOG', {
    kind: 'step_macros',
    step,
    message: 'plan',
    decision: {
      summary: '요약',
      actions: ['developer:advance_dialogue'],
      goals: [
        { name: 'test_dialogue', goal: '대사를 넘긴다' },
        { name: 'finish_story', goal: '마지막 대사까지 읽는다' },
        { name: 'enter_map', goal: '맵으로 간다' },
      ],
      segment: segment === null ? null : Object.fromEntries(Object.entries(segment).map(([key, goals]) => [key, { goals, actions: [] }])),
    },
  })
const segmentStep = (step: number, goals: string[]) =>
  log('LOG', { kind: 'segment_step', step, message: `Step ${step}: played with the plan written for the earlier step`, decision: { goals } })
const doneTurn = (step: number, number: number) => log('LOG', { kind: 'turn', step, turn: { turn: number, step, done: true, scene: 'StoryScene' } })

test('한 계획이 맡은 step 들을 묶음으로 만들고 새 계획이 앞 묶음을 끊는다', () => {
  const segment = { '3': ['test_dialogue'], '4': ['finish_story'], '5': ['enter_map'] }
  const logs = [plan(1, ['developer:a']), segmentPlan(3, segment), segmentStep(4, ['finish_story'])]
  assert.deepEqual(deriveStepSegments(logs), [{ planStep: 3, steps: [3, 4, 5] }], '이 step 만 맡은 계획은 묶음이 아니다')

  logs.push(plan(5, ['developer:b']))
  assert.deepEqual(deriveStepSegments(logs), [{ planStep: 3, steps: [3, 4] }], 'step 5 에서 계획을 새로 쓰면 앞 묶음은 step 4 까지다')

  const old = [plan(6, ['developer:a']), segmentStep(7, []), segmentStep(8, [])]
  assert.deepEqual(deriveStepSegments(old), [{ planStep: 6, steps: [6, 7, 8] }], 'segment 가 없는 계획도 segment_step 으로 묶는다')
  assert.deepEqual(deriveStepSegments([plan(6, []), plan(6, [])]), [], '같은 step 에서 다시 쓴 계획')
})

test('segment_step 의 step 은 앞 계획을 이어 쓰고 지금 goal 과 앞 goal 을 가른다', () => {
  const segment = { '3': ['test_dialogue'], '4': ['finish_story'], '5': ['enter_map'] }
  const logs = [segmentPlan(3, segment), turn(3, 0, { goal: 'test_dialogue' }), evidence(3, 2), segmentStep(4, ['finish_story'])]
  let dock = deriveAgentDock(logs, true)
  assert.equal(dock.step, 4)
  assert.deepEqual(dock.status, { kind: 'reusing' })
  assert.equal(dock.plan?.step, 3, '계획은 step 3 에서 쓴 것이다')
  assert.deepEqual(dock.plan?.covers, [3, 4, 5])
  assert.deepEqual(agentGoals(dock).map((goal) => [goal.name, goal.step, goal.state]), [
    ['test_dialogue', 3, 'done'],
    ['finish_story', 4, 'current'],
    ['enter_map', 5, 'next'],
  ], 'turn 이 없으면 이 step 의 첫 goal 이 지금 것이다')

  logs.push(doneTurn(4, 0))
  dock = deriveAgentDock(logs, true)
  assert.equal(dock.done, true)
  assert.deepEqual(agentGoals(dock).map((goal) => goal.state), ['done', 'done', 'next'], 'done 이면 이 step 의 goal 까지 이룬 것이다')

  logs.push(segmentStep(5, ['enter_map']), turn(5, 0, { goal: 'enter_map' }))
  dock = deriveAgentDock(logs, true)
  assert.equal(dock.done, false, 'done 은 step 마다 새로 센다')
  assert.deepEqual(agentGoals(dock).map((goal) => goal.state), ['done', 'done', 'current'])
  assert.deepEqual(agentGoals(deriveAgentDock([plan(1, ['developer:a'])], true)), [], 'goals 가 없는 옛 런은 요약으로 보인다')
})

test('done 만 담은 turn 은 앞 행동을 지우지 않고 같은 행동이 이어지면 센다', () => {
  const logs = [
    plan(5, ['developer:advance_dialogue']),
    turn(5, 0, { picked: 'developer:advance_dialogue', wait: 0.1 }),
    turn(5, 1, { picked: 'none_fits', wait: 0.8 }),
    turn(5, 2, { picked: 'developer:advance_dialogue', wait: 0.2 }),
    turn(5, 3, { picked: 'developer:advance_dialogue', wait: 0.2 }),
  ]
  let dock = deriveAgentDock(logs, true)
  assert.deepEqual(dock.repeat, { picked: 'developer:advance_dialogue', count: 3 }, '기다린 turn 은 세지 않는다')
  assert.equal(dock.turn?.wait, 0.2)

  logs.push(doneTurn(5, 4))
  dock = deriveAgentDock(logs, true)
  assert.equal(dock.turn?.turn, 3, 'done 만 담은 turn 은 행동이 없어 앞 turn 을 보인다')
  assert.equal(dock.done, true)

  logs.push(turn(6, 0, { picked: 'developer:advance_dialogue' }))
  assert.deepEqual(deriveAgentDock(logs, true).repeat, { picked: 'developer:advance_dialogue', count: 1 }, '새 step 이면 다시 센다')
})

test('지금 step 이 앞 계획으로 돌면 그 계획까지 거슬러 받는다', () => {
  const segment = { '3': ['test_dialogue'], '4': ['finish_story'] }
  assert.equal(agentHistoryComplete([segmentStep(4, []), turn(4, 0)]), false, '계획을 아직 못 봤다')
  assert.equal(agentHistoryComplete([segmentPlan(3, segment), segmentStep(4, []), turn(4, 0)]), false, '앞 계획이 더 있을 수 있다')
  assert.equal(agentHistoryComplete([verdict(2), segmentPlan(3, segment), segmentStep(4, []), turn(4, 0)]), true)
  assert.equal(isAgentLog(segmentStep(4, [])), true)
})

test('planner 가 답을 받는 동안 남기는 진행을 계획을 쓰는 동안만 보인다', () => {
  const progress = (step: number, elapsed: number, chars: number, tail: string, thinking = '') =>
    log('LOG', { kind: 'planner_progress', step, message: 'p', decision: { elapsed, chars, tail, thinking } })
  const logs = [writing(3), progress(3, 4, 0, '')]
  let dock = deriveAgentDock(logs, true)
  assert.equal(dock.active, 'planner')
  assert.deepEqual(dock.progress, { elapsed: 4, chars: 0, tail: '', thinking: '' }, '글이 아직 없으면 추론 중이다')

  logs.push(progress(3, 9, 0, '', 'Checking which slot is empty'))
  assert.equal(deriveAgentDock(logs, true).progress?.thinking, 'Checking which slot is empty', '추론 요약을 싣는다')

  logs.push(progress(3, 18, 120, '```goals\nread: ...'))
  dock = deriveAgentDock(logs, true)
  assert.equal(dock.progress?.chars, 120)

  logs.push(plan(3, ['developer:a']))
  assert.equal(deriveAgentDock(logs, true).progress, null, '계획이 나오면 진행은 지운다')
  assert.ok(isAgentLog(progress(3, 1, 0, '')))
})

test('판정 줄은 끝난 판정 뒤에 판정 중 한 step 과 판정 대기 step 들을 쌓는다', () => {
  const logs = [
    plan(1, ['developer:a']), turn(1, 0), evidence(1, 2),
    plan(2, ['developer:a']), turn(2, 0), evidence(2, 2),
    plan(3, ['developer:a']), turn(3, 0), evidence(3, 2),
    plan(4, ['developer:a']), turn(4, 0),
    verdict(1),
  ]
  const dock = deriveAgentDock(logs, true)
  assert.deepEqual(
    dock.judgements.map((item) => [item.step, item.state]),
    [[1, 'judged'], [2, 'judging'], [3, 'waiting']],
    '실행 중인 step 4 는 아직 판정 줄에 없다',
  )
  assert.equal(deriveAgentDock(logs, false).judgements.filter((item) => item.state !== 'judged').length, 0, '끝난 런은 끝난 판정만')
})

test('묶음의 step 은 묶음이 끝나 함께 판정이 시작될 때까지 묶음 대기로 둔다', () => {
  const segmented = log('LOG', {
    kind: 'step_macros', step: 4, message: 'plan',
    decision: { summary: '요약', actions: ['developer:a'], segment: { 4: ['line'], 5: ['map'] } },
  })
  const together = log('LOG', { kind: 'segment_judgement', step: 4, message: 'Steps 4-5: judged together', decision: { steps: [4, 5] } })
  const logs = [
    plan(3, ['developer:a']), turn(3, 0), evidence(3, 2), verdict(3),
    segmented, turn(4, 0), evidence(4, 2),
    log('LOG', { kind: 'segment_step', step: 5, message: 'Step 5: played with the plan written for the earlier step' }),
    turn(5, 0),
  ]
  let dock = deriveAgentDock(logs, true)
  assert.deepEqual(
    dock.judgements.map((item) => [item.step, item.state, item.state === 'judged' ? null : item.segment ?? null]),
    [[3, 'judged', null], [4, 'waiting', { from: 4, to: 5 }]],
    '에이전트가 묶음 안에 있으면 step 4 는 판정 중이 아니다',
  )
  logs.push(evidence(5, 3), together)
  dock = deriveAgentDock(logs, true)
  assert.deepEqual(dock.judgements.map((item) => [item.step, item.state]), [[3, 'judged'], [4, 'judging'], [5, 'waiting']])
})
