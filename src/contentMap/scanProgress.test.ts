import assert from 'node:assert/strict'
import test from 'node:test'
import type { LastScan } from './contentMapTypes'
import { scanPercent } from './scanProgress'

function scan(overrides: Partial<LastScan>): LastScan {
  return {
  state: 'REQUESTED',
  gameInstanceId: '1',
  gameInstanceName: 'Editor',
  requestedAt: '2026-10-21T00:00:00Z',
  finishedAt: null,
  ingestedDocuments: null,
  error: null,
  testCases: null,
  phase: 'SCANNING',
  progress: null,
  ...overrides,
  }
}

const withTestCases = { carryOver: false, state: 'PENDING', created: null, carriedOver: null, reason: null } as const

test('scanPercent: 씬 진행만큼 씬 몫을 채운다', () => {
  assert.equal(scanPercent(scan({ progress: { done: 0, total: 10, scene: 'Title' } })), 0)
  assert.equal(scanPercent(scan({ progress: { done: 5, total: 10, scene: 'Stage' } })), 45)
  assert.equal(scanPercent(scan({ progress: { done: 10, total: 10, scene: null } })), 90)
})

test('scanPercent: 단계가 바뀌면 그 단계의 앞 끝에서 시작한다', () => {
  assert.equal(scanPercent(scan({ phase: 'UPLOADING' })), 90)
  assert.equal(scanPercent(scan({ phase: 'UPLOADING', progress: { done: 2, total: 4, scene: null } })), 93)
  // 적재는 분모가 늘 1 이라 한 숫자에 서 있는다. 그래서 그 몫이 좁다.
  assert.equal(scanPercent(scan({ phase: 'INGESTING' })), 96)
})

test('scanPercent: TC 를 함께 만들면 TC 생성 단계가 끝에 붙고, 끝나기 전에는 100 이 아니다', () => {
  const testCases = { ...withTestCases, state: 'PENDING' as const }
  assert.equal(scanPercent(scan({ testCases, progress: { done: 10, total: 10, scene: null } })), 70)
  assert.equal(scanPercent(scan({ testCases, phase: 'GENERATING_TEST_CASES' })), 88)
  assert.equal(scanPercent(scan({ testCases, state: 'SUCCEEDED', phase: 'GENERATING_TEST_CASES' })), 100)
})

test('scanPercent: 옛 서버 · 깨진 스캔은 그리지 않는다', () => {
  assert.equal(scanPercent(scan({ phase: null })), null)
  assert.equal(scanPercent(scan({ state: 'FAILED', phase: 'SCANNING' })), null)
})
