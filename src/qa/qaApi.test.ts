import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectApiError } from '../projects/projectApi'
import { parseQaModels, parseQaTry, qaRunRequestBody, qaStartConflict } from './qaApi'
import { toArchRequest } from './qaArch'

const QA_TRY_FIELDS = {
  id: '41',
  testScenarioId: '7',
  gameInstanceId: '3',
  agentSessionId: null,
  status: 'RUNNING',
  startedAt: '2026-09-01T00:00:00Z',
  completedAt: null,
}

/**
 * `qaRunId` (ARTEL-723) degrades to `null` rather than failing the parse: it is
 * missing from every server that has not deployed ARTEL-722 yet, and the
 * console has to render the grey no-link row for that case, not an error.
 */
test('parseQaTry reads qaRunId when present', () => {
  const parsed = parseQaTry({ ...QA_TRY_FIELDS, qaRunId: '9' })
  assert.equal(parsed.qaRunId, '9')
})

test('parseQaTry reads a missing qaRunId as null, not a parse failure', () => {
  const parsed = parseQaTry({ ...QA_TRY_FIELDS })
  assert.equal(parsed.qaRunId, null)
})

test('parseQaTry reads a malformed qaRunId as null', () => {
  assert.equal(parseQaTry({ ...QA_TRY_FIELDS, qaRunId: 'not-a-decimal-id' }).qaRunId, null)
  assert.equal(parseQaTry({ ...QA_TRY_FIELDS, qaRunId: 9 }).qaRunId, null)
  assert.equal(parseQaTry({ ...QA_TRY_FIELDS, qaRunId: null }).qaRunId, null)
})

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

const MODEL_FIELDS = {
  id: 'openai/gpt-6-luna',
  label: 'GPT-6 Luna',
  provider: 'openai',
  supportsVision: true,
  multimodal: true,
  inputModalities: ['text', 'image'],
  reasoning: null,
}

/**
 * The key fields are new and optional: today's `/api/qa-models` sends none of
 * them, and the picker has to keep offering every model — on the platform key,
 * which is what the server does with them now.
 */
test('parseQaModels reads a model without key fields as offered on the platform key', () => {
  const [parsed] = parseQaModels([MODEL_FIELDS], 200)

  assert.equal(parsed.keySource, 'platform')
  assert.equal(parsed.keyProvider, null)
  assert.equal(parsed.keyRegistered, true)
  assert.equal(parsed.keyHint, null)
  assert.equal(parsed.pricing, null)
})

test('parseQaModels reads a user model with its key and price', () => {
  const [parsed] = parseQaModels([{
    ...MODEL_FIELDS,
    keySource: 'user',
    keyProvider: 'anthropic',
    keyRegistered: true,
    keyHint: 'sk-ant-…4f2a',
    pricing: { inputPerMtok: 2, outputPerMtok: 10, asOf: '2026-10-07' },
  }], 200)

  assert.equal(parsed.keySource, 'user')
  assert.equal(parsed.keyProvider, 'anthropic')
  assert.equal(parsed.keyRegistered, true)
  assert.equal(parsed.keyHint, 'sk-ant-…4f2a')
  assert.deepEqual(parsed.pricing, { inputPerMtok: 2, outputPerMtok: 10 })
})

test('parseQaModels does not treat a user model with no keyRegistered flag as callable', () => {
  const [parsed] = parseQaModels([{ ...MODEL_FIELDS, keySource: 'user' }], 200)

  assert.equal(parsed.keyRegistered, false)
})

test('parseQaModels reads an unknown keySource as the platform key', () => {
  assert.equal(parseQaModels([{ ...MODEL_FIELDS, keySource: 'team' }], 200)[0].keySource, 'platform')
})

test('qaRunRequestBody has no arch key when arch is null', () => {
  const body = qaRunRequestBody('1', '2', 'm', 'platform', null, false, null)
  assert.equal('arch' in body, false)
})

test('qaRunRequestBody carries arch verbatim when given', () => {
  const arch = { label: 'x', phase_cycle: 'off' } as const
  const body = qaRunRequestBody('1', '2', 'm', 'platform', null, true, arch)
  assert.deepEqual(body.arch, arch)
  assert.equal(body.force, true)
})

test('planner_executer run 의 wire body 는 arch 에 engine 하나뿐이다', () => {
  const arch = toArchRequest({ label: 'arm', engine: 'planner_executer', phase_cycle: 'off' })
  const wire = JSON.parse(JSON.stringify(qaRunRequestBody('1', '2', 'm', 'platform', null, false, arch)))
  assert.deepEqual(wire.arch, { engine: 'planner_executer' })
})
