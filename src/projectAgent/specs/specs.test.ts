import assert from 'node:assert/strict'
import test from 'node:test'
import { PAGE_CATALOG, catalogEntry, wireCatalog } from '../catalog'
import { CONTENT_MAP_ACTIONS, CONTENT_MAP_FIELDS } from './contentMap'
import { QA_ACTIONS, QA_FIELDS } from './qa'
import { TEST_RUNS_ACTIONS } from './testRuns'

const SPEC_PAGES = [
  { page: 'contentMap', fields: CONTENT_MAP_FIELDS, actions: CONTENT_MAP_ACTIONS },
  { page: 'qa', fields: QA_FIELDS, actions: QA_ACTIONS },
  { page: 'testRuns', fields: [], actions: TEST_RUNS_ACTIONS },
] as const

test('catalog entries point at the same spec objects the page bindings use', () => {
  for (const { page, fields, actions } of SPEC_PAGES) {
    const entry = catalogEntry(page)
    assert.ok(entry, page)
    assert.deepEqual(entry.fields, fields)
    assert.deepEqual(entry.actions, actions)
    entry.fields.forEach((field, index) => assert.equal(field, fields[index]))
    entry.actions.forEach((action, index) => assert.equal(action, actions[index]))
  }
})

test('every spec names its own page and carries the page prefix', () => {
  for (const { page, fields, actions } of SPEC_PAGES) {
    for (const field of fields) {
      assert.equal(field.page, page)
      assert.ok(field.name.startsWith(`${page}.`), field.name)
    }
    for (const action of actions) {
      assert.equal(action.page, page)
      assert.ok(action.id.startsWith(`${page}.`), action.id)
    }
  }
})

test('action ids and field names are unique across the whole catalog', () => {
  const ids = PAGE_CATALOG.flatMap((entry) => entry.actions.map((action) => action.id))
  const names = PAGE_CATALOG.flatMap((entry) => entry.fields.map((field) => field.name))
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(names).size, names.length)
})

test('actions that start paid or destructive work need approval', () => {
  const risk = Object.fromEntries(PAGE_CATALOG.flatMap((entry) => entry.actions.map((action) => [action.id, action.risk])))
  assert.deepEqual(risk, {
    'testRuns.create': 'auto',
    'qa.startRun': 'approve',
    'contentMap.scan': 'auto',
    'contentMap.scanAndGenerateTestCases': 'auto',
    'contentMap.overwriteTestCases': 'approve',
  })
})

test('every action has an object schema and a description, and none takes force', () => {
  for (const entry of PAGE_CATALOG) {
    for (const action of entry.actions) {
      assert.equal(action.args.type, 'object', action.id)
      assert.ok(action.description.length > 40, action.id)
      assert.equal(action.args.properties?.force, undefined, action.id)
      for (const required of action.args.required ?? []) {
        assert.ok(action.args.properties?.[required], `${action.id}.${required}`)
      }
    }
  }
})

test('wireCatalog carries the specs without functions', () => {
  const wire = wireCatalog()
  const qa = wire.pages.find((page) => page.id === 'qa')
  assert.deepEqual(
    qa?.fields.map((field) => field.name),
    ['qa.gameInstanceId', 'qa.testRunId', 'qa.model', 'qa.reasoningEnabled', 'qa.reasoningValue'],
  )
  assert.deepEqual(qa?.actions.map((action) => action.id), ['qa.startRun'])
  assert.equal(JSON.stringify(wire).includes('summarize'), false)
})

test('summaries are one readable line and testRuns.create names the run', () => {
  for (const action of PAGE_CATALOG.flatMap((entry) => entry.actions)) {
    const line = action.summarize({ name: 'Smoke' })
    assert.ok(line.length > 0 && !line.includes('\n'), action.id)
  }
  assert.ok(TEST_RUNS_ACTIONS[0].summarize({ name: 'Smoke' }).includes('Smoke'))
})
