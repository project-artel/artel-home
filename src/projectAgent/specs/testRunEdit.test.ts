import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogEntry } from '../catalog'
import { TEST_RUN_EDIT_ACTIONS, TEST_RUN_EDIT_FIELDS } from './testRunEdit'

const EXPECTED_ACTIONS = [
  ['testRunEdit.selectScenario', 'auto'],
  ['testRunEdit.addScenario', 'auto'],
  ['testRunEdit.deleteScenario', 'approve'],
  ['testRunEdit.approveScenario', 'approve'],
  ['testRunEdit.renameRun', 'auto'],
]
const EXPECTED_FIELDS: string[] = []

test('testRunEdit catalog entry points at the spec objects the page binds', () => {
  const entry = catalogEntry('testRunEdit')
  assert.ok(entry)
  assert.equal(entry.actions, TEST_RUN_EDIT_ACTIONS)
  assert.equal(entry.fields, TEST_RUN_EDIT_FIELDS)
})

test('testRunEdit action ids, risks and pages', () => {
  assert.deepEqual(
    TEST_RUN_EDIT_ACTIONS.map((action) => [action.id, action.risk]),
    EXPECTED_ACTIONS,
  )
  for (const action of TEST_RUN_EDIT_ACTIONS) assert.equal(action.page, 'testRunEdit')
  assert.deepEqual(TEST_RUN_EDIT_FIELDS.map((field) => field.name), EXPECTED_FIELDS)
  for (const field of TEST_RUN_EDIT_FIELDS) assert.equal(field.page, 'testRunEdit')
})

test('testRunEdit args are object schemas whose required keys are declared', () => {
  for (const action of TEST_RUN_EDIT_ACTIONS) {
    assert.equal(action.args.type, 'object', action.id)
    assert.ok(action.description.length > 40, action.id)
    for (const required of action.args.required ?? []) assert.ok(action.args.properties?.[required], `${action.id}.${required}`)
    assert.equal(action.args.properties?.force, undefined, action.id)
  }
})

test('testRunEdit summaries are one line and name the argument', () => {
  for (const action of TEST_RUN_EDIT_ACTIONS) {
    const args = Object.fromEntries(Object.keys(action.args.properties ?? {}).map((key) => [key, 'SENTINEL']))
    const line = action.summarize(args)
    assert.ok(line.length > 0 && !line.includes('\n'), action.id)
    if (Object.keys(args).length > 0) assert.ok(line.includes('SENTINEL'), action.id)
  }
})
