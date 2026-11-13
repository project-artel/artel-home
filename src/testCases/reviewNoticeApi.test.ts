import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseReviewNotices, pendingReviewCount } from './reviewNoticeApi'

test('승인 대기 응답을 프로젝트별 건수로 읽고 이상한 줄은 버린다', () => {
  const notices = parseReviewNotices({
    items: [
      { projectId: '14', projectName: 'WordVenture', testCaseCount: 3, scenarioCount: 20 },
      { projectId: 15, projectName: '숫자 id' },
      null,
    ],
  })
  assert.deepEqual(notices, [{ projectId: '14', projectName: 'WordVenture', testCaseCount: 3, scenarioCount: 20 }])
  assert.equal(pendingReviewCount(notices), 23)
})

test('응답 모양이 다르면 빈 목록으로 읽는다', () => {
  assert.deepEqual(parseReviewNotices(null), [])
  assert.deepEqual(parseReviewNotices({ items: 'x' }), [])
})
