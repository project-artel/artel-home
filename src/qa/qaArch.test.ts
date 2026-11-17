import assert from 'node:assert/strict'
import test from 'node:test'
import {
  archEngine,
  changedSettingCount,
  parseArchSelection,
  toArchRequest,
  withEngine,
  withKnob,
  withoutVisionKnobs,
} from './qaArch'

test('기본 설정은 arch 요청을 생략한다', () => {
  assert.equal(toArchRequest({}), null)
})

test('같은 설정은 같은 label을 사용하고 다른 설정은 label을 구분한다', () => {
  const request = toArchRequest({ phase_cycle: 'off', compaction: false })
  assert.deepEqual(request, { label: 'web-v1-a0-m0', phase_cycle: 'off', compaction: false })
  assert.deepEqual(toArchRequest({ compaction: false, phase_cycle: 'off', skills: undefined }), request)
  assert.notEqual(toArchRequest({ phase_cycle: 'off', compaction: true })?.label, request?.label)
  assert.notEqual(toArchRequest({ phase_cycle: 'off' })?.label, request?.label)
})

test('모든 설정을 지정한 label도 서버의 50자 제한을 지킨다', () => {
  const request = toArchRequest({
    phase_cycle: 'full',
    skills: 'on_demand',
    macros: 'on',
    screen_capture: 'every_call',
    vision: 'on',
    pulse_relevance: true,
    report_step_view: true,
    fold_stale_scenes: true,
    fold_stale_knowledge: true,
    fold_stale_skills: true,
    fold_stale_macro_results: true,
    fold_threshold_chars: 10_000_000,
    compaction: true,
  })
  assert.ok(request?.label)
  assert.ok(request.label.length <= 50)
})

test('withoutVisionKnobs clears vision-only values and keeps the others', () => {
  assert.deepEqual(
    withoutVisionKnobs({ vision: 'on', screen_capture: 'by_role', macros: 'off' }),
    { macros: 'off' },
  )
  const kept = { vision: 'off', screen_capture: 'on_demand' } as const
  assert.equal(withoutVisionKnobs(kept), kept)
})

test('withKnob sets a value and removes the key on undefined', () => {
  const set = withKnob({}, 'macros', 'off')
  assert.equal(set.macros, 'off')
  const cleared = withKnob(set, 'macros', undefined)
  assert.equal('macros' in cleared, false)
})

test('parseArchSelection drops unknown keys, unknown values and out-of-range numbers', () => {
  const parsed = parseArchSelection({
    label: 'legacy',
    phase_cycle: 'lite',
    skills: 'sometimes',
    bogus: true,
    fold_threshold_chars: -1,
    compaction: true,
  })
  assert.deepEqual(parsed, { phase_cycle: 'lite', compaction: true })
})

test('parseArchSelection은 object가 아니면 null을 반환하고 이전 label을 버린다', () => {
  assert.equal(parseArchSelection('x'), null)
  assert.equal(parseArchSelection(null), null)
  assert.equal(parseArchSelection([]), null)
  assert.deepEqual(parseArchSelection({ label: 3 }), {})
})

// ARTEL-1119 — `engine`. `agent` 는 #165 그대로이고, `planner_executer` 는 `engine` 하나만 보낸다.

test('agent 엔진은 engine 키 없이 label 과 바꾼 knob 만 보낸다', () => {
  const request = toArchRequest({ engine: 'agent', phase_cycle: 'off' })
  assert.deepEqual(request, { label: 'web-v1-a0', phase_cycle: 'off' })
  assert.equal(toArchRequest({ engine: 'agent' }), null)
})

test('planner_executer 는 knob 이 없어도 engine 만 보낸다', () => {
  assert.deepEqual(toArchRequest({ engine: 'planner_executer' }), { engine: 'planner_executer' })
})

test('planner_executer 는 남겨 둔 tool loop knob 을 보내지 않는다', () => {
  const request = toArchRequest({
    engine: 'planner_executer',
    phase_cycle: 'full',
    fold_threshold_chars: 1000,
  })
  assert.deepEqual(request, { engine: 'planner_executer' })
})

test('changedSettingCount 는 엔진을 세지 않고, planner_executer 면 남겨 둔 knob 도 세지 않는다', () => {
  assert.equal(changedSettingCount({}), 0)
  assert.equal(changedSettingCount({ engine: 'planner_executer' }), 0)
  assert.equal(changedSettingCount({ engine: 'planner_executer', macros: 'off', skills: 'off' }), 0)
  assert.equal(changedSettingCount({ macros: 'off', skills: 'off' }), 2)
})

test('withEngine 은 knob 을 남기고, agent 로 돌아오면 engine 키를 지운다', () => {
  const planner = withEngine({ phase_cycle: 'off' }, 'planner_executer')
  assert.deepEqual(planner, { phase_cycle: 'off', engine: 'planner_executer' })
  const back = withEngine(planner, 'agent')
  assert.deepEqual(back, { phase_cycle: 'off' })
  assert.equal(archEngine(back), 'agent')
})

test('withoutVisionKnobs 는 engine 을 건드리지 않는다', () => {
  assert.deepEqual(withoutVisionKnobs({ engine: 'planner_executer', vision: 'on' }), {
    engine: 'planner_executer',
  })
})

test('parseArchSelection 은 engine 이 없거나 모르는 값이면 agent 로 읽는다', () => {
  assert.deepEqual(parseArchSelection({ macros: 'off' }), { macros: 'off' })
  assert.deepEqual(parseArchSelection({ engine: 'planner_executer' }), {
    engine: 'planner_executer',
  })
  assert.deepEqual(parseArchSelection({ engine: 'agent' }), {})
  assert.deepEqual(parseArchSelection({ engine: 'pe2' }), {})
})
