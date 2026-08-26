import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectApiError } from '../projects/projectApi'
import { qaStartConflict } from './qaApi'

/**
 * Why a run was refused is read from `code`, never from the message.
 *
 * The previous rule matched the word "sdk" in the server's prose and treated
 * everything else as "already running" — so "this test run has no scenarios"
 * told the operator to go end a run that did not exist. These pin the mapping to
 * the wire contract, which is the half that does not move when we reword copy.
 */

function conflict(code: string, message = 'anything at all') {
  return new ProjectApiError(409, message, code)
}

test('reads each start conflict from its code', () => {
  assert.equal(qaStartConflict(conflict('sdk_disconnected')), 'sdk_disconnected')
  assert.equal(qaStartConflict(conflict('qa_run_active')), 'qa_run_active')
  assert.equal(qaStartConflict(conflict('test_run_empty')), 'test_run_empty')
})

test('does not read the reason out of the message', () => {
  // 예전 규칙이라면 "sdk"가 들어간 이 메시지를 SDK 미연결로 읽었다.
  assert.equal(qaStartConflict(conflict('test_run_empty', 'no scenarios for this sdk run')), 'test_run_empty')
  // 반대로 코드가 없으면 산문이 무엇이든 특정 사유로 단정하지 않는다.
  assert.equal(qaStartConflict(new ProjectApiError(409, 'that game already has a QA run')), null)
})

test('is null for anything that is not a start conflict', () => {
  assert.equal(qaStartConflict(new ProjectApiError(404, 'gone', 'not_found')), null)
  assert.equal(qaStartConflict(new ProjectApiError(409, 'other', 'conflict')), null)
  assert.equal(qaStartConflict(new Error('network down')), null)
  assert.equal(qaStartConflict(null), null)
})
