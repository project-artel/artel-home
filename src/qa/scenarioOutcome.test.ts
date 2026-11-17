/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caseRatioOf, runCaseRatioOf } from './scenarioOutcome.ts'
import type { QaTry } from './qaTypes.ts'

const counted = (status: QaTry['status'], casesPassed: number | null, casesTotal: number | null) => ({
  status,
  casesPassed,
  casesTotal,
})

test('TC 하나만 실패한 시나리오는 실패가 아니라 통과 수와 비율로 보인다', () => {
  assert.deepEqual(caseRatioOf(counted('FAILED', 6, 7)), { passed: 6, total: 7, percent: 86, tone: 'partial' })
})

test('색은 히스토리 링과 같은 기준이다: 전부 통과 초록, 60% 이상 노랑, 그 아래 빨강', () => {
  assert.equal(caseRatioOf(counted('COMPLETED', 7, 7))?.tone, 'pass')
  assert.equal(caseRatioOf(counted('FAILED', 3, 5))?.tone, 'partial')
  assert.equal(caseRatioOf(counted('FAILED', 1, 5))?.tone, 'fail')
})

test('진행 중 · 취소 · 미판정이거나 판정한 TC 가 없으면 비율을 내지 않는다', () => {
  assert.equal(caseRatioOf(counted('RUNNING', 1, 5)), null)
  assert.equal(caseRatioOf(counted('CANCELLED', 1, 5)), null)
  assert.equal(caseRatioOf(counted('UNDECIDED', 1, 5)), null)
  assert.equal(caseRatioOf(counted('FAILED', null, null)), null)
  assert.equal(caseRatioOf(counted('COMPLETED', 0, 0)), null)
})

test('런 비율은 비율을 낼 수 있는 시나리오의 TC 를 합친다', () => {
  assert.deepEqual(runCaseRatioOf([counted('COMPLETED', 4, 4), counted('FAILED', 2, 3), counted('CANCELLED', 0, 2)]), {
    passed: 6,
    total: 7,
    percent: 86,
    tone: 'partial',
  })
  assert.equal(runCaseRatioOf([counted('FAILED', null, null)]), null)
})
