import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogEntry } from '../catalog'
import { TEST_SCENARIO_ACTIONS, TEST_SCENARIO_FIELDS } from './testScenario'

test('testScenario catalog entry points at the spec objects the page binds', () => {
  const entry = catalogEntry('testScenario')
  assert.ok(entry)
  assert.equal(entry.path, 'test-scenarios/:testScenarioId')
  assert.deepEqual(entry.params, ['testScenarioId', 'run'])
  assert.equal(entry.actions, TEST_SCENARIO_ACTIONS)
  assert.equal(entry.fields, TEST_SCENARIO_FIELDS)
})

test('testScenario action ids, risks and pages', () => {
  assert.deepEqual(
    TEST_SCENARIO_ACTIONS.map((action) => [action.id, action.risk]),
    [
      ['testScenario.convertToFree', 'approve'],
      ['testScenario.addCases', 'auto'],
      ['testScenario.removeCases', 'auto'],
      ['testScenario.addCasesToBuild', 'approve'],
    ],
  )
  for (const action of TEST_SCENARIO_ACTIONS) assert.equal(action.page, 'testScenario')
  assert.deepEqual(TEST_SCENARIO_FIELDS.map((field) => field.name), ['testScenario.title', 'testScenario.cases'])
})

test('testScenario summaries are one line and count the cases', () => {
  for (const action of TEST_SCENARIO_ACTIONS) {
    const line = action.summarize({ caseIds: ['1', '2'], scope: 'run_build_and_later' })
    assert.ok(line.length > 0 && !line.includes('\n'), action.id)
  }
  const addToBuild = TEST_SCENARIO_ACTIONS.find((action) => action.id === 'testScenario.addCasesToBuild')
  assert.match(addToBuild?.summarize({ caseIds: ['1', '2'], scope: 'run_build_and_later' }) ?? '', /2 test cases.*every later/)
})
