import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { getAttempt, subscribedProjects } from './evaluationApi'

const attempt = { id: 'attempt', qaTryId: '1', testCaseId: '42', startedAt: null, finishedAt: null, verdict: 'PASSED',
  logId: '1', review: null, note: null, createdAt: '2026-10-27T00:00:00Z' }

function respond(body: unknown) {
  return mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => body }) as Response)
}

afterEach(() => mock.restoreAll())

test('agent snapshot과 판정 이유를 검토 화면에 전달한다', async () => {
  respond({ ...attempt, originalReason: '버튼 클릭 후 화면 전환 확인', caseSnapshot: {
    scene: 'Title', precondition: '로그인 완료', test_step: '시작 버튼 클릭', expected: '게임 화면 표시',
  } })
  const result = await getAttempt('project', 'attempt')
  assert.equal(result.originalReason, '버튼 클릭 후 화면 전환 확인')
  assert.deepEqual(result.caseSnapshot, { scene: 'Title', precondition: '로그인 완료', step: '시작 버튼 클릭', expected: '게임 화면 표시' })
})

test('DB snapshot 필드를 지원하고 문자열이 아닌 값은 화면에 전달하지 않는다', async () => {
  respond({ ...attempt, caseSnapshot: { scene: {}, precondition: 3, step: '메뉴 열기', expected_value: '메뉴 표시' } })
  assert.deepEqual((await getAttempt('project', 'attempt')).caseSnapshot, { scene: null, precondition: null, step: '메뉴 열기', expected: '메뉴 표시' })
})

test('배열로 저장한 검증 절차와 expected_result를 표시한다', async () => {
  respond({ ...attempt, caseSnapshot: { steps: ['시작', '화면 관찰'], expected_result: '화면 변화 확인' } })
  assert.deepEqual((await getAttempt('project', 'attempt')).caseSnapshot, { scene: null, precondition: null, step: '시작\n화면 관찰', expected: '화면 변화 확인' })
})

test('snapshot이 없는 이전 응답도 검토할 수 있다', async () => {
  respond(attempt)
  const result = await getAttempt('project', 'attempt')
  assert.equal(result.caseSnapshot, null)
  assert.equal(result.originalReason, null)
})

test('평가와 구독 요청에 서버 주소를 한 번만 붙인다', async () => {
  const fetchMock = respond(attempt)
  await getAttempt('project', 'attempt')
  assert.equal(new URL(String(fetchMock.mock.calls[0].arguments[0])).pathname, '/api/projects/project/qa-evaluation/attempts/attempt')
  mock.restoreAll()
  const subscriptionFetch = respond(['project'])
  await subscribedProjects()
  assert.equal(new URL(String(subscriptionFetch.mock.calls[0].arguments[0])).pathname, '/api/qa-question-subscriptions')
})
