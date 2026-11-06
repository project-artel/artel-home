/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { QaModel } from '../../qa/qaTypes.ts'
import {
  choiceFromOptionKey,
  defaultModelName,
  parseProjectAgentModel,
  parseProjectLevelAgentModel,
  platformModels,
  projectAgentModelPath,
  preferenceOptionKey,
  saveFailureText,
} from './projectAgentModelApi.ts'

const model = (id: string, keySource: 'platform' | 'user', label = id) =>
  ({ id, label, keySource }) as unknown as QaModel

test('parses a full body and tolerates a missing one', () => {
  assert.deepEqual(
    parseProjectAgentModel({ model: 'm', keySource: 'user', effectiveModel: 'm', effectiveKeySource: 'user', problem: 'llm_key_missing' }),
    { model: 'm', keySource: 'user', effectiveModel: 'm', effectiveKeySource: 'user', problem: 'llm_key_missing' },
  )
  assert.deepEqual(parseProjectAgentModel(null), {
    model: null, keySource: null, effectiveModel: null, effectiveKeySource: null, problem: null,
  })
  assert.equal(parseProjectAgentModel({ keySource: 'bogus' }).keySource, null)
})

test('option keys round-trip through the choice body', () => {
  const models = [model('a', 'platform'), model('a', 'user')]
  const pref = parseProjectAgentModel({ model: 'a', keySource: 'user' })
  assert.equal(preferenceOptionKey(pref), 'user:a')
  assert.deepEqual(choiceFromOptionKey('user:a', models), { model: 'a', keySource: 'user' })
  assert.deepEqual(choiceFromOptionKey('', models), { model: null, keySource: null })
  assert.equal(choiceFromOptionKey('platform:zzz', models), null)
  assert.equal(preferenceOptionKey(parseProjectAgentModel({})), '')
})

test('default model name uses the effective model only when nothing is chosen', () => {
  const models = [model('a', 'platform', 'Model A')]
  assert.equal(defaultModelName(parseProjectAgentModel({ effectiveModel: 'a' }), models), 'Model A')
  assert.equal(defaultModelName(parseProjectAgentModel({ effectiveModel: 'x' }), models), 'x')
  assert.equal(defaultModelName(parseProjectAgentModel({ model: 'a', effectiveModel: 'a' }), models), null)
  assert.equal(defaultModelName(null, models), null)
})

test('save failure text prefers the error code', () => {
  assert.equal(saveFailureText({ code: 'llm_key_missing', message: 'x' }), 'llm_key_missing')
  assert.equal(saveFailureText(new Error('boom')), 'boom')
})

test('project id goes into the query string', () => {
  assert.equal(projectAgentModelPath(), '/api/auth/me/project-agent-model')
  assert.equal(projectAgentModelPath('12'), '/api/auth/me/project-agent-model?projectId=12')
})

test('project level body and platform-only options', () => {
  assert.deepEqual(parseProjectLevelAgentModel({ model: 'a', effectiveModel: 'a', keySource: 'user' }), {
    model: 'a', effectiveModel: 'a', problem: null,
  })
  assert.deepEqual(
    platformModels([model('a', 'platform'), model('a', 'user')]).map((one) => one.keySource),
    ['platform'],
  )
})
