import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reliabilityDate, reliabilityRange } from './reliabilityRange'

test('한국 날짜의 자정 경계와 이전 30일을 계산한다', () => {
  const now = Date.parse('2026-10-26T15:00:00Z')
  assert.equal(reliabilityDate(0, now - 1), '2026-10-26')
  assert.equal(reliabilityDate(0, now), '2026-10-27')
  assert.equal(reliabilityDate(-30, now), '2026-09-27')
})

test('선택한 종료일을 포함하는 한국 자정 구간으로 조회한다', () => {
  assert.deepEqual(reliabilityRange('2026-10-27', '2026-10-27'), {
    from: '2026-10-26T15:00:00.000Z', to: '2026-10-27T15:00:00.000Z',
  })
  assert.deepEqual(reliabilityRange('2026-12-31', '2026-12-31'), {
    from: '2026-12-30T15:00:00.000Z', to: '2026-12-31T15:00:00.000Z',
  })
})
