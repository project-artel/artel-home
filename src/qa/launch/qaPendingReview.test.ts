import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toApiError } from '../../projects/projectApi'
import { pendingQaReview } from './qaPendingReview'

test('QA 시작을 막는 시나리오와 Test Case의 승인 버전을 읽는다', async () => {
  const updatedAt = '2026-11-13T06:30:00.123456Z'
  const pendingReview = {
    scenarios: [{ id: '9007199254740993', label: '튜토리얼', updatedAt }],
    cases: [{ id: '42', label: '시작 버튼 누르기', updatedAt }],
  }
  const error = await toApiError(Response.json({
    code: 'test_run_review_pending',
    pendingReview,
  }, { status: 409 }))
  assert.deepEqual(pendingQaReview(error), pendingReview)
})

test('승인할 항목의 버전이 없는 응답은 확인 창을 열지 않는다', async () => {
  const error = await toApiError(Response.json({
    code: 'test_run_review_pending',
    pendingReview: { scenarios: [{ id: '1', label: '튜토리얼' }], cases: [] },
  }, { status: 409 }))
  assert.equal(pendingQaReview(error), null)
})
