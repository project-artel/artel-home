import assert from 'node:assert/strict'
import test from 'node:test'
import {
  groupQaModels,
  offeredQaModels,
  qaModelDisplayLabel,
  selectableQaModelKeys,
} from './qaModelGroups'
import type { QaModel } from './qaTypes'

function model(fields: Partial<QaModel> & Pick<QaModel, 'id'>): QaModel {
  return {
    label: fields.id,
    provider: 'openai',
    supportsVision: false,
    inputModalities: ['text'],
    multimodal: false,
    reasoning: null,
    keySource: 'platform',
    keyProvider: null,
    keyRegistered: true,
    keyHint: null,
    pricing: null,
    ...fields,
  }
}

const CATALOG = [
  model({ id: 'openai/gpt-6-luna', label: 'GPT-6 Luna' }),
  model({ id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5', provider: 'anthropic' }),
  model({
    id: 'openai/gpt-6.1-sol',
    label: 'GPT-6.1 Sol',
    keySource: 'user',
    keyProvider: 'openrouter',
    keyRegistered: false,
  }),
  model({
    id: 'x-ai/grok-4.7',
    label: 'Grok 4.7',
    provider: 'x-ai',
    keySource: 'user',
    keyProvider: 'openrouter',
    keyRegistered: false,
  }),
  model({
    id: 'anthropic-api/claude-opus-5-5',
    label: 'Claude Opus 5.5',
    provider: 'anthropic',
    keySource: 'user',
    keyProvider: 'anthropic',
    keyHint: 'sk-ant-…4f2a',
  }),
  model({
    id: 'anthropic/claude-sonnet-5.5',
    label: 'Claude Sonnet 5.5',
    provider: 'anthropic',
    keySource: 'user',
    keyProvider: 'anthropic',
    keyHint: 'sk-ant-…4f2a',
  }),
]

test('platform models and user models land in their own sections', () => {
  const groups = groupQaModels(CATALOG)

  assert.deepEqual(groups.platform.map((m) => m.id), ['openai/gpt-6-luna', 'anthropic/claude-sonnet-5.5'])
  assert.deepEqual(
    groups.user.map((g) => [g.provider, g.registered, g.keyHint, g.models.length]),
    [
      ['anthropic', true, 'sk-ant-…4f2a', 2],
      ['openrouter', false, null, 2],
    ],
  )
})

test('key services keep a fixed order, with or without a key', () => {
  const groups = groupQaModels([
    model({ id: 'or/x', keySource: 'user', keyProvider: 'openrouter' }),
    model({ id: 'acme/x', keySource: 'user', keyProvider: 'acme' }),
    model({ id: 'oa/x', keySource: 'user', keyProvider: 'openai', keyRegistered: false }),
    model({ id: 'an/x', keySource: 'user', keyProvider: 'anthropic', keyRegistered: false }),
  ])

  assert.deepEqual(groups.user.map((g) => g.provider), ['anthropic', 'openai', 'openrouter', 'acme'])
})

test('one OpenRouter key groups models from several makers', () => {
  const openrouter = groupQaModels(CATALOG).user.find((g) => g.provider === 'openrouter')

  assert.deepEqual(openrouter?.models.map((m) => m.provider), ['openai', 'x-ai'])
})

test('a user model with no keyProvider is grouped under its maker', () => {
  const groups = groupQaModels([model({ id: 'a/b', provider: 'acme', keySource: 'user' })])

  assert.equal(groups.user[0].provider, 'acme')
})

test('the keyboard walks every platform model and only the user models that have a key', () => {
  assert.deepEqual(selectableQaModelKeys(groupQaModels(CATALOG)), [
    'platform:openai/gpt-6-luna',
    'platform:anthropic/claude-sonnet-5.5',
    'user:anthropic-api/claude-opus-5-5',
    'user:anthropic/claude-sonnet-5.5',
  ])
})

test('the same model on both keys stays two options', () => {
  const keys = selectableQaModelKeys(groupQaModels(CATALOG))

  assert.ok(keys.includes('platform:anthropic/claude-sonnet-5.5'))
  assert.ok(keys.includes('user:anthropic/claude-sonnet-5.5'))
})

test('the search matches label, provider or id, ignoring case', () => {
  assert.deepEqual(
    groupQaModels(CATALOG, 'OPUS').user.flatMap((g) => g.models.map((m) => m.id)),
    ['anthropic-api/claude-opus-5-5'],
  )
  assert.equal(groupQaModels(CATALOG, 'anthropic').platform.length, 1)
  assert.equal(groupQaModels(CATALOG, 'gpt-6.1').user[0].models[0].id, 'openai/gpt-6.1-sol')
  assert.deepEqual(groupQaModels(CATALOG, 'nothing like this'), { platform: [], user: [] })
})

test('Bedrock models are not offered on the platform key', () => {
  const offered = offeredQaModels([
    model({ id: 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0', provider: 'anthropic' }),
    model({ id: 'openai/gpt-6-luna' }),
  ])

  assert.deepEqual(offered.map((m) => m.id), ['openai/gpt-6-luna'])
})

test('Anthropic models drop "Claude" from their name and others keep theirs', () => {
  const platform = { keySource: 'platform', keyProvider: null } as const
  assert.equal(qaModelDisplayLabel({ ...platform, label: 'Claude Opus 5.5', provider: 'anthropic' }), 'Opus 5.5')
  assert.equal(qaModelDisplayLabel({ ...platform, label: 'GPT-6 Luna', provider: 'openai' }), 'GPT-6 Luna')
  assert.equal(qaModelDisplayLabel({ ...platform, label: 'Claude-ish', provider: 'acme' }), 'Claude-ish')
})

test('"(free)" is dropped from a name', () => {
  assert.equal(
    qaModelDisplayLabel({ label: 'Gemma 4 (free)', provider: 'google', keySource: 'platform', keyProvider: null }),
    'Gemma 4',
  )
})

test('only a model on the user\'s OpenRouter key names its route', () => {
  const sonnet = { label: 'Claude Sonnet 5.5', provider: 'anthropic' }
  assert.equal(qaModelDisplayLabel({ ...sonnet, keySource: 'platform', keyProvider: null }), 'Sonnet 5.5')
  assert.equal(
    qaModelDisplayLabel({ ...sonnet, keySource: 'user', keyProvider: 'openrouter' }),
    'Sonnet 5.5 (OpenRouter API)',
  )
  assert.equal(
    qaModelDisplayLabel({ label: 'Gemma 4 (free)', provider: 'google', keySource: 'user', keyProvider: 'openrouter' }),
    'Gemma 4 (OpenRouter API)',
  )
  assert.equal(
    qaModelDisplayLabel({ label: 'Claude Opus 5.5 (Claude API)', provider: 'anthropic', keySource: 'user', keyProvider: 'anthropic' }),
    'Opus 5.5 (Claude API)',
  )
})
