import assert from 'node:assert/strict'
import test from 'node:test'
import type { GeneratedTestCases } from '../../contentMap/generateContentMapTestCases'
import type { GenerationCandidate } from '../../testCases/generationCandidates'
import { runGenerateFromMap } from '../../testCases/generateFromMapRun'
import { TEST_CASES_ACTIONS, TEST_CASES_FIELDS } from './testCases'

test('test case specs are prefixed by the page and name it', () => {
  for (const action of TEST_CASES_ACTIONS) {
    assert.equal(action.page, 'testCases')
    assert.ok(action.id.startsWith('testCases.'), action.id)
  }
  for (const field of TEST_CASES_FIELDS) {
    assert.equal(field.page, 'testCases')
    assert.ok(field.name.startsWith('testCases.'), field.name)
  }
})

test('deleting and overwriting need approval, the rest run on their own', () => {
  const risk = Object.fromEntries(TEST_CASES_ACTIONS.map((action) => [action.id, action.risk]))
  assert.deepEqual(risk, {
    'testCases.openGenerateDialog': 'auto',
    'testCases.generate': 'auto',
    'testCases.overwriteGenerated': 'approve',
    'testCases.openNewCase': 'auto',
    'testCases.open': 'auto',
    'testCases.delete': 'approve',
    'testCases.deleteListed': 'approve',
  })
})

test('argument schemas are objects and every required name is declared', () => {
  for (const action of TEST_CASES_ACTIONS) {
    assert.equal(action.args.type, 'object', action.id)
    assert.ok(action.description.length > 40, action.id)
    for (const required of action.args.required ?? []) assert.ok(action.args.properties?.[required], `${action.id}.${required}`)
  }
  const remove = TEST_CASES_ACTIONS.find((action) => action.id === 'testCases.delete')
  assert.equal(remove?.args.properties?.testCaseIds?.items?.type, 'string')
  assert.equal(remove?.summarize({ testCaseIds: ['1', '2'] }), 'Delete 2 test cases')
})

const result: GeneratedTestCases = { created: 3, updated: 0, deleted: 0, broken: 0, carriedOver: 1 } as GeneratedTestCases
const candidate = (overrides: Partial<GenerationCandidate>): GenerationCandidate => ({
  gameBuildId: '5',
  isEditor: false,
  version: '1.2',
  label: null,
  createdAt: '',
  mapState: 'READY',
  generated: false,
  mapCases: 0,
  judged: 0,
  ...overrides,
})
const messages = { notReady: 'not ready', buildMissing: 'missing' }

function dependencies(candidates: GenerationCandidate[]) {
  const calls: Array<[string, boolean]> = []
  return {
    calls,
    dependencies: {
      listCandidates: async () => candidates,
      generate: async (target: GenerationCandidate, overwrite: boolean) => {
        calls.push([target.gameBuildId, overwrite])
        return result
      },
      messages,
    },
  }
}

test('generating a fresh build creates, and overwriting one needs generated cases', async () => {
  const fresh = dependencies([candidate({})])
  assert.equal((await runGenerateFromMap('5', false, fresh.dependencies)).result, result)
  assert.deepEqual(fresh.calls, [['5', false]])
  await assert.rejects(runGenerateFromMap('5', true, fresh.dependencies), /nothing to overwrite/)

  const done = dependencies([candidate({ generated: true })])
  await runGenerateFromMap('5', true, done.dependencies)
  assert.deepEqual(done.calls, [['5', true]])
  await assert.rejects(runGenerateFromMap('5', false, done.dependencies), /testCases.overwriteGenerated/)
})

test('a missing build or an unread map never reaches the server', async () => {
  const unread = dependencies([candidate({ mapState: 'NOT_READ' })])
  await assert.rejects(runGenerateFromMap('5', false, unread.dependencies), /not ready/)
  await assert.rejects(runGenerateFromMap('9', false, unread.dependencies), /missing/)
  assert.deepEqual(unread.calls, [])
})
