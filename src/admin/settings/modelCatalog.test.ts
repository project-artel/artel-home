import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { filterModels, groupModelsByRoute } from './modelCatalog'
import type { AdminLlmModel, LlmModelRoute } from './settingsApi'

function model(id: string, route: LlmModelRoute, enabled = true, label = id): AdminLlmModel {
  return {
    id,
    label,
    provider: id.split('/')[0],
    route,
    enabled,
    supportsVision: false,
    maxInputTokens: null,
    updatedAt: null,
  }
}

describe('groupModelsByRoute', () => {
  it('orders groups OpenRouter, Bedrock, Claude, GPT and drops empty routes', () => {
    const groups = groupModelsByRoute([
      model('claude/opus', 'claude'),
      model('openai/gpt', 'openrouter'),
      model('bedrock/haiku', 'bedrock'),
    ])
    assert.deepEqual(
      groups.map((group) => group.route),
      ['openrouter', 'bedrock', 'claude'],
    )
  })

  it('keeps the incoming order inside a group and counts enabled models', () => {
    const [group] = groupModelsByRoute([
      model('b', 'openrouter', true),
      model('a', 'openrouter', false),
      model('c', 'openrouter', true),
    ])
    assert.deepEqual(
      group.models.map((row) => row.id),
      ['b', 'a', 'c'],
    )
    assert.equal(group.enabledCount, 2)
  })

  it('returns no groups for an empty list', () => {
    assert.deepEqual(groupModelsByRoute([]), [])
  })
})

describe('filterModels', () => {
  const models = [
    model('anthropic/claude-opus-5.5', 'openrouter', true, 'Claude Opus 5.5'),
    model('google/gemini-3.8-flash', 'openrouter', true, 'Gemini 3.8 Flash'),
  ]

  it('returns every model for a blank query', () => {
    assert.equal(filterModels(models, '   ').length, 2)
  })

  it('matches label, id or provider without case', () => {
    assert.deepEqual(
      filterModels(models, 'OPUS').map((row) => row.id),
      ['anthropic/claude-opus-5.5'],
    )
    assert.deepEqual(
      filterModels(models, 'gemini-3.8').map((row) => row.id),
      ['google/gemini-3.8-flash'],
    )
    assert.deepEqual(
      filterModels(models, 'google').map((row) => row.id),
      ['google/gemini-3.8-flash'],
    )
  })

  it('returns nothing when no field matches', () => {
    assert.deepEqual(filterModels(models, 'grok'), [])
  })
})
