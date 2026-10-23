import assert from 'node:assert/strict'
import test from 'node:test'
import { PAGE_CATALOG, catalogEntry, wireCatalog } from '../catalog'
import { CONTENT_MAP_ACTIONS, CONTENT_MAP_FIELDS } from './contentMap'
import type { ActionBinding } from '../registry/types'
import { requireBoolean, requireKnownId, requireReasoningValue } from './fieldWriters'
import { QA_ACTIONS, QA_FIELDS, createQaStartRunner, type StartOutcome } from './qa'
import { TEST_RUNS_ACTIONS, TEST_RUNS_FIELDS } from './testRuns'

const SPEC_PAGES = [
  { page: 'contentMap', fields: CONTENT_MAP_FIELDS, actions: CONTENT_MAP_ACTIONS },
  { page: 'qa', fields: QA_FIELDS, actions: QA_ACTIONS },
  { page: 'testRuns', fields: TEST_RUNS_FIELDS, actions: TEST_RUNS_ACTIONS },
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
    'testRuns.open': 'auto',
    'testRuns.openMap': 'auto',
    'qa.startRun': 'approve',
    'contentMap.scan': 'auto',
    'contentMap.scanAndGenerateTestCases': 'auto',
    'contentMap.overwriteTestCases': 'approve',
    'qaHistory.openRun': 'auto',
    'issues.open': 'auto',
    'issues.setStatus': 'approve',
    'issues.openTracker': 'auto',
    'issues.createTrackerTicket': 'approve',
    'qaRun.selectScenario': 'auto',
    'qaRun.cancel': 'approve',
    'qaRun.openPerformance': 'auto',
    'qaRun.switchLogView': 'auto',
    'documents.openUpload': 'auto',
    'documents.retryUpload': 'approve',
    'documents.delete': 'approve',
    'testCases.openGenerateDialog': 'auto',
    'testCases.generate': 'auto',
    'testCases.overwriteGenerated': 'approve',
    'testCases.openNewCase': 'auto',
    'testCases.open': 'auto',
    'testCases.delete': 'approve',
    'testCases.deleteListed': 'approve',
    'members.invite': 'approve',
    'members.removeMember': 'approve',
    'members.revokeInvitation': 'approve',
    'settings.save': 'approve',
    'settings.connectTracker': 'approve',
    'settings.disconnectTracker': 'approve',
    'settings.openDeleteProject': 'approve',
    'setup.showSdkPackageUrl': 'auto',
    'setup.showCliCommands': 'auto',
    'macros.openSource': 'auto',
    'performance.openRunReport': 'auto',
    'knowledge.openNode': 'auto',
    'testRun.openEditor': 'auto',
    'testRun.selectScenario': 'auto',
    'testRun.openScenario': 'auto',
    'testRun.startQa': 'auto',
    'testRunEdit.selectScenario': 'auto',
    'testRunEdit.addScenario': 'auto',
    'testRunEdit.deleteScenario': 'approve',
    'testRunEdit.approveScenario': 'approve',
    'testRunEdit.renameRun': 'auto',
    'testScenario.convertToFree': 'approve',
    'testScenario.addCases': 'auto',
    'testScenario.removeCases': 'auto',
    'testScenario.addCasesToBuild': 'approve',
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

test('qa.startRun calls start() with no arguments even when the agent sends force', async () => {
  const startCalls: unknown[][] = []
  const runner = createQaStartRunner({
    start: async (...startArgs: [boolean?]) => {
      startCalls.push(startArgs)
      return { kind: 'started', qaRunId: '55' }
    },
    blockedReason: () => null,
    blockedHint: 'blocked',
  })
  const binding: ActionBinding['run'] = runner
  assert.deepEqual(await binding({ force: true }), { qaRunId: '55' })
  assert.deepEqual(startCalls, [[]])
})

test('qa.startRun turns a takeover, a failure and a blocked form into errors', async () => {
  const runnerFor = (outcome: StartOutcome | null) =>
    createQaStartRunner({ start: async () => outcome, blockedReason: () => 'game not connected', blockedHint: 'blocked' })
  await assert.rejects(runnerFor({ kind: 'takeoverNeeded' })(), /already running another QA run/)
  await assert.rejects(runnerFor({ kind: 'failed', message: 'server said no' })(), /server said no/)
  await assert.rejects(runnerFor(null)(), /game not connected/)
})

test('requireKnownId accepts a listed id, also as a number, and throws for anything else', () => {
  assert.equal(requireKnownId('qa.testRunId', '3', ['3', '4']), '3')
  assert.equal(requireKnownId('qa.testRunId', 4, ['3', '4']), '4')
  assert.throws(() => requireKnownId('qa.testRunId', '9', ['3', '4']), /qa.testRunId has no option "9"/)
  assert.throws(() => requireKnownId('contentMap.build', null, ['3']), /contentMap.build has no option null/)
})

test('requireBoolean throws for a non-boolean', () => {
  assert.equal(requireBoolean('qa.reasoningEnabled', false), false)
  assert.throws(() => requireBoolean('qa.reasoningEnabled', 'true'), /must be true or false/)
})

test('requireReasoningValue accepts only indices of the efforts or tokens inside the range', () => {
  const effort = { kind: 'effort', effortCount: 3 } as const
  assert.equal(requireReasoningValue(2, effort), 2)
  assert.equal(requireReasoningValue('0', effort), 0)
  assert.throws(() => requireReasoningValue(3, effort), /from 0 to 2/)
  assert.throws(() => requireReasoningValue(1.5, effort), /from 0 to 2/)
  assert.throws(() => requireReasoningValue('', effort), /from 0 to 2/)
  const tokens = { kind: 'max_tokens', minTokens: 1024, maxTokens: 8192 } as const
  assert.equal(requireReasoningValue(4096, tokens), 4096)
  assert.throws(() => requireReasoningValue(100, tokens), /from 1024 to 8192/)
  assert.throws(() => requireReasoningValue(1, null), /does not support reasoning/)
})
