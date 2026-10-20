import assert from 'node:assert/strict'
import test from 'node:test'
import { createCancelRunner, QA_RUN_ACTIONS, QA_RUN_FIELDS, requireLogView, requireTryId } from './qaRun'

test('qaRun ids and risks: cancel needs approval, nothing takes force', () => {
  assert.deepEqual(
    QA_RUN_ACTIONS.map((action) => [action.id, action.risk]),
    [
      ['qaRun.selectScenario', 'auto'],
      ['qaRun.cancel', 'approve'],
      ['qaRun.openPerformance', 'auto'],
      ['qaRun.switchLogView', 'auto'],
    ],
  )
  assert.deepEqual(QA_RUN_FIELDS.map((field) => field.name), ['qaRun.scenario'])
  for (const action of QA_RUN_ACTIONS) assert.equal(action.args.properties?.force, undefined)
  assert.deepEqual(QA_RUN_ACTIONS[3].args.properties?.view?.enum, ['flow', 'raw', 'issues'])
})

test('requireTryId and requireLogView reject unknown values', () => {
  assert.equal(requireTryId({ tryId: '3' }, ['3', '4']), '3')
  assert.equal(requireTryId({ tryId: 4 }, ['3', '4']), '4')
  assert.throws(() => requireTryId({ tryId: '9' }, ['3']), /no scenario with try id "9"/)
  assert.equal(requireLogView({ view: 'raw' }), 'raw')
  assert.throws(() => requireLogView({ view: 'tools' }), /flow, raw, issues/)
})

test('cancel runner reports success and turns a failure into the on-screen message', async () => {
  assert.deepEqual(await createCancelRunner(async () => true, () => 'failed')(), { cancelled: true })
  await assert.rejects(createCancelRunner(async () => false, () => 'Could not cancel')(), /Could not cancel/)
})
