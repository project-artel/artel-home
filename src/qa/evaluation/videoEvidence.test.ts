import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clipGaps, clipSegments, evidenceExpired } from './videoEvidence'
import type { Attempt, Playback, Segment } from './evaluationApi'

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 27, 0, 0, seconds)).toISOString()
const attempt: Attempt = { id: 'attempt', qaTryId: '1', testCaseId: '42', startedAt: at(55), finishedAt: at(65), createdAt: at(55), verdict: 'PASSED', logId: '1', review: null, note: null }
const segment = (id: string, from: number, to: number, state = 'READY'): Segment => ({ id, startedAt: at(from), endedAt: at(to), state, url: 'https://example.test/video' })

test('TC 시작 10초 전부터 보고 5초 후까지 segment 경계에서 자른다', () => {
  const result = clipSegments(attempt, [segment('a', 0, 60), segment('b', 60, 120)])
  assert.deepEqual(result.map(({ id, from, to }) => ({ id, from, to })), [
    { id: 'a', from: 45, to: 60 }, { id: 'b', from: 0, to: 10 },
  ])
})

test('만료·업로드 중인 영상과 검증 구간 밖의 영상을 제외한다', () => {
  assert.deepEqual(clipSegments(attempt, [segment('a', 0, 40), segment('b', 45, 70, 'UPLOADING'), segment('c', 45, 70, 'EXPIRED'), segment('d', 70, 120)]), [])
})

test('누락 구간도 해당 TC의 앞 10초와 뒤 5초 범위로 자른다', () => {
  assert.deepEqual(clipGaps(attempt, [
    { startedAt: at(0), endedAt: at(50), reason: 'VIDEO_MISSING' },
    { startedAt: at(68), endedAt: at(90), reason: 'UPLOAD_FAILED' },
    { startedAt: at(90), endedAt: at(100), reason: 'VIDEO_MISSING' },
  ]), [
    { startedAt: at(45), endedAt: at(50), reason: 'VIDEO_MISSING' },
    { startedAt: at(68), endedAt: at(70), reason: 'UPLOAD_FAILED' },
  ])
})

test('장기 대기 중인 QA도 해당 TC의 영상이 만료되면 삭제 상태로 표시한다', () => {
  const playback: Playback = { recording: { id: 'recording', startedAt: at(0), endedAt: null, expiresAt: null, error: null },
    segments: [segment('old', 0, 120, 'EXPIRED'), segment('later', 120, 180)], gaps: [] }
  assert.equal(evidenceExpired(attempt, playback, Date.parse(at(180))), true)
  assert.equal(evidenceExpired(attempt, { ...playback, segments: [] }, Date.parse(at(180))), false)
})

test('30일 경계를 넘으면 갱신 전에도 만료를 표시하고 일부 구간은 남아 있으면 재생한다', () => {
  const playback: Playback = { recording: null, segments: [segment('first', 0, 60), segment('second', 60, 120)], gaps: [] }
  const thirtyDays = 30 * 24 * 60 * 60 * 1000
  assert.equal(evidenceExpired(attempt, playback, Date.parse(at(90)) + thirtyDays), false)
  assert.equal(evidenceExpired(attempt, playback, Date.parse(at(120)) + thirtyDays), true)
})
