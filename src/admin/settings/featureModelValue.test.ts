import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toModelId, toValue } from './featureModelValue'
import { JEV_MODEL_ID } from './settingsApi'

describe('toValue', () => {
  it('maps null to the default value', () => {
    assert.equal(toValue(null), '')
    assert.equal(toValue(null, true), '')
  })

  it('keeps Jev as an explicit choice outside the decision field', () => {
    assert.equal(toValue(JEV_MODEL_ID), JEV_MODEL_ID)
    assert.equal(toModelId(toValue(JEV_MODEL_ID)), JEV_MODEL_ID)
  })

  it('treats Jev as the default only for the decision field', () => {
    assert.equal(toValue(JEV_MODEL_ID, true), '')
  })

  it('keeps any other model id', () => {
    assert.equal(toValue('claude/sonnet', true), 'claude/sonnet')
  })
})
