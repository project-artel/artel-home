import assert from 'node:assert/strict'
import test from 'node:test'
import { generationPercent, parseTestCaseGeneration, type TestCaseGeneration } from './testCaseGeneration'

const base = { state: 'RUNNING', phase: 'DRAFTING', startedAt: '2026-10-21T06:00:00Z', finishedAt: null, error: null }

test('parseTestCaseGeneration: 단계 · 진행을 읽고 넘친 분자는 분모로 자른다', () => {
  assert.deepEqual(parseTestCaseGeneration({ ...base, done: 2840, total: 7863 }), {
    state: 'RUNNING',
    phase: 'DRAFTING',
    done: 2840,
    total: 7863,
    startedAt: '2026-10-21T06:00:00Z',
    finishedAt: null,
    error: null,
  })
  assert.equal(parseTestCaseGeneration({ ...base, done: 9, total: 4 })?.done, 4)
  // 분모가 없는 단계는 둘 다 null 이다.
  assert.equal(parseTestCaseGeneration({ ...base, phase: 'READING_MAP', done: null, total: null })?.total, null)
})

test('parseTestCaseGeneration: 모르는 상태 · 단계 · 시작 시각이 없으면 null', () => {
  assert.equal(parseTestCaseGeneration(null), null)
  assert.equal(parseTestCaseGeneration({ ...base, state: 'PAUSED' }), null)
  assert.equal(parseTestCaseGeneration({ ...base, phase: 'EMBEDDING' }), null)
  assert.equal(parseTestCaseGeneration({ ...base, startedAt: null }), null)
})

function generation(overrides: Partial<TestCaseGeneration>): TestCaseGeneration {
  return { state: 'RUNNING', phase: 'DRAFTING', done: null, total: null, startedAt: base.startedAt, finishedAt: null, error: null, ...overrides }
}

test('generationPercent: 단계 몫 안에서 진행만큼 채우고 끝나기 전에는 100 이 아니다', () => {
  assert.equal(generationPercent(generation({ phase: 'READING_MAP' })), 0)
  assert.equal(generationPercent(generation({ done: 0, total: 100 })), 5)
  assert.equal(generationPercent(generation({ done: 50, total: 100 })), 40)
  assert.equal(generationPercent(generation({ phase: 'WRITING', done: 100, total: 100 })), 97)
  assert.equal(generationPercent(generation({ phase: 'CARRYING_OVER' })), 97)
  assert.equal(generationPercent(generation({ state: 'SUCCEEDED' })), 100)
})

test('generationPercent: 깨지거나 취소한 생성은 그리지 않는다', () => {
  assert.equal(generationPercent(generation({ state: 'FAILED' })), null)
  assert.equal(generationPercent(generation({ state: 'CANCELLED' })), null)
})
