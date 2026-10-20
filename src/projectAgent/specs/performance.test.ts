import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogEntry } from '../catalog'
import { PERFORMANCE_ACTIONS, PERFORMANCE_FIELDS } from './performance'

const EXPECTED_ACTIONS = [
  ['performance.openRunReport', 'auto'],
]
const EXPECTED_FIELDS: string[] = ['performance.build', 'performance.listed']

test('performance catalog entry points at the spec objects the page binds', () => {
  const entry = catalogEntry('performance')
  assert.ok(entry)
  assert.equal(entry.actions, PERFORMANCE_ACTIONS)
  assert.equal(entry.fields, PERFORMANCE_FIELDS)
})

test('performance action ids, risks and pages', () => {
  assert.deepEqual(
    PERFORMANCE_ACTIONS.map((action) => [action.id, action.risk]),
    EXPECTED_ACTIONS,
  )
  for (const action of PERFORMANCE_ACTIONS) assert.equal(action.page, 'performance')
  assert.deepEqual(PERFORMANCE_FIELDS.map((field) => field.name), EXPECTED_FIELDS)
  for (const field of PERFORMANCE_FIELDS) assert.equal(field.page, 'performance')
})

test('performance args are object schemas whose required keys are declared', () => {
  for (const action of PERFORMANCE_ACTIONS) {
    assert.equal(action.args.type, 'object', action.id)
    assert.ok(action.description.length > 40, action.id)
    for (const required of action.args.required ?? []) assert.ok(action.args.properties?.[required], `${action.id}.${required}`)
    assert.equal(action.args.properties?.force, undefined, action.id)
  }
})

test('performance summaries are one line and name the argument', () => {
  for (const action of PERFORMANCE_ACTIONS) {
    const args = Object.fromEntries(Object.keys(action.args.properties ?? {}).map((key) => [key, 'SENTINEL']))
    const line = action.summarize(args)
    assert.ok(line.length > 0 && !line.includes('\n'), action.id)
    if (Object.keys(args).length > 0) assert.ok(line.includes('SENTINEL'), action.id)
  }
})
