/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { qaLogMessage } from './qaLogMessage'
import type { QaLog } from './qaTypes'

function verdict(payload: unknown, message = 'TC 20 → VERIFIED'): QaLog {
  return { id: '1', qaTryId: '11', type: 'CASE_VERDICT', direction: 'ORCHE_INTERNAL', payload,
    message, messageId: null, correlationId: null, createdAt: '2026-11-03T00:00:00Z' }
}
const label = (id: string) => id === '20' ? 'TC-014' : 'TC-…'

test('이전 판정 로그의 내부 ID를 프로젝트 번호로 표시하고 원본은 유지한다', () => {
  const log = verdict({ case_id: 20, verification_status: 'VERIFIED' })
  assert.equal(qaLogMessage(log, label), 'TC-014 → VERIFIED')
  assert.equal(log.message, 'TC 20 → VERIFIED')
  assert.deepEqual(log.payload, { case_id: 20, verification_status: 'VERIFIED' })
  assert.equal(qaLogMessage(verdict({ case_id: '20', verification_status: 'FAILED', case_number: '99' }), label), 'TC-014 → FAILED')
})

test('번호 조회 전에는 새 로그의 표시 번호만 사용하고 내부 ID로 번호를 만들지 않는다', () => {
  const pending = () => 'TC-…'
  assert.equal(qaLogMessage(verdict({ case_id: 20, verification_status: 'VERIFIED' }), pending), 'TC-… → VERIFIED')
  for (const number of ['14', '1000', '90071992547409931234']) {
    assert.equal(qaLogMessage(verdict({ case_id: 20, case_number: number, verification_status: 'VERIFIED' }), pending),
      `TC-${number.padStart(3, '0')} → VERIFIED`)
  }
  for (const number of [20, 0, '', '0', '-14', '1.5', 'TC-014', ' 14', 'abc']) {
    assert.equal(qaLogMessage(verdict({ case_id: 20, case_number: number, verification_status: 'VERIFIED' }), pending), 'TC-… → VERIFIED')
  }
})

test('수량과 임의 문장 및 상태가 없는 로그를 추정 변환하지 않는다', () => {
  const ordinary = { ...verdict({}), type: 'CHAT' as const, message: 'TC 20개와 TC 7을 확인' }
  assert.equal(qaLogMessage(ordinary, label), ordinary.message)
  const malformed = verdict({ case_id: 20 })
  assert.equal(qaLogMessage(malformed, label), malformed.message)
})
