import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogEntry } from '../catalog'
import { TEST_RUN_ACTIONS, TEST_RUN_FIELDS } from './testRun'

const EXPECTED_ACTIONS = [
  ['testRun.openEditor', 'auto'],
  ['testRun.selectScenario', 'auto'],
  ['testRun.openScenario', 'auto'],
  ['testRun.startQa', 'auto'],
]
const EXPECTED_FIELDS: string[] = ['testRun.scenarios']

test('testRun catalog entry points at the spec objects the page binds', () => {
  const entry = catalogEntry('testRun')
  assert.ok(entry)
  assert.equal(entry.actions, TEST_RUN_ACTIONS)
  assert.equal(entry.fields, TEST_RUN_FIELDS)
})

test('testRun action ids, risks and pages', () => {
  assert.deepEqual(
    TEST_RUN_ACTIONS.map((action) => [action.id, action.risk]),
    EXPECTED_ACTIONS,
  )
  for (const action of TEST_RUN_ACTIONS) assert.equal(action.page, 'testRun')
  assert.deepEqual(TEST_RUN_FIELDS.map((field) => field.name), EXPECTED_FIELDS)
  for (const field of TEST_RUN_FIELDS) assert.equal(field.page, 'testRun')
})

test('testRun args are object schemas whose required keys are declared', () => {
  for (const action of TEST_RUN_ACTIONS) {
    assert.equal(action.args.type, 'object', action.id)
    assert.ok(action.description.length > 40, action.id)
    for (const required of action.args.required ?? []) assert.ok(action.args.properties?.[required], `${action.id}.${required}`)
    assert.equal(action.args.properties?.force, undefined, action.id)
  }
})

test('testRun summaries are one line and name the argument', () => {
  for (const action of TEST_RUN_ACTIONS) {
    const args = Object.fromEntries(Object.keys(action.args.properties ?? {}).map((key) => [key, 'SENTINEL']))
    const line = action.summarize(args)
    assert.ok(line.length > 0 && !line.includes('\n'), action.id)
    if (Object.keys(args).length > 0) assert.ok(line.includes('SENTINEL'), action.id)
  }
})

test('testRun.startQa only navigates and points the agent at qa.startRun', () => {
  const action = TEST_RUN_ACTIONS.find((one) => one.id === 'testRun.startQa')
  assert.ok(action)
  assert.match(action.description, /never starts QA/)
  assert.match(action.description, /qa\.startRun/)
})
