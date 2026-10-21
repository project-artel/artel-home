import assert from 'node:assert/strict'
import test from 'node:test'
import { actionOf, buildFlowSteps, objectNamesOf } from './qaFlow'
import { toolCallOf } from './qaLogGrouping'
import type { QaLog, QaLogDirection, QaLogType } from './qaTypes'

function log(
  id: string,
  type: QaLogType,
  payload: unknown,
  direction: QaLogDirection = 'AGENT_TO_ORCHE',
): QaLog {
  return {
    id,
    qaTryId: '46',
    messageId: null,
    correlationId: null,
    direction,
    type,
    message: '',
    payload,
    createdAt: '2026-10-20T07:45:41Z',
  }
}

/** 실제 프레임과 같은 모양: `step` 은 payload 최상위이고 `args` 안이 아니다. */
function tool(id: string, name: string, args: Record<string, unknown>, callId?: string): QaLog {
  const { step, ...rest } = args
  return log(id, 'TOOL', { step, tool: name, args: rest, tool_call_id: callId ?? `c${id}` })
}

function answer(id: string, name: string, callId: string, content: string): QaLog {
  return log(id, 'TOOL_RESULT', { tool: name, tool_call_id: callId, content })
}

function call(name: string, args: Record<string, unknown>) {
  const made = toolCallOf(tool('1', name, args))
  assert.ok(made !== null)
  return made
}

const NO_NAMES = new Map<number, string>()

test('a pulse hands over the names the operations only have as numbers', () => {
  const names = objectNamesOf([
    log('1', 'PULSE', {
      scene: 'TitleScene',
      active: [{ id: 40606, path: 'Canvas/continue' }],
      deactive: [{ id: -40088, path: 'CombineSystem/CombineButton' }],
    }, 'SDK_TO_ORCHE'),
  ])

  assert.equal(names.get(40606), 'Canvas/continue')
  assert.equal(names.get(-40088), 'CombineSystem/CombineButton')
})

test('a click says what it pressed, reading the name off the pulse', () => {
  // 실제 모양: `click` 은 `"#40606"`, `click_button` 은 `-38980` 을 싣는다.
  const names = new Map([[40606, 'Canvas/continue']])
  assert.equal(actionOf(call('click', { target: '#40606', button: 0 }), names, null).subject, 'Canvas/continue')
  assert.equal(actionOf(call('click_button', { target_id: 40606 }), names, null).subject, 'Canvas/continue')
})

test('an unknown id is left out rather than shown as a number', () => {
  const action = actionOf(call('click', { target: '#99999' }), NO_NAMES, null)
  assert.equal(action.subject, null)
})

test('a drag names both ends, and one end alone when only one is known', () => {
  const names = new Map([[-40112, 'Card(Clone)'], [-40088, 'CombineSystem/CombineButton']])
  assert.equal(
    actionOf(call('drag', { from_target: '#-40112', to_target: '#-40088' }), names, null).subject,
    'Card(Clone) → CombineSystem/CombineButton',
  )
  assert.equal(
    actionOf(call('drag', { from_target: '#-40112', to_target: '#-1' }), names, null).subject,
    'Card(Clone)',
  )
})

test('the other operations read their own argument', () => {
  assert.equal(actionOf(call('press_key', { key_code: 'Return' }), NO_NAMES, null).subject, 'Return')
  assert.equal(actionOf(call('inspect_object', { selector: 'TitleSceneController' }), NO_NAMES, null).subject, 'TitleSceneController')
  assert.equal(actionOf(call('run_macro', { name: 'open_and_place_cards' }), NO_NAMES, null).subject, 'open_and_place_cards')
  // 기다린 초가 0 이면 말할 것이 없다.
  assert.equal(actionOf(call('observe_scene', { wait_seconds: 3 }), NO_NAMES, null).subject, '3')
  assert.equal(actionOf(call('observe_scene', { wait_seconds: 0 }), NO_NAMES, null).subject, null)
})

test('a call our own tooling turned away is marked, not read as a game failure', () => {
  const turned = actionOf(
    call('inspect_object', { selector: 'RangedCat(Clone)[18]' }),
    NO_NAMES,
    'Not now — this run is in the UPDATE_MEMORY phase and `inspect_object` belongs to OBSERVE.',
  )
  assert.equal(turned.blocked, true)
  assert.equal(actionOf(call('press_key', { key_code: 'Return' }), NO_NAMES, 'key_click: ok').blocked, false)
})

test('a step gathers what was thought and what was done, in order', () => {
  const steps = buildFlowSteps(
    [
      tool('1', 'press_key', { step: 9, key_code: 'Space', thought: '키를 보내 본다' }, 'a'),
      answer('2', 'press_key', 'a', 'key_click: ok'),
      tool('3', 'report_step', { step: 9, passed: false, thought: '선행 화면이 아니다' }),
    ],
    NO_NAMES,
  )

  assert.equal(steps.length, 1)
  assert.deepEqual(steps[0].lines.map((line) => line.kind), ['thought', 'action', 'thought'])
  assert.equal(steps[0].passed, false)
  assert.equal(steps[0].attempts, 1)
})

test('a step that judged without trying anything says so by its count', () => {
  const steps = buildFlowSteps(
    [tool('1', 'report_step', { step: 6, passed: false, thought: '선행 씬에 못 갔다' })],
    NO_NAMES,
  )

  assert.equal(steps[0].attempts, 0)
  assert.equal(steps[0].passed, false)
})

test('the bookkeeping call is left out — it is neither a thought nor an action', () => {
  const steps = buildFlowSteps(
    [
      tool('1', 'skip_memory_update', { step: 6, reason: '적을 것이 없다' }),
      tool('2', 'report_step', { step: 6, passed: true, thought: '봤다' }),
    ],
    NO_NAMES,
  )

  assert.equal(steps[0].lines.length, 1)
  assert.equal(steps[0].attempts, 0)
})

test('steps keep the order they ran in, and each is one block', () => {
  const steps = buildFlowSteps(
    [
      tool('1', 'report_step', { step: 6, passed: false, thought: 'ㄱ' }),
      tool('2', 'press_key', { step: 7, key_code: 'Return', thought: 'ㄴ' }),
      tool('3', 'report_step', { step: 7, passed: true, thought: 'ㄷ' }),
    ],
    NO_NAMES,
  )

  assert.deepEqual(steps.map((block) => block.step), [6, 7])
})

test('a thought repeated by a retry is written once, not once per try', () => {
  // try 46 의 TC 20: 같은 문장이 세 번 실려 왔다.
  const steps = buildFlowSteps(
    [
      tool('1', 'click', { step: 20, target: '#1', thought: 'CombineButton 을 누른다' }),
      tool('2', 'click', { step: 20, target: '#1', thought: 'CombineButton 을 누른다' }),
      tool('3', 'report_step', { step: 20, passed: false, thought: '영역이 안 켜졌다' }),
    ],
    NO_NAMES,
  )

  assert.deepEqual(
    steps[0].lines.map((line) => (line.kind === 'thought' ? line.text : '·조작')),
    ['CombineButton 을 누른다', '·조작', '·조작', '영역이 안 켜졌다'],
  )
  // 되풀이는 조작 줄 둘로 읽힌다 — 문장을 두 번 적어 말할 것이 아니다.
})

test('a different thought in the same step is its own line', () => {
  const steps = buildFlowSteps(
    [
      tool('1', 'press_key', { step: 9, key_code: 'A', thought: '처음 생각' }),
      tool('2', 'press_key', { step: 9, key_code: 'B', thought: '다시 생각' }),
    ],
    NO_NAMES,
  )

  assert.equal(steps[0].lines.filter((line) => line.kind === 'thought').length, 2)
})

test('a thought and its action are two lines with two different keys', () => {
  // 한 `TOOL` 로그가 둘을 만든다. 같은 key 를 주면 React 가 형제를 못 가려 지운 줄이 남는다.
  const steps = buildFlowSteps(
    [tool('1', 'press_key', { step: 9, key_code: 'Return', thought: '눌러 본다' })],
    NO_NAMES,
  )

  const keys = steps[0].lines.map((line) => line.key)
  assert.equal(new Set(keys).size, keys.length)
  assert.deepEqual(steps[0].lines.map((line) => line.id), ['1', '1'])
})
