import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Counts, Reliability } from '../../../qa/evaluation/evaluationApi'
import { evaluationCopy } from '../../../qa/evaluation/evaluationCopy'
import { ReliabilityContent } from './DashboardReliability'
import { dashboardReliabilityRange, reliabilityDays, rateLines, reliabilityPercent } from './reliabilityModel'

const empty: Counts = { total: 0, reviewed: 0, inconclusiveReviews: 0, truePositives: 0, trueNegatives: 0, falsePositives: 0,
  falseNegatives: 0, interruptedFalseNegatives: 0, falsePositiveRate: null, falseNegativeRate: null, reviewCoverage: null }

test('선택 기간은 서울 날짜 기준 오늘 포함 정확히 7·30·90일이다', () => {
  for (const days of [7, 30, 90]) {
    const range = dashboardReliabilityRange(days, Date.parse('2026-10-27T15:01:00Z'))
    assert.equal(range.lastDay, '2026-10-28')
    assert.equal(Date.parse(range.to) - Date.parse(range.from), days * 86400000)
  }
  assert.equal(dashboardReliabilityRange(7, Date.parse('2026-10-27T14:59:00Z')).lastDay, '2026-10-27')
})

test('날짜가 없는 날은 검토0·rate null이고 실제0%는 유지한다', () => {
  const daily = [{ key: '2026-10-28', counts: { ...empty, total: 8, reviewed: 3, falsePositiveRate: 0, trueNegatives: 3 } },
    { key: '2026-10-26', counts: { ...empty, total: 4 } }]
  const rows = reliabilityDays(daily, '2026-10-26', '2026-10-28')
  assert.deepEqual(rows.map(r => [r.date, r.reviewed, r.fp, r.fn]), [
    ['2026-10-26', 0, null, null], ['2026-10-27', 0, null, null], ['2026-10-28', 3, 0, null],
  ])
  assert.equal(rows[2].fpSample, 3)
  assert.equal(daily[0].key, '2026-10-28')
  assert.equal(reliabilityPercent(null), '—')
  assert.equal(reliabilityPercent(0), '0.0%')
})

test('표본 없는 날은 선을 끊고 하루뿐인 값도 점으로 남긴다', () => {
  assert.deepEqual(rateLines([null, 0, .5, null, 1, null]), [
    [{ index: 1, value: 0 }, { index: 2, value: .5 }], [{ index: 4, value: 1 }],
  ])
  assert.deepEqual(rateLines([null, null]), [])
})

test('전체 시도와 검토0은 rate —로 표시하고 가짜 점을 만들지 않는다', () => {
  for (const total of [0, 5]) {
    const data: Reliability = { overall: { ...empty, total, reviewCoverage: total ? 0 : null }, daily: [], cases: [] }
    const html = renderToStaticMarkup(createElement(ReliabilityContent, { data, firstDay: '2026-10-27', lastDay: '2026-10-28', copy: evaluationCopy.ko }))
    assert.match(html, /검토 건수/)
    assert.match(html, /선택 편향/)
    assert.match(html, /<dd>0<small>전체 시도/)
    assert.doesNotMatch(html, /<circle/)
    assert.match(html, /<th scope="row">2026-10-27/)
  }
})

test('단일 날짜의 검토 건수와0%점·null미탐을 표와 그래프에 표시한다', () => {
  const counts = { ...empty, total: 25, reviewed: 4, trueNegatives: 3, inconclusiveReviews: 1, falsePositiveRate: 0, reviewCoverage: .16 }
  const data: Reliability = { overall: counts, daily: [{ key: '2026-10-28', counts }], cases: [] }
  const html = renderToStaticMarkup(createElement(ReliabilityContent, { data, firstDay: '2026-10-28', lastDay: '2026-10-28', copy: evaluationCopy.ko }))
  assert.match(html, /<dd>4<small>전체 시도 25/)
  assert.match(html, /16.0%/)
  assert.equal((html.match(/<circle /g) ?? []).length, 1)
  assert.match(html, /오탐률 0.0% · 0\/3/)
  assert.match(html, /<td>4<\/td><td>25<\/td>/)
})
