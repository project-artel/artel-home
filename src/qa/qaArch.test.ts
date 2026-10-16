import assert from 'node:assert/strict'
import test from 'node:test'
import {
  archLabelMissing,
  changedKnobCount,
  parseArchSelection,
  suggestArchLabel,
  toArchRequest,
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
