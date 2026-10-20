import assert from 'node:assert/strict'
import test from 'node:test'
import { planDeleteListed } from '../../testCases/deleteCasesPlan'
import { UNVERSIONED } from '../../testCases/testCaseVersions'
import { PAGE_CATALOG } from '../catalog'
import { LISTED_OPTION_LIMIT, listedFieldDescription, listedOptions, readOnlyListWrite } from './listedOptions'
import { TEST_CASES_DELETE_LISTED_ACTION, TEST_CASES_LISTED_FIELD, testCaseVersionOptions } from './testCases'

test('the version options end with the unversioned bucket the screen shows', () => {
  const options = testCaseVersionOptions(
    [
      { gameBuildId: '7', label: null, version: '1.2.0' },
      { gameBuildId: '3', label: 'Beta', version: '1.0' },
    ],
    'No version',
  )
  assert.deepEqual(options, [
    { value: '7', label: '1.2.0' },
    { value: '3', label: 'Beta' },
    { value: UNVERSIONED, label: 'No version' },
  ])
})

test('listed options are capped and carry value and label', () => {
  const items = Array.from({ length: LISTED_OPTION_LIMIT + 30 }, (_, index) => ({ id: `id${index}`, title: `T${index}` }))
  const options = listedOptions(items, (item) => ({ value: item.id, label: item.title }))
  assert.equal(options.length, LISTED_OPTION_LIMIT)
  assert.deepEqual(options[0], { value: 'id0', label: 'T0' })
  assert.deepEqual(listedOptions([], () => ({ value: 1, label: '' })), [])
})

test('a listed field says it is read-only, that values are ids and how truncation shows', () => {
  const description = TEST_CASES_LISTED_FIELD.description
  assert.match(description, /^Read-only list of /)
  assert.match(description, /values are ids/)
  assert.match(description, /truncated/)
  assert.match(listedFieldDescription('things'), /at most 200/)
})

test('writing a listed field throws a read-only message', () => {
  assert.throws(readOnlyListWrite('testCases.listed', 'use testCases.open or testCases.delete.'), /testCases.listed is read-only: use testCases.open or testCases.delete/)
})

test('deleteListed plans exactly the listed ids when the count matches', () => {
  assert.deepEqual(planDeleteListed(['a', 'b', 'a'], 2), ['a', 'b'])
  assert.throws(() => planDeleteListed(['a', 'b'], 3), /2 test cases are listed now, not 3/)
  assert.throws(() => planDeleteListed([], 0), /nothing to delete/)
  assert.throws(() => planDeleteListed(['a'], '1'), /expectedCount must be a whole number/)
})

test('deleteListed refuses more than 500 cases', () => {
  const many = Array.from({ length: 501 }, (_, index) => `id${index}`)
  assert.throws(() => planDeleteListed(many, 501), /delete at most 500/)
  assert.equal(planDeleteListed(many.slice(0, 500), 500).length, 500)
})

test('deleteListed needs approval and its summary states the count and the filter', () => {
  assert.equal(TEST_CASES_DELETE_LISTED_ACTION.risk, 'approve')
  assert.equal(TEST_CASES_DELETE_LISTED_ACTION.summarize({ expectedCount: 35, filter: 'no version' }), "Delete 35 test cases in 'no version'")
  assert.equal(TEST_CASES_DELETE_LISTED_ACTION.summarize({ expectedCount: 1 }), 'Delete 1 test case in the current list')
})

test('every action that takes an id has a read-only list of valid ids on the same page', () => {
  const idLike = /(Id|Ids|id)$/
  const missing: string[] = []
  for (const entry of PAGE_CATALOG) {
    const hasOptions = entry.fields.some((field) => /options/i.test(field.description))
    for (const action of entry.actions) {
      const required = action.args.required ?? []
      const takesId = required.some((name) => idLike.test(name))
      if (takesId && !hasOptions) missing.push(action.id)
    }
  }
  assert.deepEqual(missing, [])
})

test('every list-taking action points at a listed field that exists on its page', () => {
  const pairs: Record<string, string> = {
    'documents.delete': 'documents.listed',
    'members.removeMember': 'members.listed',
    'members.revokeInvitation': 'members.invitations',
    'testRuns.open': 'testRuns.listed',
    'testRuns.openMap': 'testRuns.listed',
    'macros.openSource': 'macros.listed',
    'performance.openRunReport': 'performance.listed',
    'knowledge.openNode': 'knowledge.listed',
    'testRun.selectScenario': 'testRun.scenarios',
    'testRun.openScenario': 'testRun.scenarios',
    'testRunEdit.selectScenario': 'testRunEdit.scenarios',
    'testRunEdit.deleteScenario': 'testRunEdit.scenarios',
    'testCases.open': 'testCases.listed',
    'testCases.delete': 'testCases.listed',
    'qaRun.selectScenario': 'qaRun.scenario',
    'qaHistory.openRun': 'qaHistory.run',
    'issues.open': 'issues.issue',
  }
  for (const [actionId, fieldName] of Object.entries(pairs)) {
    const entry = PAGE_CATALOG.find((one) => one.actions.some((action) => action.id === actionId))
    assert.ok(entry, actionId)
    const field = entry.fields.find((one) => one.name === fieldName)
    assert.ok(field, `${actionId} -> ${fieldName}`)
    const action = entry.actions.find((one) => one.id === actionId)
    assert.ok(JSON.stringify(action?.args).includes(fieldName) || action?.description.includes(fieldName), `${actionId} mentions ${fieldName}`)
  }
  for (const entry of PAGE_CATALOG) {
    for (const field of entry.fields.filter((one) => one.name.endsWith('.listed') || /^Read-only list of/.test(one.description))) {
      assert.match(field.description, /^Read-only list of .*values are ids/, field.name)
    }
  }
})
