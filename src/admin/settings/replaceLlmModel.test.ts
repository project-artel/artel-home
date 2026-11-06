import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { replaceLlmModel, type AdminLlmModel } from './settingsApi'

describe('replaceLlmModel', () => {
  it('replaces only the row with the same id', () => {
    const rows: AdminLlmModel[] = ['a', 'b'].map((id) => ({
      id,
      label: id,
      provider: 'x',
      route: 'openrouter',
      enabled: false,
      supportsVision: false,
      maxInputTokens: null,
      updatedAt: null,
    }))
    const next = replaceLlmModel(rows, { ...rows[0], enabled: true })
    assert.deepEqual(next.map((row) => row.enabled), [true, false])
    assert.equal(rows[0].enabled, false)
  })
})
