import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isModelKeyMissing } from './modelKeyWarning'
import { parseAdminLlmModel } from './settingsApi'

const models = [
  parseAdminLlmModel({ id: 'claude/sonnet', label: 'S', route: 'claude', enabled: true }),
  parseAdminLlmModel({ id: 'gpt/x', label: 'G', route: 'gpt', enabled: true }),
  parseAdminLlmModel({ id: 'openai/y', label: 'O', route: 'openrouter', enabled: true }),
]

function check(modelId: string | null, over: Partial<Parameters<typeof isModelKeyMissing>[0]> = {}) {
  return isModelKeyMissing({
    modelId,
    models,
    keyMissing: [],
    savedModelId: null,
    claudeKeyConfigured: true,
    ...over,
  })
}

describe('isModelKeyMissing', () => {
  it('never warns for a default selection', () => {
    assert.equal(check(null, { claudeKeyConfigured: false }), false)
  })

  it('always warns for a gpt model', () => {
    assert.equal(check('gpt/x'), true)
  })

  it('follows the Claude key status for a claude model, ignoring a stale server list', () => {
    assert.equal(check('claude/sonnet', { claudeKeyConfigured: false }), true)
    assert.equal(check('claude/sonnet', { claudeKeyConfigured: true, keyMissing: ['claude/sonnet'], savedModelId: 'claude/sonnet' }), false)
  })

  it('uses the server list for the saved choice while the Claude status loads', () => {
    assert.equal(check('claude/sonnet', { claudeKeyConfigured: null, keyMissing: ['claude/sonnet'], savedModelId: 'claude/sonnet' }), true)
  })

  it('trusts the server list only while the selection is unchanged', () => {
    assert.equal(check('openai/y', { keyMissing: ['openai/y'], savedModelId: 'openai/y' }), true)
    assert.equal(check('openai/y', { keyMissing: ['openai/y'], savedModelId: null }), false)
  })
})
