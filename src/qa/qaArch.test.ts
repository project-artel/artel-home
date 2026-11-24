import assert from 'node:assert/strict'
import test from 'node:test'
import { parseQaArchOptions } from './qaArchOptions'
import { axes } from './qaArch.fixture.ts'
import {
  archEngine,
  changedSettingCount,
  parseArchSelection,
  toArchRequest,
  withEngine,
  withKnob,
  availableArch,
} from './qaArch'

test('기본 설정은 arch 요청을 생략한다', () => {
  assert.equal(toArchRequest({}, axes), null)
})

test('같은 설정은 같은 label을 사용하고 다른 설정은 label을 구분한다', () => {
  const request = toArchRequest({ phase_cycle: 'off', compaction: false }, axes)
  assert.deepEqual(request, { label: 'web-v1-a0-m0', phase_cycle: 'off', compaction: false })
  assert.deepEqual(toArchRequest({ compaction: false, phase_cycle: 'off', skills: undefined }, axes), request)
  assert.notEqual(toArchRequest({ phase_cycle: 'off', compaction: true }, axes)?.label, request?.label)
  assert.notEqual(toArchRequest({ phase_cycle: 'off' }, axes)?.label, request?.label)
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
    code_mode: true,
  }, axes)
  assert.ok(request?.label)
  assert.ok(request.label.startsWith('web-v2-'))
  assert.ok(request.label.length <= 50)
  assert.notEqual(request.label, toArchRequest({ ...request, code_mode: false }, axes)?.label)
})

test('availableArch clears vision-only values and keeps the others', () => {
  assert.deepEqual(
    availableArch({ vision: 'on', screen_capture: 'by_role', macros: 'off' }, axes, false),
    { macros: 'off' },
  )
  const kept = { vision: 'off', screen_capture: 'on_demand' } as const
  assert.equal(availableArch(kept, axes, false), kept)
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
  }, axes)
  assert.deepEqual(parsed, { phase_cycle: 'lite', compaction: true })
})

test('parseArchSelection은 object가 아니면 null을 반환하고 이전 label을 버린다', () => {
  assert.equal(parseArchSelection('x', axes), null)
  assert.equal(parseArchSelection(null, axes), null)
  assert.equal(parseArchSelection([], axes), null)
  assert.deepEqual(parseArchSelection({ label: 3 }, axes), {})
})

test('옵션 사이의 제한은 요청에서만 빼고 원래 선택은 유지한다', () => {
  const options = parseQaArchOptions({ options: [
    { key: 'source', kind: 'toggle', labelCode: 'x', engines: ['agent'], description: { ko: '원본', en: 'Source' } },
    { key: 'view', kind: 'choice', labelCode: 'y', engines: ['agent'], description: { ko: '보기', en: 'View' },
      values: ['once', 'always'], unavailableWhen: [{ key: 'source', equals: false, values: ['always'] }] },
  ] })
  const saved = { source: false, view: 'always' }
  assert.deepEqual(toArchRequest(availableArch(saved, options, true), options), { label: 'web-v1-x0', source: false })
  assert.deepEqual(availableArch({ ...saved, source: true }, options, true), { source: true, view: 'always' })
  assert.deepEqual(saved, { source: false, view: 'always' })
})

test('중복 labelCode가 있는 설정 목록을 거절한다', () => {
  assert.throws(() => parseQaArchOptions({ options: [axes[0], { ...axes[1], labelCode: axes[0].labelCode }] }))
})

// ARTEL-1119 — `engine`. `agent` 는 #165 그대로이고, `planner_executer` 는 `engine` 하나만 보낸다.

test('agent 엔진은 engine 키 없이 label 과 바꾼 knob 만 보낸다', () => {
  const request = toArchRequest({ engine: 'agent', phase_cycle: 'off' }, axes)
  assert.deepEqual(request, { label: 'web-v1-a0', phase_cycle: 'off' })
  assert.equal(toArchRequest({ engine: 'agent' }, axes), null)
})

test('planner_executer 는 knob 이 없어도 engine 만 보낸다', () => {
  assert.deepEqual(toArchRequest({ engine: 'planner_executer' }, axes), { engine: 'planner_executer' })
})

test('planner_executer 는 남겨 둔 tool loop knob 을 보내지 않는다', () => {
  const request = toArchRequest({
    engine: 'planner_executer',
    phase_cycle: 'full',
    fold_threshold_chars: 1000,
  }, axes)
  assert.deepEqual(request, { engine: 'planner_executer' })
})

test('changedSettingCount 는 엔진을 세지 않고, planner_executer 면 남겨 둔 knob 도 세지 않는다', () => {
  assert.equal(changedSettingCount({}, axes), 0)
  assert.equal(changedSettingCount({ engine: 'planner_executer' }, axes), 0)
  assert.equal(changedSettingCount({ engine: 'planner_executer', macros: 'off', skills: 'off' }, axes), 0)
  assert.equal(changedSettingCount({ macros: 'off', skills: 'off' }, axes), 2)
})

test('withEngine 은 knob 을 남기고, agent 로 돌아오면 engine 키를 지운다', () => {
  const planner = withEngine({ phase_cycle: 'off' }, 'planner_executer')
  assert.deepEqual(planner, { phase_cycle: 'off', engine: 'planner_executer' })
  const back = withEngine(planner, 'agent')
  assert.deepEqual(back, { phase_cycle: 'off' })
  assert.equal(archEngine(back), 'agent')
})

test('availableArch 는 engine 을 건드리지 않는다', () => {
  assert.deepEqual(availableArch({ engine: 'planner_executer', vision: 'on' }, axes, false), {
    engine: 'planner_executer',
  })
})

test('parseArchSelection 은 engine 이 없거나 모르는 값이면 agent 로 읽는다', () => {
  assert.deepEqual(parseArchSelection({ macros: 'off' }, axes), { macros: 'off' })
  assert.deepEqual(parseArchSelection({ engine: 'planner_executer' }, axes), {
    engine: 'planner_executer',
  })
  assert.deepEqual(parseArchSelection({ engine: 'agent' }, axes), {})
  assert.deepEqual(parseArchSelection({ engine: 'pe2' }, axes), {})
})
