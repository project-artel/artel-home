import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { scrollToShow, windowRange } from './useRowWindow'

describe('windowRange', () => {
  it('renders the visible rows plus overscan and pads the rest', () => {
    const range = windowRange({ scrollTop: 470, viewport: 470, count: 2431, rowHeight: 47, overscan: 5 })
    // 첫 보이는 줄 10, 보이는 10줄, 앞뒤 5줄씩
    assert.deepEqual(range, { start: 5, end: 25, padTop: 5 * 47, padBottom: (2431 - 25) * 47 })
  })

  it('accounts for the table header above the rows', () => {
    const range = windowRange({ scrollTop: 40, viewport: 470, count: 100, rowHeight: 47, overscan: 0, headerHeight: 40 })
    assert.equal(range.start, 0)
  })

  it('clamps at both ends and handles an empty list', () => {
    assert.deepEqual(windowRange({ scrollTop: 0, viewport: 800, count: 3, rowHeight: 47, overscan: 12 }), {
      start: 0,
      end: 3,
      padTop: 0,
      padBottom: 0,
    })
    assert.deepEqual(windowRange({ scrollTop: 0, viewport: 800, count: 0, rowHeight: 47, overscan: 12 }), {
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    })
  })
})

describe('scrollToShow', () => {
  it('leaves a visible row alone', () => {
    assert.equal(scrollToShow({ index: 3, scrollTop: 0, viewport: 470, rowHeight: 47, headerHeight: 40 }), null)
  })

  it('scrolls down just enough for a row below', () => {
    assert.equal(scrollToShow({ index: 20, scrollTop: 0, viewport: 470, rowHeight: 47, headerHeight: 40 }), 40 + 21 * 47 - 470)
  })

  it('scrolls up so a row above sits under the header', () => {
    assert.equal(scrollToShow({ index: 2, scrollTop: 1000, viewport: 470, rowHeight: 47, headerHeight: 40 }), 2 * 47)
  })
})
