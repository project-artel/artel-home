import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setupGuideFrom } from './setupGuides'

describe('setupGuideFrom', () => {
  it('opens the ARTEL plugin page when the address names no guide', () => {
    assert.equal(setupGuideFrom(null), 'skills')
    assert.equal(setupGuideFrom('nope'), 'skills')
  })

  it('keeps a guide the address names', () => {
    assert.equal(setupGuideFrom('sdk'), 'sdk')
    assert.equal(setupGuideFrom('cli'), 'cli')
  })
})
