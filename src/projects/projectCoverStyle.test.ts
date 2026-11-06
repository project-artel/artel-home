import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { coverHue, initialOf } from './projectCoverStyle'

describe('project cover', () => {
  it('keeps the same hue for the same project and stays in range', () => {
    assert.equal(coverHue('42'), coverHue('42'))
    for (const id of ['1', '2', '7', 'abc', '999999']) {
      const hue = coverHue(id)
      assert.ok(hue >= 0 && hue < 360)
    }
  })

  it('spreads short numeric ids apart', () => {
    assert.notEqual(coverHue('2'), coverHue('3'))
  })

  it('takes the first letter, upper-cased, or # when empty', () => {
    assert.equal(initialOf('new world'), 'N')
    assert.equal(initialOf('  워드벤처'), '워')
    assert.equal(initialOf(''), '#')
  })
})
