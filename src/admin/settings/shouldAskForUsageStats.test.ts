import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldAskForUsageStats } from './shouldAskForUsageStats'
import type { TelemetrySettings } from './settingsApi'

function settings(overrides: Partial<TelemetrySettings>): TelemetrySettings {
  return { available: true, enabled: false, source: 'environment', installId: null, lastSentDate: null, ...overrides }
}

describe('shouldAskForUsageStats', () => {
  it('asks while nobody has decided', () => {
    assert.equal(shouldAskForUsageStats(settings({})), true)
  })

  it('does not ask when the server has no endpoint', () => {
    assert.equal(shouldAskForUsageStats(settings({ available: false })), false)
  })

  it('does not ask once an admin saved a choice, on or off', () => {
    assert.equal(shouldAskForUsageStats(settings({ source: 'setting', enabled: true })), false)
    assert.equal(shouldAskForUsageStats(settings({ source: 'setting', enabled: false })), false)
  })

  it('does not ask when the environment already turned it on', () => {
    assert.equal(shouldAskForUsageStats(settings({ enabled: true })), false)
  })
})
