import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import {
  SettingsApiError,
  checkBedrockModels,
  checkLlmModels,
  getBedrockSettings,
  getFeatureModels,
  getTypesafeSettings,
  parseTypesafeSettings,
  putTypesafeKey,
  parseFeatureModels,
  putFeatureModels,
  invalidateLlmCache,
  parseBedrockSettings,
  parseCacheInvalidation,
  putBedrockKey,
  createAdminUser,
  listLlmModels,
  parseAdminLlmModel,
  setLlmModelEnabled,
  parseLlmSettings,
  parseTemporaryPassword,
  putLlmKey,
  resetAdminUserPassword,
  updateAdminUser,
  getTelemetryPreview,
  getTelemetrySettings,
  parseTelemetrySettings,
  putTelemetryConsent,
} from './settingsApi'

const originalFetch = globalThis.fetch

function stubFetch(body: unknown, status = 200) {
  const fetchMock = mock.fn(async (...requestArguments: Parameters<typeof fetch>) => {
    void requestArguments
    return ({
    ok: status < 400,
    status,
    json: async () => body,
  } as Response)
  })
  globalThis.fetch = fetchMock
  return fetchMock
}

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restoreAll()
})

const userBody = {
  id: '7',
  displayName: 'Ada',
  nickname: 'Ada',
  userTag: '0001',
  email: null,
  loginEmail: 'a@b.co',
  platformRole: 'USER',
  disabled: false,
  hasPassword: true,
  mustChangePassword: true,
  oauthProviders: ['github'],
  createdAt: '2026-10-06T00:00:00Z',
}

describe('admin user endpoints', () => {
  it('posts the new account and reads the one-time password', async () => {
    const fetchMock = stubFetch({ user: userBody, temporaryPassword: 'x'.repeat(20) }, 201)

    const result = await createAdminUser({ email: 'a@b.co', name: 'Ada', platformRole: 'USER' })

    const [url, init] = fetchMock.mock.calls[0].arguments
    assert.equal(url, 'http://localhost:8080/api/admin/users')
    assert.equal(init?.method, 'POST')
    assert.equal(result.temporaryPassword.length, 20)
    assert.equal(result.user.loginEmail, 'a@b.co')
    assert.deepEqual(result.user.oauthProviders, ['github'])
    assert.equal(result.user.mustChangePassword, true)
  })

  it('rejects a creation response without a temporary password', () => {
    assert.throws(() => parseTemporaryPassword({ user: userBody }))
  })

  it('carries the error code of a refused reset', async () => {
    stubFetch({ code: 'login_email_missing', message: 'no email', fields: {} }, 409)
    await assert.rejects(resetAdminUserPassword('7'), {
      status: 409,
      code: 'login_email_missing',
    })
  })

  it('patches only the field that changes and reads the user back', async () => {
    const fetchMock = stubFetch(userBody)
    const user = await updateAdminUser('7', { disabled: true })
    const [url, init] = fetchMock.mock.calls[0].arguments
    assert.equal(url, 'http://localhost:8080/api/admin/users/7')
    assert.equal(init?.method, 'PATCH')
    assert.deepEqual(JSON.parse(init?.body as string), { disabled: true })
    assert.equal(user.id, '7')
  })

  it('surfaces last_admin as a typed error', async () => {
    stubFetch({ code: 'last_admin', message: 'x', fields: {} }, 409)
    const error = await updateAdminUser('7', { platformRole: 'USER' }).catch((e) => e)
    assert.ok(error instanceof SettingsApiError)
    assert.equal(error.code, 'last_admin')
  })
})

describe('OpenRouter key endpoints', () => {
  const settingsBody = {
    configured: true,
    source: 'admin',
    maskedKey: '****abcd',
    adminKeyStored: true,
    adminKeyUnreadable: false,
    adminKeyUpdatedAt: '2026-10-06T00:00:00Z',
    secretsKeyConfigured: true,
    lastCheck: null,
  }

  it('reads settings without any plain key field', () => {
    const settings = parseLlmSettings({ ...settingsBody, apiKey: 'must-not-be-surfaced' })
    assert.equal(settings.maskedKey, '****abcd')
    assert.equal(settings.source, 'admin')
    assert.ok(!JSON.stringify(settings).includes('must-not-be-surfaced'))
  })

  it('treats the removed environment source as none', () => {
    assert.equal(parseLlmSettings({ source: 'environment', configured: false }).source, 'none')
  })

  it('treats an unknown source as none and a missing flag as saving allowed', () => {
    const settings = parseLlmSettings({ source: 'SOMETHING' })
    assert.equal(settings.source, 'none')
    assert.equal(settings.secretsKeyConfigured, true)
  })

  it('reports an unconfigured secrets key', () => {
    assert.equal(parseLlmSettings({ ...settingsBody, secretsKeyConfigured: false }).secretsKeyConfigured, false)
  })

  it('clears the key by sending null', async () => {
    const fetchMock = stubFetch({ ...settingsBody, configured: false, source: 'none', maskedKey: null })
    await putLlmKey(null)
    const [url, init] = fetchMock.mock.calls[0].arguments
    assert.equal(url, 'http://localhost:8080/api/admin/settings/llm')
    assert.equal(init?.method, 'PUT')
    assert.deepEqual(JSON.parse(init?.body as string), { apiKey: null })
  })

  it('surfaces secrets_key_missing from a save', async () => {
    stubFetch({ code: 'secrets_key_missing', message: 'x', fields: {} }, 409)
    await assert.rejects(putLlmKey('sk-or-abc'), { code: 'secrets_key_missing' })
  })

  it('reads which required models the key reaches', async () => {
    stubFetch({
      checkedAt: '2026-10-06T00:00:00Z',
      source: 'admin',
      maskedKey: '****abcd',
      keyValid: true,
      requiredModels: ['a', 'b'],
      reachableModels: ['a'],
      missingModels: ['b'],
      error: null,
    })
    const check = await checkLlmModels()
    assert.deepEqual(check.requiredModels, ['a', 'b'])
    assert.deepEqual(check.reachableModels, ['a'])
    assert.deepEqual(check.missingModels, ['b'])
    assert.equal(check.error, null)
  })

  it('reads a check that could not reach OpenRouter', async () => {
    stubFetch({ checkedAt: null, source: 'none', maskedKey: null, keyValid: null, requiredModels: [],
      reachableModels: [], missingModels: [], error: 'no_key' })
    assert.equal((await checkLlmModels()).error, 'no_key')
  })
})

describe('admin llm model endpoints', () => {
  const modelBody = {
    id: 'bedrock/us.openai.gpt-6.1-sol',
    label: 'GPT-6.1 Sol (AWS Bedrock)',
    provider: 'openai',
    route: 'bedrock',
    enabled: false,
    supportsVision: true,
    maxInputTokens: 922000,
    updatedAt: '2026-10-14T00:00:00Z',
  }

  it('parses a catalog row', () => {
    assert.deepEqual(parseAdminLlmModel(modelBody), modelBody)
  })

  it('falls back to safe values for missing or malformed fields', () => {
    const parsed = parseAdminLlmModel({ id: 'google/gemma-4-31b-it:free', enabled: 'yes', maxInputTokens: 'x' })
    assert.deepEqual(parsed, {
      id: 'google/gemma-4-31b-it:free',
      label: 'google/gemma-4-31b-it:free',
      provider: '',
      route: 'openrouter',
      enabled: false,
      supportsVision: false,
      maxInputTokens: null,
      updatedAt: null,
    })
    assert.equal(parseAdminLlmModel({ id: 'bedrock/x' }).route, 'bedrock')
  })

  it('lists rows from a bare array or an items wrapper', async () => {
    stubFetch([modelBody])
    assert.equal((await listLlmModels()).length, 1)
    stubFetch({ items: [modelBody, modelBody] })
    assert.equal((await listLlmModels()).length, 2)
    stubFetch({})
    assert.deepEqual(await listLlmModels(), [])
  })

  it('patches with the id in the body and reads back the row', async () => {
    const fetchMock = stubFetch({ ...modelBody, enabled: true })

    const result = await setLlmModelEnabled(modelBody.id, true)

    const [url, init] = fetchMock.mock.calls[0].arguments
    assert.equal(url, 'http://localhost:8080/api/admin/llm-models')
    assert.equal(init?.method, 'PATCH')
    assert.deepEqual(JSON.parse(init?.body as string), { id: modelBody.id, enabled: true })
    assert.equal(result.enabled, true)
  })

  it('raises the server code on a refusal', async () => {
    stubFetch({ code: 'not_found', message: 'unknown model' }, 404)
    await assert.rejects(setLlmModelEnabled('nope', true), { status: 404, code: 'not_found' })
  })
})

describe('Bedrock key endpoints', () => {
  const bedrockBody = {
    configured: true,
    maskedKey: '…abcd',
    updatedAt: '2026-10-14T00:00:00Z',
    region: 'us-west-2',
    lastCheck: {
      checkedAt: '2026-10-14T00:01:00Z',
      keyConfigured: true,
      models: [
        { id: 'bedrock/a', reachable: true, error: null },
        { id: 'bedrock/b', reachable: false, error: 'not available' },
      ],
    },
  }

  it('parses settings with the last check', () => {
    assert.deepEqual(parseBedrockSettings(bedrockBody), bedrockBody)
  })

  it('falls back to safe values for a malformed body', () => {
    assert.deepEqual(parseBedrockSettings({ lastCheck: 'x', models: 3 }), {
      configured: false,
      maskedKey: null,
      updatedAt: null,
      region: null,
      lastCheck: null,
    })
    const check = parseBedrockSettings({ lastCheck: { models: [{ id: 'm', reachable: 'yes' }] } }).lastCheck
    assert.equal(check?.keyConfigured, false)
    assert.deepEqual(check?.models[0], { id: 'm', reachable: false, error: null })
    assert.equal(check?.models.length, 1)
  })

  it('reads settings from the bedrock path', async () => {
    const fetchMock = stubFetch(bedrockBody)
    assert.equal((await getBedrockSettings()).region, 'us-west-2')
    assert.equal(fetchMock.mock.calls[0].arguments[0], 'http://localhost:8080/api/admin/settings/bedrock')
  })

  it('saves and deletes the key through PUT', async () => {
    const fetchMock = stubFetch(bedrockBody)
    await putBedrockKey('abc')
    await putBedrockKey(null)
    const [url, init] = fetchMock.mock.calls[0].arguments
    assert.equal(url, 'http://localhost:8080/api/admin/settings/bedrock')
    assert.equal(init?.method, 'PUT')
    assert.deepEqual(JSON.parse(init?.body as string), { apiKey: 'abc' })
    assert.deepEqual(JSON.parse(fetchMock.mock.calls[1].arguments[1]?.body as string), { apiKey: null })
  })

  it('surfaces secrets_key_missing from a save', async () => {
    stubFetch({ code: 'secrets_key_missing', message: 'x' }, 409)
    await assert.rejects(putBedrockKey('abc'), { status: 409, code: 'secrets_key_missing' })
  })

  it('posts the check and reads per-model results', async () => {
    const fetchMock = stubFetch(bedrockBody.lastCheck)
    const check = await checkBedrockModels()
    const [url, init] = fetchMock.mock.calls[0].arguments
    assert.equal(url, 'http://localhost:8080/api/admin/settings/bedrock/check')
    assert.equal(init?.method, 'POST')
    assert.deepEqual(check.models.map((model) => model.reachable), [true, false])
    assert.equal(check.models[1].error, 'not available')
  })
})

describe('cache invalidation endpoint', () => {
  it('posts and reads the result', async () => {
    const fetchMock = stubFetch({ agentServerInvalidated: true, error: null })
    const result = await invalidateLlmCache()
    const [url, init] = fetchMock.mock.calls[0].arguments
    assert.equal(url, 'http://localhost:8080/api/admin/settings/llm/invalidate-cache')
    assert.equal(init?.method, 'POST')
    assert.deepEqual(result, { agentServerInvalidated: true, error: null })
  })

  it('treats a missing flag as not invalidated and keeps the error text', () => {
    assert.deepEqual(parseCacheInvalidation({ error: 'timeout' }), { agentServerInvalidated: false, error: 'timeout' })
    assert.throws(() => parseCacheInvalidation(null))
  })
})

describe('feature model endpoints', () => {
  const body = {
    scenarioAuthoringModel: 'anthropic/claude-sonnet-5.5',
    scenarioAuthoringFallback: 'openai/gpt-6-luna',
    decisionModel: null,
    updatedAt: '2026-10-15T01:00:00Z',
  }

  it('reads nulls and strings as they are', () => {
    assert.deepEqual(parseFeatureModels(body), body)
    assert.deepEqual(parseFeatureModels({}), {
      scenarioAuthoringModel: null,
      scenarioAuthoringFallback: null,
      decisionModel: null,
      updatedAt: null,
    })
  })

  it('gets from the models endpoint', async () => {
    const fetchMock = stubFetch(body)
    const result = await getFeatureModels()
    assert.equal(fetchMock.mock.calls[0].arguments[0], 'http://localhost:8080/api/admin/settings/models')
    assert.equal(result.scenarioAuthoringFallback, 'openai/gpt-6-luna')
  })

  it('puts both fields, sending null to clear one', async () => {
    const fetchMock = stubFetch({ ...body, decisionModel: 'bedrock/x' })
    const result = await putFeatureModels({ scenarioAuthoringModel: null, decisionModel: 'bedrock/x' })
    const [, init] = fetchMock.mock.calls[0].arguments
    assert.equal(init?.method, 'PUT')
    assert.deepEqual(JSON.parse(init?.body as string), { scenarioAuthoringModel: null, decisionModel: 'bedrock/x' })
    assert.equal(result.decisionModel, 'bedrock/x')
  })

  it('raises the server code when the model is disabled', async () => {
    stubFetch({ code: 'llm_model_disabled', message: 'disabled' }, 400)
    await assert.rejects(putFeatureModels({ scenarioAuthoringModel: 'x', decisionModel: null }), {
      status: 400,
      code: 'llm_model_disabled',
    })
  })
})

describe('model route', () => {
  it('keeps the claude and gpt routes the server sends', () => {
    assert.equal(parseAdminLlmModel({ id: 'a', route: 'claude' }).route, 'claude')
    assert.equal(parseAdminLlmModel({ id: 'a', route: 'gpt' }).route, 'gpt')
  })
})

describe('TypeSafe key endpoints', () => {
  const body = { configured: true, maskedKey: '****abcd', updatedAt: '2026-10-15T00:00:00Z' }

  it('parses the status and falls back for a malformed body', () => {
    assert.deepEqual(parseTypesafeSettings(body), body)
    assert.deepEqual(parseTypesafeSettings({ configured: 'yes' }), { configured: false, maskedKey: null, updatedAt: null })
  })

  it('gets from the typesafe endpoint', async () => {
    const fetchMock = stubFetch(body)
    assert.equal((await getTypesafeSettings()).maskedKey, '****abcd')
    assert.equal(fetchMock.mock.calls[0].arguments[0], 'http://localhost:8080/api/admin/settings/typesafe')
  })

  it('puts the key, and null to delete it', async () => {
    const fetchMock = stubFetch({ configured: false, maskedKey: null, updatedAt: null })
    const result = await putTypesafeKey(null)
    const [, init] = fetchMock.mock.calls[0].arguments
    assert.equal(init?.method, 'PUT')
    assert.deepEqual(JSON.parse(init?.body as string), { apiKey: null })
    assert.equal(result.configured, false)
  })

  it('raises the server code on a bad key', async () => {
    stubFetch({ code: 'invalid_api_key', message: 'bad' }, 400)
    await assert.rejects(putTypesafeKey('x'), { status: 400, code: 'invalid_api_key' })
  })
})

describe('telemetry endpoints', () => {
  const body = {
    available: true,
    enabled: true,
    source: 'setting',
    installId: '0b0a1c52-0000-4000-8000-000000000000',
    lastSentDate: null,
  }

  it('reads the settings and reports unavailable when the server says so', async () => {
    const fetchMock = stubFetch(body)
    const result = await getTelemetrySettings()
    assert.equal(fetchMock.mock.calls[0].arguments[0], 'http://localhost:8080/api/admin/settings/telemetry')
    assert.deepEqual(result, body)
    assert.equal(parseTelemetrySettings({}).available, false)
    assert.equal(parseTelemetrySettings({ source: 'setting' }).source, 'setting')
    assert.equal(parseTelemetrySettings({}).source, 'environment')
  })

  it('puts only enabled when turning on', async () => {
    const fetchMock = stubFetch(body)
    await putTelemetryConsent(true)
    const [, init] = fetchMock.mock.calls[0].arguments
    assert.equal(init?.method, 'PUT')
    assert.deepEqual(JSON.parse(init?.body as string), { enabled: true })
  })

  it('passes deleteSentData when turning off', async () => {
    const fetchMock = stubFetch({ ...body, enabled: false })
    const result = await putTelemetryConsent(false, true)
    const [, init] = fetchMock.mock.calls[0].arguments
    assert.deepEqual(JSON.parse(init?.body as string), { enabled: false, deleteSentData: true })
    assert.equal(result.enabled, false)
  })

  it('pretty-prints the preview', async () => {
    const fetchMock = stubFetch({ schemaVersion: 1 })
    const json = await getTelemetryPreview()
    assert.equal(fetchMock.mock.calls[0].arguments[0], 'http://localhost:8080/api/admin/settings/telemetry/preview')
    assert.equal(json, '{\n  "schemaVersion": 1\n}')
  })
})
