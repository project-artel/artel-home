import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleContext } from '../../i18n/LocaleContext'
import { messages } from '../../i18n/messages'
import { CaseAttemptPicker } from './CaseAttemptPicker'
import { VerdictPill } from './VerdictPill'
import { ContentReviewBadge } from './ContentReviewPanel'
import { contentReviews, getAttempt, issueHistory, type Attempt, type ContentReview } from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'
import { contentReviewVideoPath } from './contentReviewModel'

const row: ContentReview = { testCaseId: '4', state: 'NEEDS_REVISION', note: '피해 비교 기준이 없습니다.',
  logId: '8', attemptId: 'attempt-4', qaTryId: '6', qaRunId: '6', updatedAt: '2026-10-28T00:00:00Z', revisedAt: null, resolvedAt: null }
const attempt: Attempt = { id: 'attempt-4', qaTryId: '6', testCaseId: '4', startedAt: null, finishedAt: null,
  verdict: 'INCONCLUSIVE', logId: '8', review: 'TC_CONTENT_ISSUE', note: row.note, createdAt: row.updatedAt }
const respond = (body: unknown) => mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => body }) as Response)
afterEach(() => mock.restoreAll())

test('TC 내용 문제 평가는 agent 원본판정과 별개로 해석한다', async () => {
  respond(attempt)
  const result = await getAttempt('1', 'attempt-4')
  assert.equal(result.verdict, 'INCONCLUSIVE')
  assert.equal(result.review, 'TC_CONTENT_ISSUE')
  assert.equal(result.note, row.note)
  assert.match(renderToStaticMarkup(createElement(VerdictPill, { verdict: result.review, copy: evaluationCopy.ko, empty: 'unreviewed' })), /TC 내용 문제/)
  assert.match(renderToStaticMarkup(createElement(CaseAttemptPicker, { id: 'test', options: [result], current: result, onSelect: () => {}, copy: evaluationCopy.ko })), /판단 불가 → TC 내용 문제/)
})

test('내용 상태를 해석하고 알려지지 않은 상태는 정상으로 숨기지 않는다', async () => {
  respond([row])
  assert.deepEqual(await contentReviews('1', '4'), [row])
  mock.restoreAll()
  respond([{ ...row, state: 'MYSTERY' }])
  await assert.rejects(contentReviews('1'), /Invalid content review state/)
})

test('원본 영상 링크는 해당 attempt와 scenario를 함께 선택한다', () => {
  assert.equal(contentReviewVideoPath('1', row), '/projects/1/qa-history/6?attempt=attempt-4&scenario=6')
  assert.equal(contentReviewVideoPath('1', { ...row, qaRunId: null }), '/projects/1/test-cases?case=4&attempt=attempt-4')
  assert.equal(contentReviewVideoPath('1', { ...row, attemptId: null }), null)
})

test('수정·재검증 상태는 기존 게임 판정과 구분된 이름으로 표시한다', () => {
  for (const state of ['NEEDS_REVISION', 'NEEDS_REVALIDATION', 'READY'] as const) {
    const html = renderToStaticMarkup(createElement(LocaleContext.Provider, { value: { locale: 'ko', setLocale: () => {}, t: messages.ko } },
      createElement(ContentReviewBadge, { row: { ...row, state } })))
    assert.match(html, new RegExp(evaluationCopy.ko[state]))
    assert.doesNotMatch(html, /미검토|판단 불가/)
  }
})

test('TC 내용 문제로 바뀐 실패도 issue 이력을 읽을 수 있다', async () => {
  respond({ testCaseId: '4', previousIssueId: null, mergedInto: null, autoClosed: true, occurrences: [
    { attemptId: 'a', qaTryId: '6', qaRunId: '6', logId: '8', verdict: 'FAILED', review: 'TC_CONTENT_ISSUE', falsePositive: false, validFailure: false, finishedAt: row.updatedAt },
  ] })
  const history = await issueHistory('1', '2')
  assert.equal(history.occurrences[0].review, 'TC_CONTENT_ISSUE')
  assert.equal(history.occurrences[0].validFailure, false)
})
