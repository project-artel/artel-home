import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogEntry } from '../catalog'
import { MACROS_ACTIONS, MACROS_FIELDS } from './macros'

const EXPECTED_ACTIONS = [
  ['macros.openSource', 'auto'],
]
const EXPECTED_FIELDS: string[] = ['macros.build']

test('macros catalog entry points at the spec objects the page binds', () => {
  const entry = catalogEntry('macros')
  assert.ok(entry)
  assert.equal(entry.actions, MACROS_ACTIONS)
  assert.equal(entry.fields, MACROS_FIELDS)
})

test('macros action ids, risks and pages', () => {
  assert.deepEqual(
    MACROS_ACTIONS.map((action) => [action.id, action.risk]),
    EXPECTED_ACTIONS,
  )
  for (const action of MACROS_ACTIONS) assert.equal(action.page, 'macros')
  assert.deepEqual(MACROS_FIELDS.map((field) => field.name), EXPECTED_FIELDS)
  for (const field of MACROS_FIELDS) assert.equal(field.page, 'macros')
})

test('macros args are object schemas whose required keys are declared', () => {
  for (const action of MACROS_ACTIONS) {
    assert.equal(action.args.type, 'object', action.id)
    assert.ok(action.description.length > 40, action.id)
    for (const required of action.args.required ?? []) assert.ok(action.args.properties?.[required], `${action.id}.${required}`)
    assert.equal(action.args.properties?.force, undefined, action.id)
  }
})

test('macros summaries are one line and name the argument', () => {
  for (const action of MACROS_ACTIONS) {
    const args = Object.fromEntries(Object.keys(action.args.properties ?? {}).map((key) => [key, 'SENTINEL']))
    const line = action.summarize(args)
    assert.ok(line.length > 0 && !line.includes('\n'), action.id)
    if (Object.keys(args).length > 0) assert.ok(line.includes('SENTINEL'), action.id)
  }
})
