import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectApiError } from '../projects/projectApi'
import { settleReviews } from './reviewSelection'

test('끝낸 건과 바뀐 건, 실패를 세고 이미 처리된 건은 어디에도 넣지 않는다', async () => {
  const errors: Record<string, Error | undefined> = {
    ok: undefined,
    stale: new ProjectApiError(409, '바뀜', 'review_stale'),
    settled: new ProjectApiError(409, '처리됨', 'review_settled'),
    gone: new ProjectApiError(404, '없음'),
    broken: new ProjectApiError(500, '오류'),
  }
  const seen: string[] = []

  const outcome = await settleReviews(Object.keys(errors), async (item) => {
    seen.push(item)
    if (errors[item] !== undefined) throw errors[item]
  })

  assert.deepEqual(outcome, { done: 1, stale: 1, failed: 1 })
  assert.deepEqual([...seen].sort(), Object.keys(errors).sort())
})
