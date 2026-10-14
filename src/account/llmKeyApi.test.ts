import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectApiError } from '../projects/projectApi'
import { llmKeyRefusal, parseLlmKeys } from './llmKeyApi'

test('parseLlmKeys keeps rows with a known service and a key hint', () => {
  const keys = parseLlmKeys([
    { service: 'anthropic', keyHint: 'sk-ant-…4f2a', verifiedAt: '2026-10-14T04:00:00Z' },
    { service: 'gemini', keyHint: 'x' },
    { service: 'openai', keyHint: '' },
    { service: 'openrouter' },
    null,
  ])

  assert.deepEqual(keys, [
    { service: 'anthropic', keyHint: 'sk-ant-…4f2a', verifiedAt: '2026-10-14T04:00:00Z' },
  ])
})

test('parseLlmKeys reads anything but an array as no keys', () => {
  assert.deepEqual(parseLlmKeys({ keys: [] }), [])
})

/**
 * A refusal is read from `code`, and a 503 is never called a wrong key: the
 * provider was not reached, so nothing is known about the key.
 */
test('llmKeyRefusal reads the reason from the code, and 503 as unverified', () => {
  assert.equal(llmKeyRefusal(new ProjectApiError(400, 'x', 'llm_key_invalid')), 'invalid')
  assert.equal(llmKeyRefusal(new ProjectApiError(400, 'x', 'llm_key_permission_denied')), 'permission_denied')
  assert.equal(llmKeyRefusal(new ProjectApiError(503, 'x', 'llm_key_invalid')), 'unverified')
  assert.equal(llmKeyRefusal(new ProjectApiError(500, 'x')), 'failed')
  assert.equal(llmKeyRefusal(new Error('network')), 'failed')
})
