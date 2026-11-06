import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { UsageTotals } from './llmUsageTypes'
import { fillDays, isPartiallyPriced, share, sumTotals, totalTokens } from './usage'

function totals(overrides: Partial<UsageTotals> = {}): UsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    costUsd: null,
    calls: 0,
    pricedCalls: 0,
    ...overrides,
  }
}

describe('totalTokens', () => {
  it('leaves cached input and reasoning out of the sum', () => {
    // 둘 다 입력·출력의 부분집합이다. 더하면 같은 토큰을 두 번 세어 총량이 청구서와 안 맞는다.
    const row = totals({
      inputTokens: 1000,
      outputTokens: 100,
      cachedInputTokens: 800,
      reasoningTokens: 60,
    })

    assert.equal(totalTokens(row), 1100)
  })
})

describe('share', () => {
  it('reports no share instead of zero when nothing was spent', () => {
    // 0%로 쓰면 "안 썼다"와 "비중을 낼 수 없다"가 같은 글자가 된다.
    assert.equal(share(0, 0), null)
    assert.equal(share(0, 100), 0)
  })
})

describe('isPartiallyPriced', () => {
  it('marks a total that stands on fewer calls than it counts', () => {
    assert.equal(isPartiallyPriced(totals({ calls: 4, pricedCalls: 4 })), false)
    assert.equal(isPartiallyPriced(totals({ calls: 4, pricedCalls: 1 })), true)
  })
})

describe('sumTotals', () => {
  it('keeps the known spend when one row has no unit price', () => {
    const sum = sumTotals([
      totals({ inputTokens: 100, costUsd: 0.001, calls: 1, pricedCalls: 1 }),
      totals({ inputTokens: 200, costUsd: null, calls: 1, pricedCalls: 0 }),
    ])

    // "모른다" 한 줄이 합계를 통째로 null로 만들면 아는 지출까지 화면에서 사라진다.
    assert.equal(sum.costUsd, 0.001)
    assert.equal(sum.inputTokens, 300)
    assert.equal(sum.calls, 2)
    assert.equal(sum.pricedCalls, 1)
  })

  it('stays unknown when no row has a price', () => {
    const sum = sumTotals([totals({ costUsd: null }), totals({ costUsd: null })])

    // 여기서 0을 내면 "전부 단가 미상"이 "전부 공짜"로 읽힌다.
    assert.equal(sum.costUsd, null)
  })

  it('is unknown for an empty list', () => {
    assert.equal(sumTotals([]).costUsd, null)
    assert.equal(sumTotals([]).calls, 0)
  })
})

describe('fillDays', () => {
  it('inserts the days the server left out', () => {
    const filled = fillDays(
      [{ date: '2026-08-03', totals: totals({ inputTokens: 10 }) }],
      new Date(2026, 7, 1),
      new Date(2026, 7, 5),
    )

    // 빈 날을 건너뛰면 막대 간격이 시간 간격과 어긋나 추이가 실제보다 고르게 보인다.
    assert.deepEqual(filled.map((day) => day.date), [
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ])
    assert.equal(filled[0].totals, null)
    assert.equal(filled[2].totals?.inputTokens, 10)
  })

  it('treats `to` as exclusive, the way the query does', () => {
    const filled = fillDays([], new Date(2026, 7, 1), new Date(2026, 7, 2))

    assert.deepEqual(filled.map((day) => day.date), ['2026-08-01'])
  })
})
