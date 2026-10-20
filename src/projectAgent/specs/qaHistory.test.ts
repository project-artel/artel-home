import assert from 'node:assert/strict'
import test from 'node:test'
import { QA_HISTORY_ACTIONS, QA_HISTORY_FIELDS, qaRunIdArg } from './qaHistory'

test('qaHistory ids and risks', () => {
  assert.deepEqual(QA_HISTORY_ACTIONS.map((action) => [action.id, action.risk]), [['qaHistory.openRun', 'auto']])
  assert.deepEqual(QA_HISTORY_FIELDS.map((field) => field.name), ['qaHistory.filter', 'qaHistory.run'])
  assert.deepEqual(QA_HISTORY_ACTIONS[0].args.required, ['qaRunId'])
})

test('qaRunIdArg accepts digits only', () => {
  assert.equal(qaRunIdArg({ qaRunId: '55' }), '55')
  assert.equal(qaRunIdArg({ qaRunId: 55 }), '55')
  assert.throws(() => qaRunIdArg({ qaRunId: '5/../x' }), /made of digits/)
  assert.throws(() => qaRunIdArg({}), /made of digits/)
})
