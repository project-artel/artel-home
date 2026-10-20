import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogEntry } from '../catalog'
import { KNOWLEDGE_ACTIONS, KNOWLEDGE_FIELDS } from './knowledge'

const EXPECTED_ACTIONS = [
  ['knowledge.openNode', 'auto'],
]
const EXPECTED_FIELDS: string[] = []

test('knowledge catalog entry points at the spec objects the page binds', () => {
  const entry = catalogEntry('knowledge')
  assert.ok(entry)
  assert.equal(entry.actions, KNOWLEDGE_ACTIONS)
  assert.equal(entry.fields, KNOWLEDGE_FIELDS)
})

test('knowledge action ids, risks and pages', () => {
  assert.deepEqual(
    KNOWLEDGE_ACTIONS.map((action) => [action.id, action.risk]),
    EXPECTED_ACTIONS,
  )
  for (const action of KNOWLEDGE_ACTIONS) assert.equal(action.page, 'knowledge')
  assert.deepEqual(KNOWLEDGE_FIELDS.map((field) => field.name), EXPECTED_FIELDS)
  for (const field of KNOWLEDGE_FIELDS) assert.equal(field.page, 'knowledge')
})

test('knowledge args are object schemas whose required keys are declared', () => {
  for (const action of KNOWLEDGE_ACTIONS) {
    assert.equal(action.args.type, 'object', action.id)
    assert.ok(action.description.length > 40, action.id)
    for (const required of action.args.required ?? []) assert.ok(action.args.properties?.[required], `${action.id}.${required}`)
    assert.equal(action.args.properties?.force, undefined, action.id)
  }
})

test('knowledge summaries are one line and name the argument', () => {
  for (const action of KNOWLEDGE_ACTIONS) {
    const args = Object.fromEntries(Object.keys(action.args.properties ?? {}).map((key) => [key, 'SENTINEL']))
    const line = action.summarize(args)
    assert.ok(line.length > 0 && !line.includes('\n'), action.id)
    if (Object.keys(args).length > 0) assert.ok(line.includes('SENTINEL'), action.id)
  }
})
