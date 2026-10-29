import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { loadAttemptReview } from './loadAttemptReview'

const attempt = (id: string, review: string | null = null) => ({ id, qaTryId: '6', testCaseId: '42', startedAt: null, finishedAt: null, verdict: 'FAILED', logId: id, review, note: review ? '새 평가 이유' : null, createdAt: '2026-10-28T00:00:00Z' })
afterEach(() => mock.restoreAll())
test('첫 100개 밖의 직접 연결 시도를 평가한 뒤 다시 읽어 새 판정과 이유를 반영한다', async () => {
  let decision: string | null = null
  const calls: string[] = []
  mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    const path = String(url); calls.push(path)
    return new Response(JSON.stringify(path.includes('/attempts?') ? Array.from({ length: 100 }, (_, i) => attempt(String(i))) : attempt('old-link', decision)), { status: 200 })
  })
  const before = await loadAttemptReview('1', { qaTryId: '6' }, 'old-link')
  assert.equal(before.linkedAttempt?.review, null)
  decision = 'PASSED'
  const after = await loadAttemptReview('1', { qaTryId: '6' }, 'old-link')
  assert.equal(after.rows.length, 100)
  assert.equal(after.linkedAttempt?.review, 'PASSED')
  assert.equal(after.linkedAttempt?.note, '새 평가 이유')
  assert.equal(calls.filter(path => path.endsWith('/attempts/old-link')).length, 2)
})
test('목록 안의 선택 시도는 목록의 새 평가를 쓰고 다른 범위의 직접 링크는 제외한다', async () => {
  mock.method(globalThis, 'fetch', async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('/attempts?') ? [attempt('current', 'TC_CONTENT_ISSUE')] : { ...attempt('other'), qaTryId: '99' }), { status: 200 }))
  const current = await loadAttemptReview('1', { qaTryId: '6' }, 'current')
  assert.equal(current.rows[0].review, 'TC_CONTENT_ISSUE')
  assert.equal(current.linkedAttempt, null)
  assert.equal((await loadAttemptReview('1', { qaTryId: '6' }, 'other')).linkedAttempt, null)
})
