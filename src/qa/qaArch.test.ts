import assert from 'node:assert/strict'
import test from 'node:test'
import {
  archEngine,
  archLabelMissing,
  changedKnobCount,
  changedSettingCount,
  parseArchSelection,
  suggestArchLabel,
  toArchRequest,
  withEngine,
  withKnob,
  withoutVisionKnobs,
} from './qaArch'

test('toArchRequest returns null when no knob is changed', () => {
  assert.equal(toArchRequest({ label: 'x' }), null)
})

test('toArchRequest carries the trimmed label and only the changed knobs', () => {
  const request = toArchRequest({ label: '  my arch  ', phase_cycle: 'off', compaction: false })
  assert.deepEqual(request, { label: 'my arch', phase_cycle: 'off', compaction: false })
  assert.equal(request !== null && 'skills' in request, false)
})

test('toArchRequest omits a key whose value is undefined', () => {
  const request = toArchRequest({ label: 'a', skills: 'on_demand', phase_cycle: undefined })
  assert.ok(request)
  assert.equal('phase_cycle' in request, false)
})

test('changedKnobCount ignores the label', () => {
  assert.equal(changedKnobCount({ label: 'a' }), 0)
  assert.equal(changedKnobCount({ label: 'a', macros: 'off', fold_threshold_chars: 0 }), 2)
})

test('archLabelMissing is true only for a changed knob with a blank label', () => {
  assert.equal(archLabelMissing({ label: '   ', macros: 'off' }), true)
  assert.equal(archLabelMissing({ label: 'x', macros: 'off' }), false)
  assert.equal(archLabelMissing({ label: '' }), false)
})

test('suggestArchLabel joins changed knobs and is empty without any', () => {
  assert.equal(suggestArchLabel({ label: '' }), '')
  assert.equal(suggestArchLabel({ label: '', phase_cycle: 'off', skills: 'on_demand' }), 'phase_cycle=off skills=on_demand')
})

test('suggestArchLabel cuts at 50 characters', () => {
  const label = suggestArchLabel({
    label: '',
    phase_cycle: 'in_verdict',
    skills: 'on_demand',
    screen_capture: 'every_call',
    fold_threshold_chars: 1234567,
  })
  assert.equal(label.length, 50)
})

test('withoutVisionKnobs clears vision-only values and keeps the others', () => {
  assert.deepEqual(
    withoutVisionKnobs({ label: 'a', vision: 'on', screen_capture: 'by_role', macros: 'off' }),
    { label: 'a', macros: 'off' },
  )
  const kept = { label: 'a', vision: 'off', screen_capture: 'on_demand' } as const
  assert.equal(withoutVisionKnobs(kept), kept)
})

test('withKnob sets a value and removes the key on undefined', () => {
  const set = withKnob({ label: 'a' }, 'macros', 'off')
  assert.equal(set.macros, 'off')
  const cleared = withKnob(set, 'macros', undefined)
  assert.equal('macros' in cleared, false)
})

test('parseArchSelection drops unknown keys, unknown values and out-of-range numbers', () => {
  const parsed = parseArchSelection({
    label: 'a',
    phase_cycle: 'lite',
    skills: 'sometimes',
    bogus: true,
    fold_threshold_chars: -1,
    compaction: true,
  })
  assert.deepEqual(parsed, { label: 'a', phase_cycle: 'lite', compaction: true })
})

test('parseArchSelection returns null for a non-object and an empty label for a non-string label', () => {
  assert.equal(parseArchSelection('x'), null)
  assert.equal(parseArchSelection(null), null)
  assert.equal(parseArchSelection([]), null)
  assert.deepEqual(parseArchSelection({ label: 3 }), { label: '' })
})

// ARTEL-1119 — `engine`. `agent` 는 #165 그대로이고, `planner_executer` 는 `engine` 하나만 보낸다.

test('agent 엔진은 engine 키 없이 label 과 바꾼 knob 만 보낸다', () => {
  const request = toArchRequest({ label: 'arm', engine: 'agent', phase_cycle: 'off' })
  assert.deepEqual(request, { label: 'arm', phase_cycle: 'off' })
  assert.equal(toArchRequest({ label: '', engine: 'agent' }), null)
})

test('planner_executer 는 knob 이 없어도 engine 만 보낸다', () => {
  assert.deepEqual(toArchRequest({ label: '', engine: 'planner_executer' }), { engine: 'planner_executer' })
})

test('planner_executer 는 남겨 둔 tool loop knob 과 label 을 보내지 않는다', () => {
  const request = toArchRequest({
    label: 'arm',
    engine: 'planner_executer',
    phase_cycle: 'full',
    fold_threshold_chars: 1000,
  })
  assert.deepEqual(request, { engine: 'planner_executer' })
})

test('label 점검은 planner_executer 에서 건너뛴다', () => {
  assert.equal(archLabelMissing({ label: '', engine: 'planner_executer', macros: 'off' }), false)
  assert.equal(archLabelMissing({ label: '', engine: 'agent', macros: 'off' }), true)
})

test('changedSettingCount 는 planner_executer 면 엔진 하나만 센다', () => {
  assert.equal(changedSettingCount({ label: '' }), 0)
  assert.equal(changedSettingCount({ label: '', engine: 'planner_executer' }), 1)
  assert.equal(changedSettingCount({ label: '', engine: 'planner_executer', macros: 'off', skills: 'off' }), 1)
  assert.equal(changedSettingCount({ label: 'a', macros: 'off', skills: 'off' }), 2)
})

test('withEngine 은 knob 과 label 을 남기고, agent 로 돌아오면 engine 키를 지운다', () => {
  const planner = withEngine({ label: 'arm', phase_cycle: 'off' }, 'planner_executer')
  assert.deepEqual(planner, { label: 'arm', phase_cycle: 'off', engine: 'planner_executer' })
  const back = withEngine(planner, 'agent')
  assert.deepEqual(back, { label: 'arm', phase_cycle: 'off' })
  assert.equal(archEngine(back), 'agent')
})

test('withoutVisionKnobs 는 engine 을 건드리지 않는다', () => {
  assert.deepEqual(withoutVisionKnobs({ label: '', engine: 'planner_executer', vision: 'on' }), {
    label: '',
    engine: 'planner_executer',
  })
})

test('parseArchSelection 은 engine 이 없거나 모르는 값이면 agent 로 읽는다', () => {
  assert.deepEqual(parseArchSelection({ label: 'a', macros: 'off' }), { label: 'a', macros: 'off' })
  assert.deepEqual(parseArchSelection({ label: '', engine: 'planner_executer' }), {
    label: '',
    engine: 'planner_executer',
  })
  assert.deepEqual(parseArchSelection({ label: '', engine: 'agent' }), { label: '' })
  assert.deepEqual(parseArchSelection({ label: '', engine: 'pe2' }), { label: '' })
})
